// @user-flow-revision learner-portrait sha256:34bac194f709f508
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
    createDrizzleDatabase,
    createPostgresClient,
} from '@languon/database';
import {
    AuthenticationSuccessResponseSchema,
    PortraitInterviewOperationResponseSchema,
    PortraitStateSchema,
    SignUpResponseSchema,
} from '@languon/contracts';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../../../src/app';
import { loadEnvironment } from '../../../../src/config/environment';
import {
    createAuthenticationComposition,
    type AuthenticationComposition,
} from '../../../../src/modules/authentication/infrastructure/authentication-composition';
import {
    aiCreditAccountsTable,
    aiCreditGrantsTable,
    aiCreditHistoryTable,
    aiCreditReservationAllocationsTable,
    aiCreditReservationsTable,
} from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/schema';
import type { TutorCallAdmission } from '../../../../src/modules/conversations/application/ports/tutor-runner';
import {
    createInterviewAccounting,
} from '../../../../src/modules/learner-portraits/infrastructure/interview-accounting';
import {
    createLearnerPortraitModule,
} from '../../../../src/modules/learner-portraits/infrastructure/learner-portrait-composition';
import {
    portraitInterviewProviderCallsTable,
} from '../../../../src/modules/learner-portraits/infrastructure/persistence/drizzle/provider-call-schema';
import {
    eraseOwnerLearnerPortrait,
    portraitDeletionBusy,
    requestPortraitCancellation,
} from '../../../../src/modules/learner-portraits/infrastructure/persistence/drizzle/portrait-deletion-participant';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import {
    learnerPortraitInterviewOperationsTable,
} from '../../../../src/modules/learner-portraits/infrastructure/persistence/drizzle/schema';
import {
    usersTable,
} from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import {
    createLearnerPortraitRoutes,
} from '../../../../src/modules/learner-portraits/interface/http/learner-portrait.routes';
import { textAiModelCatalog } from '../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import {
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
    dictionaryAiWorkerObservationsTable,
} from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import {
    portraitInterviewExecutionObservationId,
} from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness';
import {
    createTestPostgresClient,
    getTestDatabaseUrl,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';
import {
    createTestRedisClient,
    deleteNamespacedKeys,
    redisIntegrationEnabled,
    uniqueAuthRedisNamespace,
} from '../../support/test-redis';

const run = describe.runIf(
    isDatabaseIntegrationEnabled() && redisIntegrationEnabled,
);
const origin = 'http://localhost:3333';
const namespace = uniqueAuthRedisNamespace('learner-portrait-journey');
const dictionarySecret =
    'learner-portrait-journey-dictionary-secret-forty-bytes';
const workerId = 'learner-portrait-journey-worker';

run('real learner portrait HTTP and accounting journey', () => {
    let authentication: AuthenticationComposition;
    const priorEnvironment = {
        routing: process.env.DICTIONARY_AI_MANAGED_ROUTING_ENABLED,
        deepseek: process.env.DICTIONARY_AI_DEEPSEEK_CREDENTIAL_CONFIGURED,
    };

    beforeAll(async () => {
        process.env.DICTIONARY_AI_MANAGED_ROUTING_ENABLED = 'true';
        process.env.DICTIONARY_AI_DEEPSEEK_CREDENTIAL_CONFIGURED = 'true';
        const redis = createTestRedisClient();
        await redis.connect();
        await redis.quit();
        const database = createTestPostgresClient();
        await resetTestDatabase(database);
        await migrateTestDatabase(database);
        await database.end();
        authentication = await createAuthenticationComposition(
            loadEnvironment({
                APP_ENV: 'test',
                NODE_ENV: 'test',
                AUTH_ALLOWED_ORIGINS: origin,
                AUTH_CODE_HMAC_SECRET:
                    'learner-portrait-journey-code-secret-forty-bytes',
                AUTH_JWT_SECRET:
                    'learner-portrait-journey-jwt-secret-forty-bytes',
                DICTIONARY_HMAC_SECRET: dictionarySecret,
                AUTH_WEBAUTHN_RP_ID: 'localhost',
                AUTH_REDIS_NAMESPACE: namespace,
                DATABASE_URL: getTestDatabaseUrl(),
                REDIS_URL: process.env.AUTH_TEST_REDIS_URL,
            }),
        );
    }, 120_000);

    afterAll(async () => {
        await authentication?.close();
        const redis = createTestRedisClient();
        await redis.connect();
        await deleteNamespacedKeys(redis, namespace);
        await redis.quit();
        restoreEnvironment(
            'DICTIONARY_AI_MANAGED_ROUTING_ENABLED',
            priorEnvironment.routing,
        );
        restoreEnvironment(
            'DICTIONARY_AI_DEEPSEEK_CREDENTIAL_CONFIGURED',
            priorEnvironment.deepseek,
        );
    });

    function composed(creditsBypass: boolean) {
        const module = createLearnerPortraitModule({
            database: authentication.productDependencies.database,
            creditsBypass,
        });
        const app = createApp({
            authentication: authentication.options,
            learnerPortraits: createLearnerPortraitRoutes({
                portraits: module.portraits,
                interviews: module.interviews,
                authenticate: async (token) =>
                    authentication.productDependencies.accessTokens.verify(
                        token,
                    ),
                rateLimiter: authentication.productDependencies.rateLimiter,
                policy: authentication.options.policy,
                creditsBypass,
            }),
        });
        return { app, module };
    }

    async function request(
        app: ReturnType<typeof createApp>,
        path: string,
        options: { body?: unknown; method?: string; token?: string } = {},
    ) {
        return app.request(path, {
            method: options.method ?? 'GET',
            ...(options.body === undefined
                ? {}
                : { body: JSON.stringify(options.body) }),
            headers: {
                'Content-Type': 'application/json',
                Origin: origin,
                ...(options.token
                    ? { Authorization: `Bearer ${options.token}` }
                    : {}),
            },
        });
    }

    async function signup(app: ReturnType<typeof createApp>, label: string) {
        const response = await request(app, '/auth/sign-up', {
            method: 'POST',
            body: {
                email: `${label}-${randomUUID()}@example.test`,
                password: 'A safe learner portrait journey password 47!',
            },
        });
        expect(response.status).toBe(202);
        const flowId = SignUpResponseSchema.parse(await response.json())
            .verification.flowId;
        const verified = await request(app, '/auth/email-verification/verify', {
            method: 'POST',
            body: { code: '0000', flowId },
        });
        expect(verified.status).toBe(200);
        const result = AuthenticationSuccessResponseSchema.parse(
            await verified.json(),
        );
        return { token: result.accessToken, userId: result.user.id };
    }

    async function configure(ownerId: string) {
        const model = textAiModelCatalog.find(
            (candidate) => candidate.id === 'deepseek-flash',
        )!;
        const now = new Date();
        const revision = randomUUID();
        const database = authentication.productDependencies.database;
        await database.insert(dictionaryAiConfigurationRevisionsTable).values({
            id: revision,
            createdByUserId: ownerId,
            version: 1,
            catalogSnapshot: {
                adapterRevision: model.adapterRevision,
                aggregateBudget: model.aggregateBudget,
                credentialReference: model.credentialReference,
                creditPricing: model.creditPricing,
                enabledModelIds: [model.id],
                modelId: model.id,
                perCallMaxInputTokens: model.perCallMaxInputTokens,
                perCallMaxOutputTokens: model.perCallMaxOutputTokens,
                providerId: model.providerId,
                supportedFormats: [...model.supportedFormats],
            },
        });
        await database
            .insert(dictionaryAiConfigurationTable)
            .values({ id: 'global', activeRevisionId: revision, version: 1 });
        await database.insert(dictionaryAiWorkerObservationsTable).values({
            id: portraitInterviewExecutionObservationId(
                workerId,
                model.providerId,
                model.id,
            ),
            workerId,
            providerId: model.providerId,
            modelId: model.id,
            adapterRevision: model.adapterRevision,
            checkedAt: now,
            expiresAt: new Date(now.getTime() + 60_000),
            message: 'deterministic learner portrait accounting journey',
            status: 'available',
            textAiSelectionRevision: 1,
            textAiSupportedFormats: ['portrait-interview:v1'],
            textAiCapacityRevision: 1,
            textsCapacityRevision: 1,
            conversationCapacityRevision: 1,
            conversationExecutionRevision: 1,
            creditSettlementRevision: 1,
        });
    }

    async function grantCredits(userId: string) {
        const database = authentication.productDependencies.database;
        const now = new Date();
        await database.insert(aiCreditAccountsTable).values({
            userId,
            mode: 'limited',
            createdAt: now,
            updatedAt: now,
        });
        await database.insert(aiCreditGrantsTable).values({
            id: randomUUID(),
            ownerId: userId,
            amount: 10_000_000n,
            source: 'purchase',
            sourceReference: `learner-portrait-${randomUUID()}`,
            createdAt: now,
        });
        await database.insert(aiCreditHistoryTable).values({
            id: randomUUID(),
            ownerId: userId,
            amount: 10_000_000n,
            kind: 'grant',
            grantSource: 'purchase',
            createdAt: now,
        });
    }

    async function startAndSubmit(
        app: ReturnType<typeof createApp>,
        token: string,
        paidAcknowledged: boolean,
    ) {
        const initial = PortraitStateSchema.parse(
            await (await request(app, '/learner-portrait', { token })).json(),
        );
        const started = await request(app, '/learner-portrait/interview', {
            method: 'POST',
            token,
            body: { expectedVersion: initial.version, locale: 'en' },
        });
        expect(started.status).toBe(200);
        const interview = (await started.json()) as { interviewId: string };
        const submitted = await request(
            app,
            '/learner-portrait/interview/responses',
            {
                method: 'POST',
                token,
                body: {
                    interviewId: interview.interviewId,
                    expectedVersion: initial.version,
                    expectedGeneration: initial.generation,
                    idempotencyKey: randomUUID(),
                    paidAcknowledged,
                    input: {
                        kind: 'answer',
                        topic: 'languages',
                        text: 'Spanish',
                    },
                },
            },
        );
        expect(submitted.status, await submitted.clone().text()).toBe(202);
        return PortraitInterviewOperationResponseSchema.parse(
            await submitted.json(),
        );
    }

    async function dispatchAndSettle(
        module: ReturnType<typeof createLearnerPortraitModule>,
        ownerId: string,
    ) {
        const claim = await module.store.claim();
        expect(claim?.ownerId).toBe(ownerId);
        const call: TutorCallAdmission = {
            callId: randomUUID(),
            purpose: 'answer',
            inputTokenEstimate: 1,
            maxOutputTokens: 32,
        };
        const accounting = createInterviewAccounting({
            database: authentication.productDependencies.database,
            withOperation: (work) => module.store.withOperation(claim!, work),
            ownerId,
            operationId: claim!.id,
            execution: claim!.execution as never,
        });
        await accounting.admit(call);
        await accounting.settle(call, { inputTokens: 1, outputTokens: 1 });
        await module.store.complete(
            claim!,
            {
                message: 'Thanks. Let us continue with your goals.',
                topic: 'goals',
                options: [],
                multiSelect: true,
                answerSummary: 'Spanish',
            },
            new Date(),
        );
        return claim!;
    }

    async function dispatchOnly(
        module: ReturnType<typeof createLearnerPortraitModule>,
        ownerId: string,
    ) {
        const claim = await module.store.claim();
        expect(claim?.ownerId).toBe(ownerId);
        const call: TutorCallAdmission = {
            callId: randomUUID(),
            purpose: 'answer',
            inputTokenEstimate: 1,
            maxOutputTokens: 32,
        };
        const accounting = createInterviewAccounting({
            database: authentication.productDependencies.database,
            withOperation: (work) => module.store.withOperation(claim!, work),
            ownerId,
            operationId: claim!.id,
            execution: claim!.execution as never,
        });
        await accounting.admit(call);
        return { call, claim: claim! };
    }

    // @user-flow learner-portrait/approved-private-portrait-and-interview-accounting
    it('keeps portraits owner-private, requires explicit approval/use, and records paid and bypassed interview dispatches', async () => {
        const paid = composed(false);
        const owner = await signup(paid.app, 'portrait-owner');
        const stranger = await signup(paid.app, 'portrait-stranger');
        const unavailableState = PortraitStateSchema.parse(
            await (
                await request(paid.app, '/learner-portrait', {
                    token: owner.token,
                })
            ).json(),
        );
        const unavailableStart = await request(
            paid.app,
            '/learner-portrait/interview',
            {
                method: 'POST',
                token: owner.token,
                body: { expectedVersion: unavailableState.version, locale: 'en' },
            },
        );
        expect(unavailableStart.status).toBe(200);
        const unavailableInterview = (await unavailableStart.json()) as {
            interviewId: string;
        };
        const unavailableSubmission = await request(
            paid.app,
            '/learner-portrait/interview/responses',
            {
                method: 'POST',
                token: owner.token,
                body: {
                    interviewId: unavailableInterview.interviewId,
                    expectedVersion: unavailableState.version,
                    expectedGeneration: unavailableState.generation,
                    idempotencyKey: randomUUID(),
                    paidAcknowledged: true,
                    input: {
                        kind: 'answer',
                        topic: 'languages',
                        text: 'Spanish',
                    },
                },
            },
        );
        expect(unavailableSubmission.status).toBe(503);
        expect(
            await authentication.productDependencies.database
                .select()
                .from(aiCreditReservationsTable)
                .where(eq(aiCreditReservationsTable.ownerId, owner.userId)),
        ).toEqual([]);
        await configure(owner.userId);
        await grantCredits(owner.userId);

        const draft = await request(paid.app, '/learner-portrait/draft', {
            method: 'PATCH',
            token: owner.token,
            body: {
                expectedVersion: 0,
                baseApprovedVersion: 0,
                locale: 'en',
                items: { languages: [], explanationLanguages: [], goals: ['Travel'], accommodations: [], hobbies: [] },
            },
        });
        expect(draft.status).toBe(200);
        const savedDraft = PortraitStateSchema.parse(await draft.json());
        expect(savedDraft.useEnabled).toBe(false);
        const approved = await request(paid.app, '/learner-portrait/approve', {
            method: 'POST',
            token: owner.token,
            body: {
                expectedVersion: savedDraft.version,
                expectedApprovedVersion: savedDraft.approvedVersion,
            },
        });
        expect(approved.status).toBe(200);
        const approvedState = PortraitStateSchema.parse(await approved.json());
        expect(approvedState.approved?.items.goals).toEqual(['Travel']);
        expect(approvedState.useEnabled).toBe(false);

        const strangerRead = await request(
            paid.app,
            '/learner-portrait',
            { token: stranger.token },
        );
        expect(strangerRead.status).toBe(200);
        expect(PortraitStateSchema.parse(await strangerRead.json()).approved).toBeNull();

        const operation = await startAndSubmit(paid.app, owner.token, true);
        const forbiddenRead = await request(
            paid.app,
            `/learner-portrait/interview/responses/${operation.id}`,
            { token: stranger.token },
        );
        expect(forbiddenRead.status).toBe(404);
        await dispatchAndSettle(paid.module, owner.userId);

        const database = authentication.productDependencies.database;
        const [paidReservation] = await database
            .select()
            .from(aiCreditReservationsTable)
            .where(eq(aiCreditReservationsTable.jobId, operation.id));
        expect(paidReservation?.jobKind).toBe('portrait-interview');
        expect(paidReservation?.reservedCredits).toBeGreaterThan(0n);
        expect(paidReservation?.state).toBe('settled');

        const bypass = composed(true);
        const freeLearner = await signup(bypass.app, 'portrait-bypass');
        const freeOperation = await startAndSubmit(
            bypass.app,
            freeLearner.token,
            false,
        );
        await dispatchAndSettle(bypass.module, freeLearner.userId);
        const [freeReservation] = await database
            .select()
            .from(aiCreditReservationsTable)
            .where(eq(aiCreditReservationsTable.jobId, freeOperation.id));
        const [providerCall] = await database
            .select()
            .from(portraitInterviewProviderCallsTable)
            .where(
                and(
                    eq(portraitInterviewProviderCallsTable.operationId, freeOperation.id),
                    eq(portraitInterviewProviderCallsTable.ownerId, freeLearner.userId),
                ),
            );
        expect(freeReservation?.jobKind).toBe('portrait-interview');
        expect(freeReservation?.reservedCredits).toBe(0n);
        expect(freeReservation?.state).toBe('settled');
        expect(providerCall?.state).toBe('settled');
        expect(providerCall?.actualInputTokens).toBe(1);
        expect(providerCall?.actualOutputTokens).toBe(1);
    }, 120_000);

    it('settles an expired paid provider call and erases portrait content under the restricted purge role', async () => {
        const paid = composed(false);
        const learner = await signup(paid.app, 'portrait-purge-paid');
        await grantCredits(learner.userId);
        const operation = await startAndSubmit(paid.app, learner.token, true);
        const dispatched = await dispatchOnly(paid.module, learner.userId);
        const database = authentication.productDependencies.database;
        await database
            .update(learnerPortraitInterviewOperationsTable)
            .set({ leaseUntil: new Date(Date.now() - 1) })
            .where(eq(learnerPortraitInterviewOperationsTable.id, operation.id));
        await database
            .update(usersTable)
            .set({ status: 'deletion_pending' })
            .where(eq(usersTable.id, learner.userId));

        const role = `portrait_purge_paid_${randomUUID().replaceAll('-', '')}`;
        const grantScript = await readFile(
            new URL(
                '../../../../../../infra/deploy/sql/account-purge-worker-role.sql',
                import.meta.url,
            ),
            'utf8',
        );
        const administrator = createTestPostgresClient();
        const restricted = createPostgresClient({
            databaseUrl: getTestDatabaseUrl(),
            maxConnections: 1,
        });
        try {
            await administrator.unsafe(`create role ${role}`);
            await administrator.unsafe(
                grantScript
                    .split('\n')
                    .filter((line) => !line.startsWith('\\'))
                    .join('\n')
                    .replaceAll(':"account_purge_role"', role),
            );
            await restricted.unsafe(`set role ${role}`);
            for (const statement of [
                'select input, context, result, fingerprint from learner_portrait_interview_operations',
                'select lease_token from learner_portrait_interview_operations',
                'select context from learner_portrait_interviews',
                'select state from learner_portraits',
            ]) {
                await expect(restricted.unsafe(statement)).rejects.toThrow();
            }

            const restrictedDatabase = createDrizzleDatabase(
                restricted,
                databaseSchema,
            );
            await restrictedDatabase.transaction(async (tx) => {
                await requestPortraitCancellation(tx, learner.userId);
                expect(await portraitDeletionBusy(tx, learner.userId)).toBe(
                    false,
                );
                await eraseOwnerLearnerPortrait(tx, learner.userId, new Date());
            });

            const [reservation] = await database
                .select()
                .from(aiCreditReservationsTable)
                .where(eq(aiCreditReservationsTable.jobId, operation.id));
            const [allocation] = await database
                .select()
                .from(aiCreditReservationAllocationsTable)
                .where(
                    eq(
                        aiCreditReservationAllocationsTable.reservationId,
                        reservation!.id,
                    ),
                );
            expect(reservation?.state).toBe('settled');
            expect(reservation?.measurement).toBe('estimated');
            expect(reservation?.chargedCredits).toBeGreaterThan(0n);
            expect(allocation?.settledCredits).toBeGreaterThan(0n);
            expect(
                await database
                    .select()
                    .from(learnerPortraitInterviewOperationsTable)
                    .where(
                        eq(
                            learnerPortraitInterviewOperationsTable.id,
                            operation.id,
                        ),
                    ),
            ).toHaveLength(0);
            const archived = await database.execute(sql`
                select job_kind, actual_input_tokens, actual_output_tokens
                from dictionary_generation_provider_usage_archive
                where id=${dispatched.call.callId}::uuid
            `);
            expect(archived).toHaveLength(1);
            expect(archived[0]?.job_kind).toBe('portrait-interview');
            expect(archived[0]?.actual_input_tokens).toBeGreaterThan(0);
            expect(archived[0]?.actual_output_tokens).toBeGreaterThan(0);
        } finally {
            await restricted.unsafe('reset role');
            await restricted.end();
            await administrator.unsafe(`drop owned by ${role}`);
            await administrator.unsafe(`drop role ${role}`);
            await administrator.end();
        }
    }, 120_000);
});

function restoreEnvironment(name: string, value: string | undefined): void {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
}
