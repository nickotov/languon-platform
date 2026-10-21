import {
    PortraitInterviewCompletedOperationSchema,
    PortraitInterviewActiveOperationSchema,
    PortraitInterviewLastAttemptSchema,
} from '@languon/contracts';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
    createDrizzleDatabase,
    createPostgresClient,
    type PostgresClient,
} from '@languon/database';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { DrizzlePortraitStore } from '../../../../src/modules/learner-portraits/infrastructure/persistence/drizzle/drizzle-portrait-store';
import {
    DrizzleInterviewStore,
    expireLearnerPortraitInterviews,
} from '../../../../src/modules/learner-portraits/infrastructure/persistence/drizzle/drizzle-interview-store';
import { InterviewService } from '../../../../src/modules/learner-portraits/application/interview-service';
import { PortraitService } from '../../../../src/modules/learner-portraits/application/portrait-service';
import {
    learnerPortraitInterviewOperationsTable as operations,
    learnerPortraitInterviewsTable as interviews,
} from '../../../../src/modules/learner-portraits/infrastructure/persistence/drizzle/schema';
import {
    eraseOwnerLearnerPortrait,
    portraitDeletionBusy,
    requestPortraitCancellation,
} from '../../../../src/modules/learner-portraits/infrastructure/persistence/drizzle/portrait-deletion-participant';
import {
    PortraitConflictError,
    PortraitUserUnavailableError,
} from '../../../../src/modules/learner-portraits/application/ports/portrait-store';
import {
    createTestPostgresClient,
    getTestDatabaseUrl,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

const run = describe.runIf(isDatabaseIntegrationEnabled());
run('learner portrait durable persistence', () => {
    let client: PostgresClient;
    let database: ReturnType<
        typeof createDrizzleDatabase<typeof databaseSchema>
    >;
    let service: PortraitService;
    let store: DrizzleInterviewStore;
    let ownerId: string;
    const now = () => new Date();
    beforeAll(async () => {
        client = createTestPostgresClient();
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
        database = createDrizzleDatabase(client, databaseSchema);
    }, 120000);
    afterAll(async () => {
        await client?.end();
    });
    beforeEach(async () => {
        const terminal = await database
            .select()
            .from(operations)
            .where(
                inArray(operations.state, ['succeeded', 'failed', 'cancelled']),
            )
            .orderBy(operations.id);
        await database
            .update(operations)
            .set({ state: 'cancelled', leaseUntil: null })
            .where(inArray(operations.state, ['queued', 'running']));
        if (terminal.length)
            expect(
                await database
                    .select()
                    .from(operations)
                    .where(
                        inArray(
                            operations.id,
                            terminal.map((row) => row.id),
                        ),
                    )
                    .orderBy(operations.id),
            ).toEqual(terminal);
        ownerId = randomUUID();
        await database
            .insert(usersTable)
            .values({ id: ownerId, status: 'active' });
        service = new PortraitService(new DrizzlePortraitStore(database));
        store = new DrizzleInterviewStore(database, async () => ({
            interviewCreditsBypass: true,
        }));
    });
    async function draft() {
        return service.saveDraft(ownerId, {
            expectedVersion: 0,
            baseApprovedVersion: 0,
            locale: 'en',
            items: {
                languages: [],
                explanationLanguages: [],
                goals: ['Travel'],
                accommodations: [],
                hobbies: [],
            },
        });
    }
    async function enqueue() {
        const state = await service.get(ownerId);
        const session = await store.start({
            ownerId,
            locale: 'en',
            expectedVersion: state.version,
            now: now(),
        });
        return store.enqueue({
            id: randomUUID(),
            ownerId,
            interviewId: session.interviewId,
            expectedVersion: state.version,
            expectedGeneration: state.generation,
            idempotencyKey: randomUUID(),
            input: {
                kind: 'chat',
                topic: 'goals',
                text: 'What does travel mean?',
            },
            now: now(),
            paidAcknowledged: false,
        });
    }
    it('migrates typed tables, checks and indexes', async () => {
        const rows =
            await client`select indexname from pg_indexes where tablename='learner_portrait_interview_operations'`;
        expect(rows.map((row) => row.indexname)).toContain(
            'portrait_operations_active_owner_unique',
        );
        const checks =
            await client`select conname from pg_constraint where conrelid='learner_portraits'::regclass`;
        expect(checks.map((row) => row.conname)).toContain(
            'learner_portraits_versions_check',
        );
    });
    it('serializes conflicting edits and approval without enabling usage', async () => {
        const results = await Promise.allSettled([draft(), draft()]);
        expect(
            results.filter((result) => result.status === 'fulfilled'),
        ).toHaveLength(1);
        const rejected = results.find((result) => result.status === 'rejected');
        expect(
            rejected?.status === 'rejected' && rejected.reason,
        ).toBeInstanceOf(PortraitConflictError);
        const approved = await service.approve(ownerId, {
            expectedVersion: 1,
            expectedApprovedVersion: 0,
        });
        expect(approved.approved?.items.goals).toEqual(['Travel']);
        expect(approved.useEnabled).toBe(false);
        expect(approved.draft).toBeNull();
    });
    it('never reads another owner operation and rejects deleted account access', async () => {
        const operation = await enqueue();
        const other = randomUUID();
        await database
            .insert(usersTable)
            .values({ id: other, status: 'active' });
        expect(await store.read(other, operation.id)).toBeNull();
        await database
            .update(usersTable)
            .set({ status: 'deletion_pending' })
            .where(eq(usersTable.id, ownerId));
        await expect(service.get(ownerId)).rejects.toBeInstanceOf(
            PortraitUserUnavailableError,
        );
    });
    it('replays admitted submissions and enforces one active response', async () => {
        const state = await service.get(ownerId),
            session = await store.start({
                ownerId,
                locale: 'en',
                expectedVersion: 0,
                now: now(),
            });
        let admissions = 0;
        store = new DrizzleInterviewStore(database, async () => {
            admissions++;
            return { interviewCreditsBypass: true };
        });
        const request = {
            id: randomUUID(),
            ownerId,
            interviewId: session.interviewId,
            expectedVersion: state.version,
            expectedGeneration: state.generation,
            idempotencyKey: randomUUID(),
            input: { kind: 'skip' as const, topic: 'goals' as const },
            now: now(),
            paidAcknowledged: false,
        };
        const admitted = await store.enqueue(request);
        expect((await store.enqueue(request)).id).toBe(admitted.id);
        expect(admissions).toBe(1);
        await expect(
            store.enqueue({
                ...request,
                id: randomUUID(),
                idempotencyKey: randomUUID(),
            }),
        ).rejects.toBeInstanceOf(PortraitConflictError);
    });
    it('does not complete a clarification topic and rejects post-delete output resurrection', async () => {
        await enqueue();
        const claim = await store.claim();
        expect(claim).not.toBeNull();
        if (!claim) return;
        await store.complete(
            claim,
            {
                message: 'Travel means everyday conversations abroad.',
                topic: 'goals',
                options: [],
                multiSelect: false,
            },
            now(),
        );
        const [session] = await database
            .select()
            .from(interviews)
            .where(eq(interviews.ownerId, ownerId));
        expect(session?.context.completedTopics).toEqual([]);
        const next = await enqueue();
        const nextClaim = await store.claim();
        expect(nextClaim?.id).toBe(next.id);
        if (!nextClaim) return;
        await service.delete(ownerId, { expectedVersion: 0, confirmed: true });
        await store.complete(
            nextClaim,
            {
                message: 'New profile',
                topic: 'goals',
                options: [],
                multiSelect: false,
            },
            now(),
        );
        expect((await service.get(ownerId)).approved).toBeNull();
        expect(await store.read(ownerId, next.id)).toBeNull();
        expect(
            await database
                .select()
                .from(interviews)
                .where(eq(interviews.ownerId, ownerId)),
        ).toHaveLength(0);
    });
    it('expires draft and transcript at 14 inactive days but preserves approval', async () => {
        await draft();
        await service.approve(ownerId, {
            expectedVersion: 1,
            expectedApprovedVersion: 0,
        });
        const state = await service.get(ownerId);
        await store.start({
            ownerId,
            locale: 'en',
            expectedVersion: state.version,
            now: now(),
        });
        await database
            .update(interviews)
            .set({ expiresAt: new Date(Date.now() - 1) })
            .where(eq(interviews.ownerId, ownerId));
        expect(await expireLearnerPortraitInterviews(database)).toBeGreaterThan(
            0,
        );
        expect((await service.get(ownerId)).approved?.items.goals).toEqual([
            'Travel',
        ]);
        expect(
            await database
                .select()
                .from(interviews)
                .where(eq(interviews.ownerId, ownerId)),
        ).toHaveLength(0);
    });
    it('rolls back admission and persisted operation together on failure', async () => {
        store = new DrizzleInterviewStore(database, async () => {
            throw new Error('unavailable');
        });
        await expect(enqueue()).rejects.toThrow('unavailable');
        expect(
            await database
                .select()
                .from(operations)
                .where(eq(operations.ownerId, ownerId)),
        ).toHaveLength(0);
    });
    it('cancels queued work immediately and exposes cancellation without dispatch', async () => {
        const admitted = await enqueue();
        await store.stop(ownerId, admitted.id, now());
        expect((await store.read(ownerId, admitted.id))?.state).toBe(
            'cancelled',
        );
        expect(await store.claim()).toBeNull();
    });
    it('settles expired leases through recovery and never re-dispatches the call', async () => {
        const admitted = await enqueue();
        const claim = await store.claim();
        expect(claim?.id).toBe(admitted.id);
        await database
            .update(operations)
            .set({ leaseUntil: new Date(Date.now() - 1) })
            .where(eq(operations.id, admitted.id));
        const recovered: string[] = [];
        const recoveryStore = new DrizzleInterviewStore(
            database,
            async () => ({}),
            async (_tx, id) => {
                recovered.push(id);
            },
        );
        expect(await recoveryStore.claim()).toBeNull();
        expect(recovered).toEqual([admitted.id]);
        expect((await store.read(ownerId, admitted.id))?.state).toBe('failed');
        await expect(
            store.complete(
                claim!,
                {
                    message: 'Late',
                    topic: 'goals',
                    options: [],
                    multiSelect: false,
                },
                now(),
            ),
        ).rejects.toBeInstanceOf(PortraitConflictError);
    });
    it('preserves locale on resume and explicit locale edits refresh inactivity', async () => {
        const state = await service.get(ownerId);
        const session = await store.start({
            ownerId,
            locale: 'en',
            expectedVersion: state.version,
            now: now(),
        });
        const at = new Date(Date.now() + 10000);
        const switched = await store.setLocale({
            ownerId,
            interviewId: session.interviewId,
            locale: 'es',
            expectedVersion: state.version,
            now: at,
        });
        expect(switched.context.locale).toBe('es');
        expect(Date.parse(switched.expiresAt)).toBe(
            at.getTime() + 14 * 86400_000,
        );
        expect(
            (
                await store.start({
                    ownerId,
                    locale: 'en',
                    expectedVersion: state.version,
                    now: at,
                })
            ).context.locale,
        ).toBe('es');
    });
    it.each(['approve', 'discard', 'delete'] as const)(
        'erases content-derived fingerprints during %s while preserving running settlement identities',
        async (action) => {
            await draft();
            const admitted = await enqueue();
            const claim = await store.claim();
            expect(claim?.id).toBe(admitted.id);
            if (action === 'approve')
                await service.approve(ownerId, {
                    expectedVersion: 1,
                    expectedApprovedVersion: 0,
                });
            if (action === 'discard')
                await service.discardInterview(ownerId, { expectedVersion: 1 });
            if (action === 'delete')
                await service.delete(ownerId, {
                    expectedVersion: 1,
                    confirmed: true,
                });
            const [row] = await database
                .select()
                .from(operations)
                .where(eq(operations.id, admitted.id));
            expect(row?.fingerprint).toBe('erased');
            expect(row?.input).toEqual({ kind: 'skip', topic: 'update' });
            expect(row?.context).toEqual({
                locale: 'en',
                approvedItems: null,
                draftItems: null,
                messages: [],
                completedTopics: [],
            });
            expect(row?.result).toBeNull();
            expect(row?.state).toBe('running');
            expect(row?.execution).toEqual({ interviewCreditsBypass: true });
        },
    );
    it('purges queued work without requiring a worker or retaining content hashes', async () => {
        await draft();
        await enqueue();
        await database.transaction((tx) =>
            requestPortraitCancellation(tx, ownerId),
        );
        expect(
            await database
                .select()
                .from(operations)
                .where(eq(operations.ownerId, ownerId)),
        ).toHaveLength(0);
        await database
            .update(usersTable)
            .set({ status: 'deletion_pending' })
            .where(eq(usersTable.id, ownerId));
        await database.transaction(async (tx) => {
            expect(await portraitDeletionBusy(tx, ownerId)).toBe(false);
            await eraseOwnerLearnerPortrait(tx, ownerId, now());
        });
    });
    it('account purge recovers expired running work without an interview worker and respects live leases', async () => {
        const admitted = await enqueue();
        const claim = await store.claim();
        expect(claim?.id).toBe(admitted.id);
        await database
            .update(usersTable)
            .set({ status: 'deletion_pending' })
            .where(eq(usersTable.id, ownerId));
        await database.transaction((tx) =>
            requestPortraitCancellation(tx, ownerId),
        );
        expect(
            await database.transaction((tx) =>
                portraitDeletionBusy(tx, ownerId),
            ),
        ).toBe(true);
        await database
            .update(operations)
            .set({ leaseUntil: new Date(Date.now() - 1) })
            .where(eq(operations.id, admitted.id));
        await database.transaction(async (tx) => {
            expect(await portraitDeletionBusy(tx, ownerId)).toBe(false);
            await eraseOwnerLearnerPortrait(tx, ownerId, now());
        });
        expect(
            await database
                .select()
                .from(operations)
                .where(eq(operations.id, admitted.id)),
        ).toHaveLength(0);
        expect(
            await database
                .select()
                .from(interviews)
                .where(eq(interviews.ownerId, ownerId)),
        ).toHaveLength(0);
    });
    it('recovers and erases under the deployment purge role without reading private payloads', async () => {
        await draft();
        const admitted = await enqueue();
        expect((await store.claim())?.id).toBe(admitted.id);
        await database
            .update(operations)
            .set({ leaseUntil: new Date(Date.now() - 1) })
            .where(eq(operations.id, admitted.id));
        await database
            .update(usersTable)
            .set({ status: 'deletion_pending' })
            .where(eq(usersTable.id, ownerId));
        const role = `portrait_purge_test_${randomUUID().replaceAll('-', '')}`;
        const script = await readFile(
            new URL(
                '../../../../../../infra/deploy/sql/account-purge-worker-role.sql',
                import.meta.url,
            ),
            'utf8',
        );
        await client.unsafe(`create role ${role}`);
        const restricted = createPostgresClient({
            databaseUrl: getTestDatabaseUrl(),
            maxConnections: 1,
        });
        try {
            await client.unsafe(
                script
                    .split('\n')
                    .filter((line) => !line.startsWith('\\'))
                    .join('\n')
                    .replaceAll(':"account_purge_role"', role),
            );
            await restricted.unsafe(`set role ${role}`);
            for (const column of [
                'input',
                'context',
                'result',
                'fingerprint',
                'lease_token',
            ])
                await expect(
                    restricted.unsafe(
                        `select ${column} from learner_portrait_interview_operations`,
                    ),
                ).rejects.toThrow();
            await expect(
                restricted.unsafe(
                    'select context from learner_portrait_interviews',
                ),
            ).rejects.toThrow();
            await expect(
                restricted.unsafe('select state from learner_portraits'),
            ).rejects.toThrow();
            const restrictedDatabase = createDrizzleDatabase(
                restricted,
                databaseSchema,
            );
            await restrictedDatabase.transaction(async (tx) => {
                await requestPortraitCancellation(tx, ownerId);
                expect(await portraitDeletionBusy(tx, ownerId)).toBe(false);
                await eraseOwnerLearnerPortrait(tx, ownerId, now());
            });
            expect(
                await database
                    .select()
                    .from(operations)
                    .where(eq(operations.id, admitted.id)),
            ).toHaveLength(0);
            expect(
                await database
                    .select()
                    .from(interviews)
                    .where(eq(interviews.ownerId, ownerId)),
            ).toHaveLength(0);
            expect(
                (
                    await database.execute(
                        sql`select 1 from learner_portraits where owner_id=${ownerId}::uuid`,
                    )
                ).length,
            ).toBe(0);
        } finally {
            await restricted.unsafe('reset role');
            await restricted.end();
            await client.unsafe(`drop owned by ${role}`);
            await client.unsafe(`drop role ${role}`);
        }
    });
    it('discovers only live owner metadata without starting or extending an interview', async () => {
        expect(await store.status(ownerId, now())).toBeNull();
        const session = await store.start({
            ownerId,
            locale: 'fr',
            expectedVersion: 0,
            now: now(),
        });
        const [before] = await database
            .select()
            .from(interviews)
            .where(eq(interviews.id, session.interviewId));
        expect(await store.status(ownerId, now())).toEqual({
            id: session.interviewId,
            locale: 'fr',
            expiresAt: session.expiresAt,
        });
        const [after] = await database
            .select()
            .from(interviews)
            .where(eq(interviews.id, session.interviewId));
        expect(after).toEqual(before);
        await expect(store.status(randomUUID(), now())).rejects.toBeInstanceOf(
            PortraitUserUnavailableError,
        );
        expect(
            await store.status(
                ownerId,
                new Date(Date.parse(session.expiresAt) + 1),
            ),
        ).toBeNull();
    });
    it('persists requested locale at admission and preserves a later explicit selection', async () => {
        const session = await store.start({
            ownerId,
            locale: 'en',
            expectedVersion: 0,
            now: now(),
        });
        const admitted = await store.enqueue({
            id: randomUUID(),
            ownerId,
            interviewId: session.interviewId,
            expectedVersion: 0,
            expectedGeneration: 0,
            idempotencyKey: randomUUID(),
            input: {
                kind: 'chat',
                topic: 'goals',
                text: 'Habla español',
                requestedLocale: 'es',
            },
            now: now(),
            paidAcknowledged: false,
        });
        expect(admitted.context.locale).toBe('es');
        expect(
            (
                await store.start({
                    ownerId,
                    locale: 'en',
                    expectedVersion: 0,
                    now: now(),
                })
            ).context.locale,
        ).toBe('es');
        const claim = await store.claim();
        expect(claim?.id).toBe(admitted.id);
        if (!claim) return;
        await store.complete(
            claim,
            {
                message: '¿Qué quieres aprender?',
                topic: 'goals',
                options: [],
                multiSelect: false,
            },
            now(),
        );
        expect(
            (
                await store.start({
                    ownerId,
                    locale: 'en',
                    expectedVersion: 0,
                    now: now(),
                })
            ).context.locale,
        ).toBe('es');
        await store.enqueue({
            id: randomUUID(),
            ownerId,
            interviewId: session.interviewId,
            expectedVersion: 0,
            expectedGeneration: 0,
            idempotencyKey: randomUUID(),
            input: {
                kind: 'chat',
                topic: 'goals',
                text: 'Continúa',
                requestedLocale: 'es',
            },
            now: now(),
            paidAcknowledged: false,
        });
        const second = await store.claim();
        expect(second).not.toBeNull();
        if (!second) return;
        await store.setLocale({
            ownerId,
            interviewId: session.interviewId,
            locale: 'fr',
            expectedVersion: 0,
            now: now(),
        });
        await store.complete(
            second,
            {
                message: '¿Prefieres ejemplos?',
                topic: 'style',
                options: [],
                multiSelect: false,
                locale: 'es',
            },
            now(),
        );
        expect(
            (
                await store.start({
                    ownerId,
                    locale: 'en',
                    expectedVersion: 0,
                    now: now(),
                })
            ).context.locale,
        ).toBe('fr');
    });
    it('resumes the latest question and options across devices without resetting after a failed reply', async () => {
        const admitted = await enqueue();
        const claim = await store.claim();
        expect(claim?.id).toBe(admitted.id);
        if (!claim) return;
        const latest = {
            message: 'Which explanation style helps you?',
            topic: 'style' as const,
            options: [
                { id: 'examples-first', label: 'Examples first' },
                { id: 'theory-first', label: 'Theory first' },
            ],
            multiSelect: false,
        };
        await store.complete(claim, latest, now());
        const resumedService = new InterviewService(
            new DrizzleInterviewStore(database, async () => ({
                interviewCreditsBypass: true,
            })),
        );
        const resumed = await resumedService.start(
            ownerId,
            { locale: 'en', expectedVersion: 0 },
            now(),
        );
        expect(resumed.interviewId).toBe(admitted.interviewId);
        expect(resumed.initialQuestion).toEqual(latest);
        expect(resumed.context.messages.at(-1)?.content).toBe(latest.message);
        await store.enqueue({
            id: randomUUID(),
            ownerId,
            interviewId: admitted.interviewId,
            expectedVersion: 0,
            expectedGeneration: 0,
            idempotencyKey: randomUUID(),
            input: { kind: 'chat', topic: 'style', text: 'Tell me more' },
            now: now(),
            paidAcknowledged: false,
        });
        const failed = await store.claim();
        expect(failed).not.toBeNull();
        if (!failed) return;
        await store.fail(failed, 'generation_failed', now());
        expect(
            (
                await resumedService.start(
                    ownerId,
                    { locale: 'en', expectedVersion: 0 },
                    now(),
                )
            ).initialQuestion,
        ).toEqual(latest);
    });
    it('restores a safe active response handle for queued and running reconnects', async () => {
        const admitted = await enqueue();
        const service = new InterviewService(store);
        const queued = await service.start(ownerId, {
            locale: 'en',
            expectedVersion: 0,
        });
        expect(queued.activeOperation).toEqual({
            id: admitted.id,
            interviewId: admitted.interviewId,
            state: 'queued',
            result: null,
            errorCode: null,
        });
        expect(
            PortraitInterviewActiveOperationSchema.safeParse(
                queued.activeOperation,
            ).success,
        ).toBe(true);
        expect(Object.keys(queued.activeOperation ?? {}).sort()).toEqual([
            'errorCode',
            'id',
            'interviewId',
            'result',
            'state',
        ]);
        const claim = await store.claim();
        expect(claim?.id).toBe(admitted.id);
        if (!claim) return;
        expect(
            (await service.start(ownerId, { locale: 'en', expectedVersion: 0 }))
                .activeOperation?.state,
        ).toBe('running');
        expect((await service.stop(ownerId, admitted.id))?.state).toBe(
            'cancelled',
        );
        await store.fail(claim, 'cancelled', now());
        expect((await service.read(ownerId, admitted.id))?.state).toBe(
            'cancelled',
        );
        expect(
            (await service.start(ownerId, { locale: 'en', expectedVersion: 0 }))
                .activeOperation,
        ).toBeUndefined();
    });
    it('refreshes edited portrait items on resume without extending expiry or restoring stale proposals', async () => {
        const original = await draft();
        const admitted = await enqueue();
        const claim = await store.claim();
        expect(claim?.id).toBe(admitted.id);
        if (!claim) return;
        const question = {
            message: 'Choose a style',
            topic: 'style' as const,
            options: [{ id: 'examples-first', label: 'Examples first' }],
            multiSelect: false,
        };
        await store.complete(
            claim,
            {
                ...question,
                proposedItems: original.draft!.items,
                answerSummary: 'Travel',
            },
            now(),
        );
        const fresh = await new InterviewService(store).start(ownerId, {
            locale: 'en',
            expectedVersion: 1,
        });
        expect(fresh.latestCompletedOperation?.result.proposedItems).toEqual(
            original.draft!.items,
        );
        expect(fresh.latestCompletedOperation?.result.answerSummary).toBe(
            'Travel',
        );
        expect(fresh.latestCompletedOperation?.stale).toBe(false);
        expect(fresh.latestCompletedOperation?.baseVersion).toBe(1);
        expect(fresh.latestCompletedOperation?.baseGeneration).toBe(0);
        expect(
            PortraitInterviewCompletedOperationSchema.safeParse(
                fresh.latestCompletedOperation,
            ).success,
        ).toBe(true);
        expect(
            Object.keys(fresh.latestCompletedOperation ?? {}).sort(),
        ).toEqual([
            'baseGeneration',
            'baseVersion',
            'errorCode',
            'id',
            'interviewId',
            'result',
            'stale',
            'state',
        ]);
        const changedAt = new Date(Date.now() + 1000);
        const edited = await service.saveDraft(
            ownerId,
            {
                expectedVersion: 1,
                baseApprovedVersion: 0,
                locale: 'en',
                items: { ...original.draft!.items, goals: ['Work'] },
            },
            changedAt,
        );
        const [before] = await database
            .select({
                expiresAt: interviews.expiresAt,
                updatedAt: interviews.updatedAt,
            })
            .from(interviews)
            .where(eq(interviews.id, admitted.interviewId));
        const resumedService = new InterviewService(store);
        const resumed = await resumedService.start(
            ownerId,
            { locale: 'en', expectedVersion: edited.version },
            new Date(changedAt.getTime() + 5000),
        );
        expect(resumed.context.draftItems?.goals).toEqual(['Work']);
        expect(resumed.context.approvedItems).toBeNull();
        expect(resumed.initialQuestion).toEqual(question);
        expect(resumed.latestCompletedOperation?.stale).toBe(true);
        expect(
            resumed.latestCompletedOperation?.result.proposedItems?.goals,
        ).toEqual(['Travel']);
        expect(resumed.latestCompletedOperation?.result.answerSummary).toBe(
            'Travel',
        );
        expect(resumed.latestCompletedOperation?.baseVersion).toBe(1);
        expect(resumed.latestCompletedOperation?.baseGeneration).toBe(0);
        const [after] = await database
            .select({
                expiresAt: interviews.expiresAt,
                updatedAt: interviews.updatedAt,
                context: interviews.context,
            })
            .from(interviews)
            .where(eq(interviews.id, admitted.interviewId));
        expect(after?.expiresAt).toEqual(before?.expiresAt);
        expect(after?.updatedAt).toEqual(before?.updatedAt);
        expect(after?.context.draftItems?.goals).toEqual(['Work']);
        expect((await service.get(ownerId)).draft?.baseApprovedVersion).toBe(0);
        const approved = await service.approve(ownerId, {
            expectedVersion: edited.version,
            expectedApprovedVersion: 0,
        });
        const restarted = await resumedService.start(ownerId, {
            locale: 'en',
            expectedVersion: approved.version,
        });
        expect(restarted.interviewId).not.toBe(admitted.interviewId);
        expect(restarted.context.approvedItems?.goals).toEqual(['Work']);
        expect(restarted.context.draftItems).toBeNull();
    });
    it('explicitly erases portraits for retained user tombstones', async () => {
        await draft();
        await service.approve(ownerId, {
            expectedVersion: 1,
            expectedApprovedVersion: 0,
        });
        await database.transaction((tx) =>
            eraseOwnerLearnerPortrait(tx, ownerId, now()),
        );
        expect(
            (
                await database.execute(
                    sql`select 1 from learner_portraits where owner_id=${ownerId}::uuid`,
                )
            ).length,
        ).toBe(0);
        expect(
            await database
                .select()
                .from(usersTable)
                .where(eq(usersTable.id, ownerId)),
        ).toHaveLength(1);
    });
    it('recovers only the latest failed or cancelled owner input without execution metadata', async () => {
        const admitted = await enqueue();
        const claim = await store.claim();
        expect(claim?.id).toBe(admitted.id);
        await store.fail(claim!, 'provider_unavailable', now());
        const response = await store.start({
            ownerId,
            locale: 'en',
            expectedVersion: 0,
            now: now(),
        });
        expect(
            PortraitInterviewLastAttemptSchema.parse(response.lastAttempt),
        ).toEqual({
            id: admitted.id,
            interviewId: admitted.interviewId,
            state: 'failed',
            input: admitted.input,
            errorCode: 'provider_unavailable',
            baseVersion: 0,
            baseGeneration: 0,
            stale: false,
        });
        expect(Object.keys(response.lastAttempt!)).not.toContain('execution');
        expect(Object.keys(response.lastAttempt!)).not.toContain('context');
        expect(Object.keys(response.lastAttempt!)).not.toContain('ownerId');
        expect(response.context.messages).toEqual([]);
        const otherId = randomUUID();
        await database
            .insert(usersTable)
            .values({ id: otherId, status: 'active' });
        expect(
            (
                await store.start({
                    ownerId: otherId,
                    locale: 'en',
                    expectedVersion: 0,
                    now: now(),
                })
            ).lastAttempt,
        ).toBeUndefined();
        const retry = await store.enqueue({
            id: randomUUID(),
            ownerId,
            interviewId: admitted.interviewId,
            expectedVersion: 0,
            expectedGeneration: 0,
            idempotencyKey: randomUUID(),
            input: {
                kind: 'answer',
                topic: 'goals',
                selected: ['Work'],
                text: 'Meetings',
            },
            paidAcknowledged: false,
            now: new Date(Date.now() + 100),
        });
        expect(
            (
                await store.start({
                    ownerId,
                    locale: 'en',
                    expectedVersion: 0,
                    now: now(),
                })
            ).lastAttempt,
        ).toBeUndefined();
        await store.stop(ownerId, retry.id, now());
        const cancelled = await store.start({
            ownerId,
            locale: 'en',
            expectedVersion: 0,
            now: now(),
        });
        expect(cancelled.lastAttempt?.state).toBe('cancelled');
        expect(cancelled.lastAttempt?.input).toEqual(retry.input);
        const edited = await draft();
        expect(
            (
                await store.start({
                    ownerId,
                    locale: 'en',
                    expectedVersion: edited.version,
                    now: now(),
                })
            ).lastAttempt?.stale,
        ).toBe(true);
        const next = await store.enqueue({
            id: randomUUID(),
            ownerId,
            interviewId: admitted.interviewId,
            expectedVersion: edited.version,
            expectedGeneration: edited.generation,
            idempotencyKey: randomUUID(),
            input: { kind: 'chat', topic: 'style', text: 'Keep it concise' },
            paidAcknowledged: false,
            now: new Date(Date.now() + 200),
        });
        const nextClaim = await store.claim();
        expect(nextClaim?.id).toBe(next.id);
        await store.complete(
            nextClaim!,
            {
                message: 'Understood. What else helps?',
                topic: 'accommodations',
                options: [],
                multiSelect: true,
            },
            now(),
        );
        expect(
            (
                await store.start({
                    ownerId,
                    locale: 'en',
                    expectedVersion: edited.version,
                    now: now(),
                })
            ).lastAttempt,
        ).toBeUndefined();
    });
    it.each(['approve', 'discard', 'delete', 'expire'] as const)(
        'erases recoverable failed input after %s',
        async (action) => {
            const state = await draft();
            const admitted = await enqueue();
            const claim = await store.claim();
            await store.fail(claim!, 'generation_failed', now());
            expect(
                (
                    await store.start({
                        ownerId,
                        locale: 'en',
                        expectedVersion: state.version,
                        now: now(),
                    })
                ).lastAttempt?.input,
            ).toEqual(admitted.input);
            if (action === 'approve')
                await service.approve(ownerId, {
                    expectedVersion: state.version,
                    expectedApprovedVersion: state.approvedVersion,
                });
            if (action === 'discard')
                await service.discardInterview(ownerId, {
                    expectedVersion: state.version,
                });
            if (action === 'delete')
                await service.delete(ownerId, {
                    expectedVersion: state.version,
                    confirmed: true,
                });
            if (action === 'expire')
                await expireLearnerPortraitInterviews(
                    database,
                    new Date(Date.now() + 15 * 86400_000),
                );
            expect(await store.status(ownerId, now())).toBeNull();
            expect(await store.read(ownerId, admitted.id)).toBeNull();
            expect(
                await database
                    .select()
                    .from(interviews)
                    .where(eq(interviews.ownerId, ownerId)),
            ).toHaveLength(0);
        },
    );
});
