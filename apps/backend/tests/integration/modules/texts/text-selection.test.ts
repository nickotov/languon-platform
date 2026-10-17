import {
    textFoldersTable,
    textsTable,
    textSharesTable,
} from '../../../../src/modules/texts/infrastructure/persistence/drizzle/schema';
import { readFile } from 'node:fs/promises';
import type { SelectionDatabase } from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/text-selection-target';
import { randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { DrizzleTextSelectionStore } from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-text-selection-store';
import { dictionaryTextSelectionJobsTable as jobs } from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/selection-card-schema';
import {
    dictionariesTable,
    dictionaryCardsTable,
    dictionaryCardRevisionsTable,
    dictionarySettingsTable,
} from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import { DrizzleAiCreditTransactionParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { aiCreditReservationsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/schema';
import { textAiModelCatalog } from '../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import {
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
    dictionaryAiWorkerObservationsTable,
} from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { textsExecutionObservationId } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness';
import {
    segmentText,
    validateTranslation,
} from '../../../../src/modules/texts/domain/text';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';
import type { TextSelectionRequest } from '@languon/contracts';
import type { DictionaryCardAuthoringProviderDelta } from '../../../../src/modules/dictionaries/domain/card-authoring';

const run = describe.runIf(isDatabaseIntegrationEnabled());
run('Dictionary vocabulary selection durable persistence', () => {
    let client: PostgresClient;
    let db: ReturnType<typeof createDrizzleDatabase<typeof databaseSchema>>;
    let store: DrizzleTextSelectionStore;
    let options: ConstructorParameters<typeof DrizzleTextSelectionStore>[1];
    let owner: string;
    let now: Date;
    let sourceAvailable: boolean;
    const source = segmentText('Hello world. Next sentence.', 'en', randomUUID);
    const alignment = validateTranslation(
        source,
        source.map((p) => ({
            pairId: p.pairId,
            text: p.text.includes('Hello')
                ? 'Hola mundo. '
                : 'Siguiente frase.',
        })),
    );
    const proposalId = randomUUID();
    const delta: DictionaryCardAuthoringProviderDelta = {
        sourceResult: { kind: 'unchanged' },
        suggestions: [
            { field: 'translation', value: 'hola' },
            { field: 'definition', value: 'A greeting' },
            { field: 'example', value: 'Hello, friend.' },
            { field: 'exampleTranslation', value: 'Hola, amigo.' },
        ],
    };
    beforeAll(async () => {
        client = createTestPostgresClient();
        db = createDrizzleDatabase(client, databaseSchema);
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
    }, 120000);
    beforeEach(async () => {
        // Each test owns its disposable database and migrates a clean baseline, including
        // deferred credit guards, rather than deleting retained accounting ledgers.
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
        now = new Date('2026-10-15T12:00:00Z');
        sourceAvailable = true;
        owner = randomUUID();
        await db.insert(usersTable).values({ id: owner, status: 'active' });
        const model = textAiModelCatalog[0]!,
            revisionId = randomUUID();
        await db.insert(dictionaryAiConfigurationRevisionsTable).values({
            id: revisionId,
            version: 1,
            createdByUserId: owner,
            catalogSnapshot: {
                ...model,
                modelId: model.id,
                enabledModelIds: [model.id],
                supportedFormats: [...model.supportedFormats],
            },
        });
        await db
            .insert(dictionaryAiConfigurationTable)
            .values({ id: 'global', version: 1, activeRevisionId: revisionId });
        await db.insert(dictionaryAiWorkerObservationsTable).values({
            id: textsExecutionObservationId(
                'selection-test',
                model.providerId,
                model.id,
            ),
            workerId: 'selection-test',
            providerId: model.providerId,
            modelId: model.id,
            adapterRevision: model.adapterRevision,
            textAiSelectionRevision: 1,
            textAiCapacityRevision: 1,
            textsExecutionRevision: 1,
            textsCapacityRevision: 1,
            creditSettlementRevision: 1,
            textAiSupportedFormats: [...model.supportedFormats],
            status: 'available',
            message: 'synthetic',
            checkedAt: now,
            expiresAt: new Date(now.getTime() + 3600000),
        });
        await db.transaction((tx) =>
            new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                ownerId: owner,
                amount: 1000000000n,
                createdAt: now,
                expiresAt: null,
                source: 'admin',
                sourceReference: randomUUID(),
            }),
        );
        options = {
            selectionPolicy: {
                routingEnabled: true,
                credentialConfigured: () => true,
            },
            globalConcurrency: 10,
            ownerConcurrency: 2,
            leaseMs: 10000,
            clock: () => now,
            verifyShare: (key) => key === 'synthetic-share-key',
            proposal: async (_tx, input) => {
                if (
                    !sourceAvailable ||
                    input.ownerId !== owner ||
                    input.jobId !== proposalId
                )
                    throw new Error('unavailable');
                return {
                    alignment,
                    sourceLanguage: 'en',
                    targetLanguage: 'es',
                };
            },
        };
        store = new DrizzleTextSelectionStore(db, options);
    }, 120000);
    afterAll(async () => client?.end());
    function request(): TextSelectionRequest {
        return {
            operationId: randomUUID(),
            source: { kind: 'translation-proposal', jobId: proposalId },
            selection: {
                side: 'source',
                pairId: source[0]!.pairId,
                startOffset: 0,
                endOffset: 5,
            },
            target: { kind: 'new', name: 'Collected' },
            confirmDuplicate: false,
        };
    }
    async function sharedRequest() {
        const sourceOwnerId = randomUUID(),
            folderId = randomUUID(),
            textId = randomUUID(),
            shareId = randomUUID(),
            shareRowId = randomUUID();
        await db
            .insert(usersTable)
            .values({ id: sourceOwnerId, status: 'active' });
        await db.insert(textFoldersTable).values({
            id: folderId,
            ownerId: sourceOwnerId,
            name: 'Shared source',
            createdAt: now,
            updatedAt: now,
        });
        await db.insert(textsTable).values({
            id: textId,
            ownerId: sourceOwnerId,
            folderId,
            title: 'Context',
            sourceLanguage: 'en',
            targetLanguage: 'es',
            sourceText: source.map((pair) => pair.text).join(''),
            alignment,
            status: 'translated',
            createdAt: now,
            updatedAt: now,
        });
        await db.insert(textSharesTable).values({
            id: shareRowId,
            ownerId: sourceOwnerId,
            kind: 'text',
            resourceId: textId,
            locator: shareId,
            keyDigest: `hmac-sha256:v1:${'a'.repeat(43)}`,
            version: 1,
            createdAt: now,
        });
        return {
            request: {
                ...request(),
                source: {
                    kind: 'shared-text' as const,
                    shareId,
                    textId,
                    expectedTextVersion: 1,
                },
            },
            shareRowId,
        };
    }
    async function claim() {
        const lease = await store.claim('selection-test');
        expect(lease).not.toBeNull();
        return lease!;
    }
    it('atomically saves a full card/new dictionary/revision once and redacts occurrence context', async () => {
        const input = request();
        const [first, replay] = await Promise.all([
            store.enqueue(owner, input),
            store.enqueue(owner, input),
        ]);
        expect(first.id).toBe(replay.id);
        expect(await db.select().from(dictionariesTable)).toHaveLength(0);
        const lease = await claim();
        expect(lease.input.occurrenceContext?.sentence).toBe(source[0]!.text);
        expect(await store.dispatch(lease)).toBe(true);
        expect(
            await store.complete(lease, delta, {
                inputTokens: 100,
                outputTokens: 40,
            }),
        ).toBe(true);
        expect(await store.complete(lease, delta)).toBe(false);
        const result = await store.read(owner, first.id);
        expect(result.state).toBe('completed');
        expect(result.dictionaryId).toBeTruthy();
        expect(result.cardId).toBeTruthy();
        const [card] = await db.select().from(dictionaryCardsTable);
        expect(card).toMatchObject({
            translation: 'hola',
            definition: 'A greeting',
            definitionEnabledOverride: 'enabled',
        });
        const [settings] = await db.select().from(dictionarySettingsTable);
        expect(settings?.definitionEnabled).toBe(false);
        expect(
            await db.select().from(dictionaryCardRevisionsTable),
        ).toHaveLength(1);
        const [row] = await db.select().from(jobs);
        expect(row).toMatchObject({
            inputPayload: null,
            sourceAuthority: null,
            target: null,
            providerReservationState: 'settled',
        });
        expect(
            JSON.stringify(
                await db.select().from(dictionaryCardRevisionsTable),
            ),
        ).not.toContain('Next sentence');
        await expect(
            store.enqueue(owner, {
                ...input,
                target: { kind: 'new', name: 'Changed' },
            }),
        ).rejects.toMatchObject({ code: 'idempotency_conflict' });
    });

    it('saves canonical Source and all fields with provenance, then requires canonical duplicate confirmation and settles reported usage', async () => {
        const normalizedDelta: DictionaryCardAuthoringProviderDelta = {
            ...delta,
            sourceResult: { kind: 'suggested', value: 'the greeting' },
        };
        await store.enqueue(owner, request());
        const first = await claim();
        expect(first.input.source).toBe('Hello');
        expect(first.input.requestedFields).toContain('source');
        await store.dispatch(first);
        expect(await store.complete(first, normalizedDelta)).toBe(true);
        const [dictionary] = await db.select().from(dictionariesTable);
        const input = {
            ...request(),
            target: {
                kind: 'existing' as const,
                dictionaryId: dictionary!.id,
                expectedDictionaryVersion: 1,
                expectedSettingsVersion: 1,
            },
        };
        // Raw Hello differs from saved the greeting, so admission succeeds.
        await store.enqueue(owner, input);
        const duplicate = await claim();
        await store.dispatch(duplicate);
        expect(
            await store.complete(duplicate, normalizedDelta, {
                inputTokens: 100,
                outputTokens: 40,
            }),
        ).toBe(false);
        expect(await store.read(owner, duplicate.id)).toMatchObject({
            state: 'failed',
            failureCode: 'duplicate_confirmation_required',
        });
        const [reservation] = await db
            .select()
            .from(aiCreditReservationsTable)
            .where(eq(aiCreditReservationsTable.jobId, duplicate.id));
        expect(reservation).toMatchObject({
            state: 'settled',
            measurement: 'provider_reported',
        });
        expect(reservation!.chargedCredits).toBeGreaterThan(0n);
        expect(reservation!.chargedCredits).toBe(reservation!.measuredCredits);
        expect(reservation!.chargedCredits).toBeLessThan(
            reservation!.reservedCredits,
        );
        expect(await db.select().from(dictionaryCardsTable)).toHaveLength(1);
        await store.enqueue(owner, {
            ...input,
            operationId: randomUUID(),
            confirmDuplicate: true,
        });
        const confirmed = await claim();
        await store.dispatch(confirmed);
        expect(await store.complete(confirmed, normalizedDelta)).toBe(true);
        const cards = await db.select().from(dictionaryCardsTable);
        expect(cards).toHaveLength(2);
        for (const card of cards)
            expect(card).toMatchObject({
                source: 'the greeting',
                normalizedSource: 'the greeting',
                translation: 'hola',
                definition: 'A greeting',
                example: 'Hello, friend.',
                exampleTranslation: 'Hola, amigo.',
                authorship: 'ai-generated',
            });
        const revisions = await db.select().from(dictionaryCardRevisionsTable);
        expect(revisions).toHaveLength(2);
        expect(revisions[0]).toMatchObject({
            authorship: 'ai-generated',
            mutationKind: 'ai_create',
        });
        expect(JSON.stringify(revisions)).not.toContain('Next sentence');
        const rows = await db.select().from(jobs);
        for (const row of rows)
            expect(row).toMatchObject({
                inputPayload: null,
                sourceAuthority: null,
                target: null,
            });
    });

    it('publishes a legacy worker lease without requested Source using its original selection', async () => {
        await store.enqueue(owner, request());
        const current = await claim();
        // A lease created by the prior worker has this supported provider DTO shape.
        const lease = {
            ...current,
            input: {
                ...current.input,
                requestedFields: current.input.requestedFields.filter(
                    (field) => field !== 'source',
                ),
                fieldContext: current.input.fieldContext.filter(
                    (entry) => entry.field !== 'source',
                ),
            },
        };
        await store.dispatch(lease);
        expect(
            await store.complete(lease, { suggestions: delta.suggestions }),
        ).toBe(true);
        expect((await db.select().from(dictionaryCardsTable))[0]?.source).toBe(
            'Hello',
        );
        expect((await db.select().from(jobs))[0]?.inputPayload).toBeNull();
    });
    it('never creates an empty dictionary after cancellation, failure or a lost lease', async () => {
        const queued = await store.enqueue(owner, request());
        expect((await store.cancel(owner, queued.id)).state).toBe('cancelled');
        expect(await store.claim('selection-test')).toBeNull();
        await store.enqueue(owner, request());
        const lease = await claim();
        await store.dispatch(lease);
        now = new Date(now.getTime() + 11000);
        expect(await store.complete(lease, delta)).toBe(false);
        await store.claim('replacement');
        expect((await store.read(owner, lease.id)).failureCode).toBe(
            'worker_interrupted',
        );
        expect(await db.select().from(dictionariesTable)).toHaveLength(0);
    });
    it('quiesces deletion-pending owners even after provider dispatch', async () => {
        await store.enqueue(owner, request());
        const lease = await claim();
        await store.dispatch(lease);
        await db
            .update(usersTable)
            .set({ status: 'deletion_pending' })
            .where(eq(usersTable.id, owner));
        await store.fail(lease, 'provider_timeout');
        expect((await store.read(owner, lease.id)).state).toBe('cancelled');
        expect(
            (await db.select().from(aiCreditReservationsTable))[0]?.state,
        ).not.toBe('active');
        expect(await db.select().from(dictionariesTable)).toHaveLength(0);
    });
    it('retries a known rate-limit rejection once with separate credit reservations and a fenced attempt', async () => {
        await store.enqueue(owner, request());
        const first = await claim();
        await store.dispatch(first);
        await store.fail(first, 'provider_rate_limited');
        expect((await store.read(owner, first.id)).state).toBe('queued');
        expect(await store.claim('early')).toBeNull();
        now = new Date(now.getTime() + 1001);
        const second = await claim();
        expect(second.attempt).toBe(2);
        expect(second.fencingToken).toBeGreaterThan(first.fencingToken);
        expect(await store.complete(first, delta)).toBe(false);
        await store.dispatch(second);
        await store.fail(second, 'provider_rate_limited');
        expect((await store.read(owner, first.id)).state).toBe('failed');
        expect(await store.claim('later')).toBeNull();
        expect(await db.select().from(aiCreditReservationsTable)).toHaveLength(
            2,
        );
    });
    it('rechecks the source before commit and leaves no dictionary after revocation', async () => {
        await store.enqueue(owner, request());
        const lease = await claim();
        await store.dispatch(lease);
        sourceAvailable = false;
        expect(
            await store.complete(lease, delta, {
                inputTokens: 100,
                outputTokens: 40,
            }),
        ).toBe(false);
        expect((await store.read(owner, lease.id)).state).toBe('failed');
        expect(await db.select().from(dictionariesTable)).toHaveLength(0);
    });
    it('settles a running cancellation after the provider returns without saving a card', async () => {
        await store.enqueue(owner, request());
        const lease = await claim();
        await store.dispatch(lease);
        await store.cancel(owner, lease.id);
        expect(
            await store.complete(lease, delta, {
                inputTokens: 100,
                outputTokens: 40,
            }),
        ).toBe(false);
        expect((await store.read(owner, lease.id)).state).toBe('cancelled');
        expect(
            (await db.select().from(aiCreditReservationsTable))[0]?.state,
        ).not.toBe('active');
        expect(await db.select().from(dictionariesTable)).toHaveLength(0);
    });
    it('publishes a dictionary/full card/revision through the deployed restricted worker grants', async () => {
        const shared = await sharedRequest();
        const admitted = await store.enqueue(
            owner,
            shared.request,
            'synthetic-share-key',
        );
        const role = `selection_worker_${randomUUID().replaceAll('-', '')}`;
        await client.unsafe(`CREATE ROLE "${role}" NOLOGIN`);
        try {
            const raw = await readFile(
                new URL(
                    '../../../../../../infra/deploy/sql/dictionary-worker-role.sql',
                    import.meta.url,
                ),
                'utf8',
            );
            const grants = raw
                .split('\n')
                .filter((line) => !line.startsWith('\\'))
                .join('\n')
                .replaceAll(':"dictionary_worker_role"', `"${role}"`);
            await client.unsafe(grants);
            const restricted = Object.create(db) as SelectionDatabase;
            restricted.transaction = async (callback) =>
                db.transaction(async (tx) => {
                    await tx.execute(sql.raw(`SET LOCAL ROLE "${role}"`));
                    return callback(tx);
                });
            const worker = new DrizzleTextSelectionStore(restricted, options);
            const lease = await worker.claim('restricted-selection');
            expect(lease).not.toBeNull();
            expect(await worker.dispatch(lease!)).toBe(true);
            expect(
                await worker.complete(lease!, delta, {
                    inputTokens: 100,
                    outputTokens: 40,
                }),
            ).toBe(true);
            expect((await store.read(owner, admitted.id)).state).toBe(
                'completed',
            );
            expect(await db.select().from(dictionariesTable)).toHaveLength(1);
            expect(await db.select().from(dictionaryCardsTable)).toHaveLength(
                1,
            );
            expect(
                await db.select().from(dictionaryCardRevisionsTable),
            ).toHaveLength(1);
            await expect(
                restricted.transaction((tx) =>
                    tx.execute(
                        sql`update text_shares set key_digest='forbidden'`,
                    ),
                ),
            ).rejects.toMatchObject({ cause: { code: '42501' } });
            await expect(
                restricted.transaction((tx) =>
                    tx.execute(sql`update text_shares set version=version+1`),
                ),
            ).rejects.toMatchObject({ cause: { code: '42501' } });
            await expect(
                restricted.transaction((tx) =>
                    tx.execute(sql`delete from model_price_revisions`),
                ),
            ).rejects.toMatchObject({ cause: { code: '42501' } });
            await expect(
                restricted.transaction((tx) =>
                    tx.execute(sql`update users set status='purged'`),
                ),
            ).rejects.toMatchObject({ cause: { code: '42501' } });
        } finally {
            await client.unsafe(`DROP OWNED BY "${role}"`);
            await client.unsafe(`DROP ROLE "${role}"`);
        }
    });
    it('rejects revoked shared-source authority after provider dispatch and settles the attempt', async () => {
        const shared = await sharedRequest();
        await store.enqueue(owner, shared.request, 'synthetic-share-key');
        const lease = await claim();
        await store.dispatch(lease);
        await db
            .update(textSharesTable)
            .set({ version: 2 })
            .where(eq(textSharesTable.id, shared.shareRowId));
        expect(
            await store.complete(lease, delta, {
                inputTokens: 100,
                outputTokens: 40,
            }),
        ).toBe(false);
        expect((await store.read(owner, lease.id)).state).toBe('failed');
        expect(
            (await db.select().from(aiCreditReservationsTable))[0]?.state,
        ).not.toBe('active');
        expect(await db.select().from(dictionariesTable)).toHaveLength(0);
    });
    it('serializes concurrent publication against the same pinned dictionary version', async () => {
        await store.enqueue(owner, request());
        const first = await claim();
        await store.dispatch(first);
        await store.complete(first, delta);
        const [dictionary] = await db.select().from(dictionariesTable);
        const next = () => ({
            ...request(),
            selection: {
                ...request().selection,
                startOffset: 6,
                endOffset: 11,
            },
            target: {
                kind: 'existing' as const,
                dictionaryId: dictionary!.id,
                expectedDictionaryVersion: 1,
                expectedSettingsVersion: 1,
            },
        });
        await Promise.all([
            store.enqueue(owner, next()),
            store.enqueue(owner, next()),
        ]);
        const left = await claim(),
            right = await claim();
        await store.dispatch(left);
        await store.dispatch(right);
        const outcomes = await Promise.all([
            store.complete(left, delta, { inputTokens: 100, outputTokens: 40 }),
            store.complete(right, delta, {
                inputTokens: 100,
                outputTokens: 40,
            }),
        ]);
        expect(outcomes.filter(Boolean)).toHaveLength(1);
        expect(await db.select().from(dictionaryCardsTable)).toHaveLength(2);
        expect(
            await db.select().from(dictionaryCardRevisionsTable),
        ).toHaveLength(2);
        expect(
            (await db.select().from(jobs))
                .map((job) => job.executionState)
                .sort(),
        ).toEqual(['completed', 'completed', 'failed']);
    });
    it('requires explicit duplicate confirmation and pins target settings/version', async () => {
        await store.enqueue(owner, request());
        const lease = await claim();
        await store.dispatch(lease);
        await store.complete(lease, delta);
        const [dictionary] = await db.select().from(dictionariesTable);
        const input = {
            ...request(),
            target: {
                kind: 'existing' as const,
                dictionaryId: dictionary!.id,
                expectedDictionaryVersion: 1,
                expectedSettingsVersion: 1,
            },
        };
        await expect(store.enqueue(owner, input)).rejects.toMatchObject({
            code: 'duplicate_confirmation_required',
        });
        const accepted = await store.enqueue(owner, {
            ...input,
            confirmDuplicate: true,
        });
        const second = await claim();
        await db
            .update(dictionarySettingsTable)
            .set({ version: 2 })
            .where(eq(dictionarySettingsTable.dictionaryId, dictionary!.id));
        await expect(store.dispatch(second)).rejects.toMatchObject({
            code: 'stale_content',
        });
        await store.fail(second, 'stale_content');
        expect((await store.read(owner, accepted.id)).state).toBe('failed');
        expect(await db.select().from(dictionaryCardsTable)).toHaveLength(1);
    });
});
