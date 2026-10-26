import { seedInterviewAccountingFixture } from '../../../support/ai-accounting-fixture';
import {
    aiCreditActionsTable,
    aiCreditActionAttemptsTable,
    aiCreditActionAllocationsTable,
} from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import { capabilityPolicyRevisionsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
// @user-flow-revision learner-portrait sha256:ab89017ff9742d4b
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { createDrizzleDatabase, createPostgresClient } from '@languon/database';
import {
    AuthenticationSuccessResponseSchema,
    PortraitInterviewOperationResponseSchema,
    PortraitStateSchema,
    SignUpResponseSchema,
} from '@languon/contracts';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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
    aiCreditReservationsTable,
} from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/schema';
import type { TutorCallAdmission } from '../../../../src/modules/conversations/application/ports/tutor-runner';
import { InterviewWorkerService } from '../../../../src/modules/learner-portraits/application/interview-worker-service';
import { createLearnerInterviewerRunner } from '../../../../src/modules/learner-portraits/infrastructure/ai/learner-interviewer';
import {
    readInterviewInputTokenLimit,
    readInterviewOutputTokenLimit,
    type InterviewExecution,
} from '../../../../src/modules/learner-portraits/infrastructure/ai/interview-request';
import { scriptedTutorModel } from '../../../../src/modules/conversations/infrastructure/ai/tutor-test-fixtures';
import { DrizzleAiCreditTransactionParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { maximumTextPrice } from '../../../../src/modules/ai-credits/domain/model-price';
import { interviewInputTokenLimit } from '../../../../src/modules/learner-portraits/infrastructure/ai/interview-request';
import { createInterviewAccounting } from '../../../../src/modules/learner-portraits/infrastructure/interview-accounting';
import { createLearnerPortraitModule } from '../../../../src/modules/learner-portraits/infrastructure/learner-portrait-composition';
import { portraitInterviewProviderCallsTable } from '../../../../src/modules/learner-portraits/infrastructure/persistence/drizzle/provider-call-schema';
import {
    eraseOwnerLearnerPortrait,
    portraitDeletionBusy,
    requestPortraitCancellation,
} from '../../../../src/modules/learner-portraits/infrastructure/persistence/drizzle/portrait-deletion-participant';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { lockTextAiCapacity } from '../../../../src/infrastructure/text-ai/text-ai-capacity';
import { learnerPortraitInterviewOperationsTable } from '../../../../src/modules/learner-portraits/infrastructure/persistence/drizzle/schema';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { createLearnerPortraitRoutes } from '../../../../src/modules/learner-portraits/interface/http/learner-portrait.routes';
import { textAiModelCatalog } from '../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import {
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
    dictionaryAiWorkerObservationsTable,
} from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { portraitInterviewExecutionObservationId } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness';
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

    beforeEach(async () => {
        const redis = createTestRedisClient();
        await redis.connect();
        await deleteNamespacedKeys(redis, namespace);
        await redis.quit();
    });

    async function composed(operatorFunded: boolean) {
        const database = authentication.productDependencies.database;
        await seedInterviewAccountingFixture(database);
        const policies = await database
            .select()
            .from(capabilityPolicyRevisionsTable)
            .where(
                eq(
                    capabilityPolicyRevisionsTable.capability,
                    'portrait-interview',
                ),
            );
        await database.insert(capabilityPolicyRevisionsTable).values({
            id: randomUUID(),
            capability: 'portrait-interview',
            funding: operatorFunded ? 'operator' : 'customer',
            version: Math.max(0, ...policies.map((p) => p.version)) + 1,
            createdAt: new Date(),
            reason: 'Deterministic interview journey policy',
        });
        const module = createLearnerPortraitModule({
            database: authentication.productDependencies.database,
        });
        const app = createApp({
            authentication: authentication.options,
            learnerPortraits: createLearnerPortraitRoutes({
                portraits: module.portraits,
                interviews: module.interviews,
                readChargingPolicy: module.readChargingPolicy,
                authenticate: async (token) =>
                    authentication.productDependencies.accessTokens.verify(
                        token,
                    ),
                rateLimiter: authentication.productDependencies.rateLimiter,
                policy: authentication.options.policy,
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

    async function grantCredits(userId: string, amount = 10_000_000n) {
        const database = authentication.productDependencies.database;
        const now = new Date();
        await database.insert(aiCreditAccountsTable).values({
            userId,
            mode: 'limited',
            createdAt: now,
            updatedAt: now,
        });
        if (amount === 0n) return;
        await database.insert(aiCreditGrantsTable).values({
            id: randomUUID(),
            ownerId: userId,
            amount,
            source: 'purchase',
            sourceReference: `learner-portrait-${randomUUID()}`,
            createdAt: now,
        });
        await database.insert(aiCreditHistoryTable).values({
            id: randomUUID(),
            ownerId: userId,
            amount,
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
        const requestBody = {
            interviewId: interview.interviewId,
            expectedVersion: initial.version,
            expectedGeneration: initial.generation,
            idempotencyKey: randomUUID(),
            paidAcknowledged,
            input: { kind: 'answer', topic: 'languages', text: 'Spanish' },
        };
        let submitted = await request(
            app,
            '/learner-portrait/interview/responses',
            {
                method: 'POST',
                token,
                body: requestBody,
            },
        );
        if (submitted.status === 409) {
            const failure = (await submitted.clone().json()) as {
                error: {
                    code: string;
                    details?: {
                        quote: { id: string; approximateOutputTokens: number };
                    };
                };
            };
            expect(failure.error.code).toBe('action_confirmation_required');
            expect(
                failure.error.details?.quote.approximateOutputTokens,
            ).toBeGreaterThan(0);
            submitted = await request(
                app,
                '/learner-portrait/interview/responses',
                {
                    method: 'POST',
                    token,
                    body: {
                        ...requestBody,
                        confirmedQuoteId: failure.error.details!.quote.id,
                    },
                },
            );
        }
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
            leaseToken: claim!.leaseToken,
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
            leaseToken: claim!.leaseToken,
            execution: claim!.execution as never,
        });
        await accounting.admit(call);
        return { call, claim: claim! };
    }

    // @user-flow learner-portrait/approved-private-portrait-and-interview-accounting
    it('keeps portraits owner-private, requires explicit approval/use, and records paid and bypassed interview dispatches', async () => {
        const paid = await composed(false);
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
                body: {
                    expectedVersion: unavailableState.version,
                    locale: 'en',
                },
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
                items: {
                    languages: [],
                    explanationLanguages: [],
                    goals: ['Travel'],
                    accommodations: [],
                    hobbies: [],
                },
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

        const strangerRead = await request(paid.app, '/learner-portrait', {
            token: stranger.token,
        });
        expect(strangerRead.status).toBe(200);
        expect(
            PortraitStateSchema.parse(await strangerRead.json()).approved,
        ).toBeNull();

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
            .from(aiCreditActionsTable)
            .where(eq(aiCreditActionsTable.id, operation.id));
        expect(paidReservation?.capability).toBe('portrait-interview');
        expect(paidReservation?.heldMilli).toBeGreaterThan(0n);
        expect(paidReservation?.chargedMilli).toBeGreaterThan(0n);
        expect(paidReservation?.state).toBe('settled');

        const bypass = await composed(true);
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
            .from(aiCreditActionAttemptsTable)
            .where(eq(aiCreditActionAttemptsTable.actionId, freeOperation.id));
        expect(freeReservation).toBeUndefined();
        const [freeAction] = await database
            .select()
            .from(aiCreditActionsTable)
            .where(eq(aiCreditActionsTable.id, freeOperation.id));
        expect(freeAction).toMatchObject({
            funding: 'operator',
            state: 'settled',
            heldMilli: 0n,
            chargedMilli: 0n,
        });
        expect(providerCall?.state).toBe('settled');
        expect(providerCall?.inputTokens).toBe(1);
        expect(providerCall?.outputTokens).toBe(1);
    }, 120_000);

    it('holds the paid action budget atomically, records measured usage before validation, and absorbs unknown usage', async () => {
        const paid = await composed(false);
        const learner = await signup(paid.app, 'portrait-small-paid');
        await grantCredits(learner.userId, 20_000n);
        const operation = await startAndSubmit(paid.app, learner.token, true);
        const claim = (await paid.module.store.claim())!;
        const database = authentication.productDependencies.database;
        const accounting = createInterviewAccounting({
            database,
            withOperation: (work) =>
                paid.module.store.withOperation(claim, work),
            ownerId: learner.userId,
            operationId: operation.id,
            leaseToken: claim.leaseToken,
            execution: claim.execution as never,
        });
        const call = {
            callId: randomUUID(),
            purpose: 'answer' as const,
            inputTokenEstimate: 3500,
            maxOutputTokens: Math.min(
                4096,
                readInterviewOutputTokenLimit(
                    claim.execution as unknown as InterviewExecution,
                ),
            ),
        };
        await accounting.admit(call);
        await expect(accounting.admit(call)).rejects.toThrow('replayed');
        await accounting.settle(call, { inputTokens: 50, outputTokens: 12 });
        const [active] = await database
            .select()
            .from(aiCreditActionsTable)
            .where(eq(aiCreditActionsTable.id, operation.id));
        expect(active?.state).toBe('active');
        expect(active?.heldMilli).toBe(20_000n);
        expect(active?.chargedMilli).toBeNull();
        const unknown = { ...call, callId: randomUUID(), maxOutputTokens: 32 };
        await accounting.admit(unknown);
        await accounting.fail(unknown, 'missing-usage');
        const [unknownAttempt] = await database
            .select()
            .from(aiCreditActionAttemptsTable)
            .where(eq(aiCreditActionAttemptsTable.id, unknown.callId));
        expect(unknownAttempt?.inputTokens).toBeNull();
        expect(unknownAttempt?.outputTokens).toBeNull();
        await paid.module.store.complete(
            claim,
            {
                message: 'What are your travel goals?',
                topic: 'goals',
                options: [],
                multiSelect: false,
            },
            new Date(),
        );
        const [settled] = await database
            .select()
            .from(aiCreditActionsTable)
            .where(eq(aiCreditActionsTable.id, operation.id));
        expect(settled?.state).toBe('settled');
        expect(settled?.outcome).toBe('success');
        expect(settled?.measurement).toBe('unknown');
        expect(settled?.chargedMilli).toBe(86n);
        const allocations = await database
            .select()
            .from(aiCreditActionAllocationsTable)
            .where(eq(aiCreditActionAllocationsTable.actionId, operation.id));
        expect(
            allocations.reduce(
                (sum, row) => sum + (row.settledMilli ?? 0n),
                0n,
            ),
        ).toBe(86n);
    }, 120_000);

    it.each([
        ['valid', 20_000n],
        ['invalid', 20_000n],
        ['affordable', 15_608n],
    ] as const)(
        'executes one schema-inclusive paid %s response with %s credits and settles actual usage',
        async (kind, balance) => {
            const paid = await composed(false);
            const learner = await signup(
                paid.app,
                `portrait-structured-${kind}`,
            );
            await grantCredits(learner.userId, 20_000n);
            if (kind === 'affordable') {
                for (const charge of [1562, 1262, 1568]) {
                    const previous = await startAndSubmit(
                        paid.app,
                        learner.token,
                        true,
                    );
                    const claim = (await paid.module.store.claim())!;
                    expect(claim.id).toBe(previous.id);
                    const accounting = createInterviewAccounting({
                        database: authentication.productDependencies.database,
                        withOperation: (work) =>
                            paid.module.store.withOperation(claim, work),
                        ownerId: learner.userId,
                        operationId: claim.id,
                        leaseToken: claim.leaseToken,
                        execution: claim.execution as never,
                    });
                    const call = {
                        callId: randomUUID(),
                        purpose: 'answer' as const,
                        inputTokenEstimate: 3500,
                        maxOutputTokens: readInterviewOutputTokenLimit(
                            claim.execution as unknown as InterviewExecution,
                        ),
                    };
                    await accounting.admit(call);
                    await accounting.settle(call, {
                        inputTokens: charge - 900,
                        outputTokens: 300,
                    });
                    await paid.module.store.complete(
                        claim,
                        {
                            message: 'What else matters?',
                            topic: 'goals',
                            options: [],
                            multiSelect: false,
                        },
                        new Date(),
                    );
                }
            }
            const before =
                await authentication.productDependencies.database.transaction(
                    (tx) =>
                        new DrizzleAiCreditTransactionParticipant(
                            tx,
                        ).accountSummary(learner.userId, new Date()),
                );
            expect(before.availableCredits).toBe(balance);
            expect(before.reservedCredits).toBe(0n);
            const operation = await startAndSubmit(
                paid.app,
                learner.token,
                true,
            );
            const provider = scriptedTutorModel([
                kind !== 'invalid'
                    ? JSON.stringify({
                          message: 'Which language should explanations use?',
                          topic: 'explanation-languages',
                          options: [{ id: 'english', label: 'English' }],
                          multiSelect: true,
                          answerSummary: 'Learning Spanish',
                          proposedItems: {
                              languages: [{ language: 'es', learning: true }],
                              explanationLanguages: [],
                              goals: [],
                              accommodations: [],
                              hobbies: [],
                          },
                      })
                    : 'This is not valid JSON',
            ]);
            const worker = new InterviewWorkerService({
                store: paid.module.store,
                createRunner(claim) {
                    expect(claim.ownerId).toBe(learner.userId);
                    return createLearnerInterviewerRunner({
                        model: provider.model,
                        accounting: createInterviewAccounting({
                            database:
                                authentication.productDependencies.database,
                            withOperation: (work) =>
                                paid.module.store.withOperation(claim, work),
                            ownerId: learner.userId,
                            operationId: claim.id,
                            leaseToken: claim.leaseToken,
                            execution: claim.execution as never,
                        }),
                        maxOutputTokens: readInterviewOutputTokenLimit(
                            claim.execution as unknown as InterviewExecution,
                        ),
                        maxInputTokens: readInterviewInputTokenLimit(
                            claim.execution as unknown as InterviewExecution,
                        ),
                    });
                },
            });
            expect(await worker.processNext(new AbortController().signal)).toBe(
                true,
            );
            const finished = await paid.module.store.read(
                learner.userId,
                operation.id,
            );
            expect(finished?.state).toBe(
                kind !== 'invalid' ? 'succeeded' : 'failed',
            );
            expect(finished?.errorCode).toBe(
                kind !== 'invalid' ? null : 'invalid_model_output',
            );
            expect(provider.requests).toHaveLength(1);
            const [reservation] =
                await authentication.productDependencies.database
                    .select()
                    .from(aiCreditActionsTable)
                    .where(eq(aiCreditActionsTable.id, operation.id));
            expect(reservation?.state).toBe('settled');
            expect(reservation?.heldMilli).toBeLessThanOrEqual(balance);
            expect(reservation?.chargedMilli).toBe(
                kind === 'invalid' ? 0n : 86n,
            );
            expect(reservation?.chargedMilli).toBeLessThan(
                reservation!.heldMilli,
            );
            const calls = await authentication.productDependencies.database
                .select()
                .from(aiCreditActionAttemptsTable)
                .where(eq(aiCreditActionAttemptsTable.actionId, operation.id));
            expect(calls).toHaveLength(1);
            const snapshot = finished!
                .execution as unknown as InterviewExecution;
            expect(
                BigInt(
                    maximumTextPrice(
                        {
                            maxInputTokensPerAttempt:
                                readInterviewInputTokenLimit(snapshot),
                            maxOutputTokensPerAttempt:
                                readInterviewOutputTokenLimit(snapshot),
                        },
                        snapshot.snapshot!.creditPricing!,
                    ),
                ),
            ).toBeLessThanOrEqual(before.availableCredits);
            if (readInterviewOutputTokenLimit(snapshot) < 4096)
                expect(
                    BigInt(
                        maximumTextPrice(
                            {
                                maxInputTokensPerAttempt:
                                    readInterviewInputTokenLimit(snapshot),
                                maxOutputTokensPerAttempt:
                                    readInterviewOutputTokenLimit(snapshot) + 1,
                            },
                            snapshot.snapshot!.creditPricing!,
                        ),
                    ),
                ).toBeGreaterThan(before.availableCredits);
            expect(calls[0]?.inputTokens).toBe(50);
            expect(calls[0]?.outputTokens).toBe(12);
            if (kind === 'invalid') expect(finished?.result).toBeNull();
            if (kind === 'affordable') {
                expect(
                    provider.requests[0]?.maxOutputTokens,
                ).toBeGreaterThanOrEqual(1024);
                expect(provider.requests[0]?.maxOutputTokens).toBeLessThan(
                    4096,
                );
                expect(calls[0]?.outputLimit).toBe(
                    provider.requests[0]?.maxOutputTokens,
                );
                const state = PortraitStateSchema.parse(
                    await (
                        await request(paid.app, '/learner-portrait', {
                            token: learner.token,
                        })
                    ).json(),
                );
                const submitted = await request(
                    paid.app,
                    '/learner-portrait/interview/responses',
                    {
                        method: 'POST',
                        token: learner.token,
                        body: {
                            interviewId: operation.interviewId,
                            expectedVersion: state.version,
                            expectedGeneration: state.generation,
                            idempotencyKey: randomUUID(),
                            paidAcknowledged: true,
                            input: {
                                kind: 'answer',
                                topic: 'explanation-languages',
                                text: 'English',
                            },
                        },
                    },
                );
                expect(submitted.status, await submitted.clone().text()).toBe(
                    202,
                );
                const next = PortraitInterviewOperationResponseSchema.parse(
                    await submitted.json(),
                );
                const nextProvider = scriptedTutorModel([
                    JSON.stringify({
                        message: 'What will you use Spanish for?',
                        topic: 'goals',
                        options: [],
                        multiSelect: true,
                    }),
                ]);
                await new InterviewWorkerService({
                    store: paid.module.store,
                    createRunner(claim) {
                        expect(claim.id).toBe(next.id);
                        return createLearnerInterviewerRunner({
                            model: nextProvider.model,
                            accounting: createInterviewAccounting({
                                database:
                                    authentication.productDependencies.database,
                                withOperation: (work) =>
                                    paid.module.store.withOperation(
                                        claim,
                                        work,
                                    ),
                                ownerId: learner.userId,
                                operationId: claim.id,
                                leaseToken: claim.leaseToken,
                                execution: claim.execution as never,
                            }),
                            maxInputTokens: readInterviewInputTokenLimit(
                                claim.execution as unknown as InterviewExecution,
                            ),
                            maxOutputTokens: readInterviewOutputTokenLimit(
                                claim.execution as unknown as InterviewExecution,
                            ),
                        });
                    },
                }).processNext(new AbortController().signal);
                expect(
                    (await paid.module.store.read(learner.userId, next.id))
                        ?.state,
                ).toBe('succeeded');
                expect(nextProvider.requests).toHaveLength(1);
                expect(nextProvider.requests[0]?.maxOutputTokens).toBeLessThan(
                    provider.requests[0]!.maxOutputTokens!,
                );
                const uncertain = await startAndSubmit(
                    paid.app,
                    learner.token,
                    true,
                );
                const uncertainClaim = (await paid.module.store.claim())!;
                expect(uncertainClaim.id).toBe(uncertain.id);
                const uncertainAccounting = createInterviewAccounting({
                    database: authentication.productDependencies.database,
                    withOperation: (work) =>
                        paid.module.store.withOperation(uncertainClaim, work),
                    ownerId: learner.userId,
                    operationId: uncertainClaim.id,
                    leaseToken: uncertainClaim.leaseToken,
                    execution: uncertainClaim.execution as never,
                });
                const uncertainCall = {
                    callId: randomUUID(),
                    purpose: 'answer' as const,
                    inputTokenEstimate: 3500,
                    maxOutputTokens: readInterviewOutputTokenLimit(
                        uncertainClaim.execution as unknown as InterviewExecution,
                    ),
                };
                await uncertainAccounting.admit(uncertainCall);
                await uncertainAccounting.fail(uncertainCall, 'missing-usage');
                const [unknown] =
                    await authentication.productDependencies.database
                        .select()
                        .from(aiCreditActionsTable)
                        .where(eq(aiCreditActionsTable.id, uncertain.id));
                expect(unknown!.state).toBe('active');
                expect(unknown!.chargedMilli).toBeNull();
                expect(uncertainCall.maxOutputTokens).toBeLessThan(4096);
                await paid.module.store.fail(
                    uncertainClaim,
                    'test_complete',
                    new Date(),
                );
            }
        },
    );

    it('protects the admitted paid hold from concurrent wallet removal and retains its execution budget', async () => {
        const paid = await composed(false);
        const learner = await signup(paid.app, 'portrait-protected-funds');
        await grantCredits(learner.userId, 15_608n);
        const operation = await startAndSubmit(paid.app, learner.token, true);
        const admitted = await paid.module.store.read(
            learner.userId,
            operation.id,
        );
        await expect(
            authentication.productDependencies.database.transaction(
                async (tx) => {
                    const credits = new DrizzleAiCreditTransactionParticipant(
                        tx,
                    );
                    const account = await credits.accountSummary(
                        learner.userId,
                        new Date(),
                    );
                    expect(account.reservedCredits).toBe(15_608n);
                    expect(account.availableCredits).toBe(0n);
                    await credits.adjustByAdmin({
                        ownerId: learner.userId,
                        amount: -10_000n,
                        at: new Date(),
                        expectedManagementVersion: account.managementVersion,
                        expiresAt: null,
                        sourceReference: randomUUID(),
                        reason: 'Synthetic concurrent wallet change',
                    });
                },
            ),
        ).rejects.toThrow();
        const claim = await dispatchAndSettle(paid.module, learner.userId);
        expect(claim.id).toBe(operation.id);
        expect(claim.execution).toEqual(admitted!.execution);
        const [action] = await authentication.productDependencies.database
            .select()
            .from(aiCreditActionsTable)
            .where(eq(aiCreditActionsTable.id, operation.id));
        expect(action?.heldMilli).toBe(15_608n);
        expect(action?.chargedMilli).toBe(4n);
    });

    it.each([
        null, // A new learner has no credit account or wallet rows.
        0n,
        100n,
        BigInt(
            maximumTextPrice(
                {
                    maxInputTokensPerAttempt: interviewInputTokenLimit(
                        {
                            input: {
                                kind: 'answer',
                                topic: 'languages',
                                text: 'Spanish',
                            },
                            context: {
                                locale: 'en',
                                approvedItems: null,
                                draftItems: null,
                                messages: [],
                                completedTopics: [],
                            },
                        },
                        64000,
                    ),
                    maxOutputTokensPerAttempt: 1,
                },
                {
                    inputCreditsPerMillionTokens: 1000,
                    outputCreditsPerMillionTokens: 3000,
                },
            ),
        ) - 1n,
    ])(
        'rejects genuinely insufficient paid balance %s before enqueue or dispatch',
        async (amount) => {
            const paid = await composed(false);
            const learner = await signup(
                paid.app,
                `portrait-low-paid-${amount}`,
            );
            // Keep this regression runnable independently of earlier scenarios.
            const configured = await authentication.productDependencies.database
                .select()
                .from(dictionaryAiConfigurationTable);
            if (configured.length === 0) await configure(learner.userId);
            if (amount !== null) await grantCredits(learner.userId, amount);
            const state = PortraitStateSchema.parse(
                await (
                    await request(paid.app, '/learner-portrait', {
                        token: learner.token,
                    })
                ).json(),
            );
            const started = await request(
                paid.app,
                '/learner-portrait/interview',
                {
                    method: 'POST',
                    token: learner.token,
                    body: { expectedVersion: state.version, locale: 'en' },
                },
            );
            const interview = (await started.json()) as { interviewId: string };
            const submitted = await request(
                paid.app,
                '/learner-portrait/interview/responses',
                {
                    method: 'POST',
                    token: learner.token,
                    body: {
                        interviewId: interview.interviewId,
                        expectedVersion: state.version,
                        expectedGeneration: state.generation,
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
            expect(submitted.status).toBe(400);
            expect(await submitted.json()).toMatchObject({
                error: { code: 'credits_exhausted' },
            });
            expect(
                await authentication.productDependencies.database
                    .select()
                    .from(aiCreditActionsTable)
                    .where(eq(aiCreditActionsTable.ownerId, learner.userId)),
            ).toHaveLength(0);
            expect(
                await authentication.productDependencies.database
                    .select()
                    .from(learnerPortraitInterviewOperationsTable)
                    .where(
                        eq(
                            learnerPortraitInterviewOperationsTable.ownerId,
                            learner.userId,
                        ),
                    ),
            ).toHaveLength(0);
            expect(
                await authentication.productDependencies.database
                    .select()
                    .from(aiCreditReservationsTable)
                    .where(
                        eq(aiCreditReservationsTable.ownerId, learner.userId),
                    ),
            ).toHaveLength(0);
        },
    );

    it.each([
        { pin: undefined, reserved: 64000, valid: true },
        { pin: 4000, reserved: 4000, valid: true },
        { pin: null, reserved: 4000, valid: false },
        { pin: '4000', reserved: 4000, valid: false },
        { pin: 0, reserved: 4000, valid: false },
        { pin: 64001, reserved: 64001, valid: false },
        { pin: 4000, reserved: 3999, valid: false },
    ])(
        'database independently guards immutable input pin $pin with reservation $reserved',
        async ({ pin, reserved, valid }) => {
            const database = authentication.productDependencies.database;
            const [template] = await database
                .select()
                .from(learnerPortraitInterviewOperationsTable)
                .where(
                    eq(
                        learnerPortraitInterviewOperationsTable.state,
                        'succeeded',
                    ),
                )
                .limit(1);
            const callTemplate = legacyCallTemplate(template!);
            const execution = { ...template!.execution };
            delete execution.actionAccountingVersion;
            if (pin === undefined) delete execution.interviewInputTokenLimit;
            else execution.interviewInputTokenLimit = pin;
            const rollback = new Error('rollback synthetic pin probe');
            const probe = database.transaction(async (tx) => {
                await lockTextAiCapacity(tx);
                const id = randomUUID(),
                    reservationId = randomUUID();
                await tx
                    .insert(learnerPortraitInterviewOperationsTable)
                    .values({
                        ...template!,
                        id,
                        idempotencyKey: randomUUID(),
                        state: 'queued',
                        execution,
                        result: null,
                    });
                await tx.insert(portraitInterviewProviderCallsTable).values({
                    ...callTemplate!,
                    id: randomUUID(),
                    operationId: id,
                    reservationId,
                    ordinal: 1,
                    state: 'dispatched',
                    settledAt: null,
                    reservedInputTokens: reserved,
                    reservedOutputTokens: 4096,
                });
                const result = await tx.execute(
                    sql`select languon_portrait_credit_maximum(${id}::uuid, ${template!.ownerId}::uuid, ${reservationId}::uuid, 1) as maximum`,
                );
                expect(Number(result[0]!.maximum)).toBeGreaterThan(0);
                throw rollback;
            });
            if (valid) await expect(probe).rejects.toBe(rollback);
            else
                await expect(probe).rejects.toMatchObject({
                    cause: {
                        message: expect.stringMatching(
                            /pinned portrait request input bound|pinned token or memory bounds/,
                        ),
                    },
                });
        },
    );

    it.each([
        { pin: undefined, reserved: 4096, valid: true },
        { pin: 2048, reserved: 2048, valid: true },
        { pin: 2048, reserved: 2049, valid: false },
        { pin: 3000, reserved: 3000, modelLimit: 2048, valid: false },
        { pin: undefined, reserved: 2048, modelLimit: 2048, valid: true },
        ...[null, '2048', 0, -1, 1023, 4097, 8193, 1024.5].map((pin) => ({
            pin,
            reserved: 2048,
            valid: false,
        })),
    ])(
        'database independently enforces output pin $pin and reservation $reserved',
        async ({ pin, reserved, valid, ...model }) => {
            const database = authentication.productDependencies.database;
            const [template] = await database
                .select()
                .from(learnerPortraitInterviewOperationsTable)
                .where(
                    eq(
                        learnerPortraitInterviewOperationsTable.state,
                        'succeeded',
                    ),
                )
                .limit(1);
            const callTemplate = legacyCallTemplate(template!);
            const execution = { ...template!.execution };
            delete execution.actionAccountingVersion;
            if ('modelLimit' in model)
                execution.snapshot = {
                    ...(execution.snapshot as Record<string, unknown>),
                    perCallMaxOutputTokens: model.modelLimit,
                };
            if (pin === undefined) delete execution.interviewOutputTokenLimit;
            else execution.interviewOutputTokenLimit = pin;
            const rollback = new Error('rollback output budget probe');
            const probe = database.transaction(async (tx) => {
                await lockTextAiCapacity(tx);
                const id = randomUUID(),
                    reservationId = randomUUID();
                await tx
                    .insert(learnerPortraitInterviewOperationsTable)
                    .values({
                        ...template!,
                        id,
                        idempotencyKey: randomUUID(),
                        state: 'queued',
                        execution,
                        result: null,
                    });
                await tx.insert(portraitInterviewProviderCallsTable).values({
                    ...callTemplate!,
                    id: randomUUID(),
                    operationId: id,
                    reservationId,
                    ordinal: 1,
                    state: 'dispatched',
                    settledAt: null,
                    reservedOutputTokens: reserved,
                });
                const result = await tx.execute(
                    sql`select languon_portrait_credit_maximum(${id}::uuid,${template!.ownerId}::uuid,${reservationId}::uuid,1) as maximum`,
                );
                expect(Number(result[0]!.maximum)).toBeGreaterThan(0);
                throw rollback;
            });
            if (valid) await expect(probe).rejects.toBe(rollback);
            else
                await expect(probe).rejects.toMatchObject({
                    cause: {
                        message: expect.stringMatching(
                            /pinned portrait request output bound|pinned token or memory bounds/,
                        ),
                    },
                });
        },
    );

    it('settles an expired paid provider call and erases portrait content under the restricted purge role', async () => {
        const paid = await composed(false);
        const learner = await signup(paid.app, 'portrait-purge-paid');
        await grantCredits(learner.userId);
        const operation = await startAndSubmit(paid.app, learner.token, true);
        const dispatched = await dispatchOnly(paid.module, learner.userId);
        const database = authentication.productDependencies.database;
        await database
            .update(learnerPortraitInterviewOperationsTable)
            .set({ leaseUntil: new Date(Date.now() - 1) })
            .where(
                eq(learnerPortraitInterviewOperationsTable.id, operation.id),
            );
        await database
            .update(usersTable)
            .set({ status: 'deletion_pending' })
            .where(eq(usersTable.id, learner.userId));

        await database.execute(
            sql`insert into account_deletion_requests(user_id,state,scheduled_at,purge_at,next_attempt_at,lease_deadline,lease_worker_id,fencing_token,updated_at) values(${learner.userId}::uuid,'running',clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '1 minute',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '5 minutes','portrait-purge-scope',1,clock_timestamp())`,
        );

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
                await requestPortraitCancellation(tx, learner.userId, {
                    workerId: 'portrait-purge-scope',
                    fencingToken: 1,
                });
                expect(
                    await portraitDeletionBusy(tx, learner.userId, new Date(), {
                        workerId: 'portrait-purge-scope',
                        fencingToken: 1,
                    }),
                ).toBe(false);
                await eraseOwnerLearnerPortrait(
                    tx,
                    learner.userId,
                    new Date(),
                    { workerId: 'portrait-purge-scope', fencingToken: 1 },
                );
            });

            const [action] = await database
                .select()
                .from(aiCreditActionsTable)
                .where(eq(aiCreditActionsTable.id, operation.id));
            const [allocation] = await database
                .select()
                .from(aiCreditActionAllocationsTable)
                .where(
                    eq(aiCreditActionAllocationsTable.actionId, operation.id),
                );
            expect(action?.state).toBe('settled');
            expect(action?.measurement).toBe('unknown');
            expect(action?.outcome).toBe('failure');
            expect(action?.chargedMilli).toBe(0n);
            expect(allocation?.settledMilli).toBe(0n);
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
            const [attempt] = await database
                .select()
                .from(aiCreditActionAttemptsTable)
                .where(
                    eq(aiCreditActionAttemptsTable.id, dispatched.call.callId),
                );
            expect(attempt?.state).toBe('settled');
            expect(attempt?.inputTokens).toBeNull();
            expect(attempt?.outputTokens).toBeNull();
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

/** Legacy guards remain exercised with an explicit pre-action-accounting call shape. */
function legacyCallTemplate(
    operation: typeof learnerPortraitInterviewOperationsTable.$inferSelect,
): typeof portraitInterviewProviderCallsTable.$inferInsert {
    const budget = operation.execution.budget as InterviewExecution['budget'];
    return {
        id: randomUUID(),
        operationId: operation.id,
        ownerId: operation.ownerId,
        ordinal: 1,
        purpose: 'actor',
        reservationId: randomUUID(),
        state: 'dispatched',
        reservedCostMicros: 0,
        reservedInputTokens: 64000,
        reservedOutputTokens: 4096,
        actualCostMicros: 0,
        actualInputTokens: 0,
        actualOutputTokens: 0,
        ...budget,
        createdAt: new Date(),
        dispatchedAt: new Date(),
        settledAt: null,
    };
}
