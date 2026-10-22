// @user-flow-revision texts sha256:14f45057f0007c00
import { randomUUID } from 'node:crypto';
import {
    AuthenticationSuccessResponseSchema,
    SignUpResponseSchema,
    TextFolderResponseSchema,
    TextResponseSchema,
    TextAiJobResponseSchema,
    TextSelectionJobResponseSchema,
    TextShareResponseSchema,
    SharedTextResponseSchema,
} from '@languon/contracts';
import { sql, eq, max, and, inArray, or, isNotNull } from 'drizzle-orm';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { DrizzleAiCreditTransactionParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { textsAiJobsTable } from '../../../../src/modules/texts/infrastructure/persistence/drizzle/texts-job-schema';
import { createDictionaryComposition } from '../../../../src/modules/dictionaries/infrastructure/dictionary-composition';
import { UserProfileService } from '../../../../src/modules/users/application/user-profile-service';
import { DrizzleUsersUnitOfWork } from '../../../../src/modules/users/infrastructure/persistence/drizzle/drizzle-users-unit-of-work';
import { createApp } from '../../../../src/app';
import { loadEnvironment } from '../../../../src/config/environment';
import {
    createAuthenticationComposition,
    type AuthenticationComposition,
} from '../../../../src/modules/authentication/infrastructure/authentication-composition';
import { createTextsContentComposition } from '../../../../src/modules/texts/infrastructure/texts-composition';
import {
    createTextsAiComposition,
    createTextsWorkerComposition,
} from '../../../../src/modules/texts/infrastructure/texts-ai-composition';
import {
    loadTextTranslationProposal,
    resolveTextTranslationProposal,
} from '../../../../src/modules/texts/infrastructure/persistence/drizzle/texts-job-support';
import { createTextsJobRoutes } from '../../../../src/modules/texts/interface/http/texts-job.routes';
import { createTextSelectionModule } from '../../../../src/modules/dictionaries/infrastructure/text-selection-composition';
import { createTextSelectionRoutes } from '../../../../src/modules/dictionaries/interface/http/text-selection.routes';
import { BoundedDictionaryRateLimiter } from '../../../../src/modules/dictionaries/infrastructure/rate-limit/bounded-dictionary-rate-limiter';
import { DrizzleTextAiAdmissionParticipant } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant';
import {
    defaultTextAiProviderBudgetPolicy,
    textAiModelCatalog,
    textAiTextsFormats,
} from '../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import {
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
    dictionaryAiWorkerObservationsTable,
} from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { textsExecutionObservationId } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness';
import {
    dictionariesTable,
    dictionaryCardsTable,
} from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import {
    isDatabaseIntegrationEnabled,
    getTestDatabaseUrl,
    createTestPostgresClient,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';
import {
    redisIntegrationEnabled,
    uniqueAuthRedisNamespace,
    createTestRedisClient,
    deleteNamespacedKeys,
} from '../../support/test-redis';

const run = describe.runIf(
    isDatabaseIntegrationEnabled() && redisIntegrationEnabled,
);
const origin = 'http://localhost:3333';
const secret = 'synthetic-texts-journey-dictionary-secret-at-least-40-bytes';
const namespace = uniqueAuthRedisNamespace('texts-journeys');
const signal = new AbortController().signal;
const selectionPolicy = {
    routingEnabled: true,
    credentialConfigured: () => true,
    pricingAdmissionEnabled: true,
};
run('Texts real composed authenticated HTTP journeys', () => {
    let authentication: AuthenticationComposition;
    let app: ReturnType<typeof createApp>;
    let content: ReturnType<typeof createTextsContentComposition>;
    let ai: ReturnType<typeof createTextsAiComposition>;
    let worker: ReturnType<typeof createTextsWorkerComposition>['worker'];
    let selection: ReturnType<typeof createTextSelectionModule>;
    let selectionRateCalls = 0;
    let fixtureToken: string;
    beforeAll(async () => {
        // Reset and migrate only this explicitly dedicated journey target.
        const database = createTestPostgresClient();
        await resetTestDatabase(database);
        await migrateTestDatabase(database);
        await database.end();
        authentication = await createAuthenticationComposition(
            loadEnvironment({
                APP_ENV: 'test',
                NODE_ENV: 'test',
                AUTH_ALLOWED_ORIGINS: origin,
                AUTH_WEBAUTHN_RP_ID: 'localhost',
                AUTH_CODE_HMAC_SECRET:
                    'synthetic-texts-code-secret-at-least-forty-bytes',
                AUTH_JWT_SECRET:
                    'synthetic-texts-jwt-secret-at-least-forty-bytes',
                DICTIONARY_HMAC_SECRET: secret,
                AUTH_REDIS_NAMESPACE: namespace,
                DATABASE_URL: getTestDatabaseUrl(),
                REDIS_URL: process.env.AUTH_TEST_REDIS_URL,
            }),
        );
        const d = authentication.productDependencies;
        const authenticate = async (token: string) => {
            const claims = await d.accessTokens.verify(token);
            await d.authentication.requireActiveSession(claims);
            return { userId: claims.userId, sessionId: claims.sessionId };
        };
        content = createTextsContentComposition({
            ...d,
            dictionaryHmacSecret: secret,
            policy: authentication.options.policy,
            loadProposal: loadTextTranslationProposal,
        });
        ai = createTextsAiComposition({
            burstLimiter: { consume: async () => ({ allowed: true }) },
            database: d.database,
            enabled: true,
            fingerprintSecret: secret,
            authenticate,
            clock: d.clock,
            budget: defaultTextAiProviderBudgetPolicy,
            admissionParticipant: (tx) =>
                new DrizzleTextAiAdmissionParticipant(tx, selectionPolicy),
        });
        const execution = createTextsWorkerComposition({
            database: d.database,
            clock: d.clock,
            workerId: 'texts-journey',
            leaseMs: 30000,
            heartbeatMs: 10000,
            timeoutMs: 20000,
            globalConcurrency: 10,
            userConcurrency: 2,
            maxAttempts: 2,
            retryDelayMs: 1,
            supportedFormats: [
                'text-detection:v1',
                'text-translation:v1',
                'text-translation:v2',
            ],
            provider: {
                async run({ input }) {
                    return {
                        draft:
                            input.kind === 'text-detection'
                                ? { language: 'en', confidence: 'high' }
                                : {
                                      translation: input.segments.map((p) => ({
                                          pairId: p.pairId,
                                          text: 'Hola mundo.',
                                      })),
                                  },
                        usage: { inputTokens: 20, outputTokens: 10 },
                    };
                },
            },
        });
        worker = execution.worker;
        selection = createTextSelectionModule({
            database: d.database,
            authentication: { authenticate },
            admissionsEnabled: true,
            selectionPolicy,
            globalConcurrency: 10,
            ownerConcurrency: 2,
            leaseMs: 30000,
            verifyShare: (key, digest) =>
                content.cryptography.verifyShare(key, digest),
            proposal: resolveTextTranslationProposal,
            generator: {
                async generate() {
                    return {
                        delta: {
                            sourceResult: { kind: 'unchanged' },
                            suggestions: [
                                { field: 'translation', value: 'hola' },
                                { field: 'definition', value: 'A greeting' },
                                { field: 'example', value: 'Hello, friend.' },
                                {
                                    field: 'exampleTranslation',
                                    value: 'Hola, amigo.',
                                },
                            ],
                        },
                        usage: { inputTokens: 15, outputTokens: 8 },
                    };
                },
            },
        });
        app = createApp({
            authentication: authentication.options,
            texts: content.routes,
            dictionaries: createDictionaryComposition({
                ...d,
                dictionaryHmacSecret: secret,
                policy: authentication.options.policy,
            }).routes,
            userProfiles: {
                accessTokens: d.accessTokens,
                authentication: d.authentication,
                policy: authentication.options.policy,
                profiles: new UserProfileService(
                    new DrizzleUsersUnitOfWork(d.database),
                ),
            },
            textsAi: createTextsJobRoutes({
                service: ai.service,
                policy: authentication.options.policy,
            }),
            textSelections: createTextSelectionRoutes({
                service: selection.service,
                policy: authentication.options.policy,
                rateLimiter: {
                    consume: async (input) => {
                        selectionRateCalls++;
                        return new BoundedDictionaryRateLimiter(
                            d.rateLimiter,
                        ).consume(input);
                    },
                },
            }),
        });
        const administrator = await signup();
        fixtureToken = administrator;
        const creator = await d.accessTokens.verify(administrator);
        const model = textAiModelCatalog[0]!;
        const revisionId = randomUUID();
        const now = new Date();
        const [latestRevision] = await d.database
            .select({
                latest: max(dictionaryAiConfigurationRevisionsTable.version),
            })
            .from(dictionaryAiConfigurationRevisionsTable);
        const nextRevision = (latestRevision?.latest ?? 0) + 1;
        await d.database
            .insert(dictionaryAiConfigurationRevisionsTable)
            .values({
                id: revisionId,
                version: nextRevision,
                createdByUserId: creator.userId,
                createdAt: now,
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
                    supportedFormats: [...textAiTextsFormats],
                },
            });
        await d.database
            .insert(dictionaryAiConfigurationTable)
            .values({
                id: 'global',
                activeRevisionId: revisionId,
                version: 1,
                updatedAt: now,
            })
            .onConflictDoUpdate({
                target: dictionaryAiConfigurationTable.id,
                set: { activeRevisionId: revisionId, updatedAt: now },
            });
        await d.database
            .insert(dictionaryAiWorkerObservationsTable)
            .values({
                id: textsExecutionObservationId(
                    'texts-journey',
                    model.providerId,
                    model.id,
                ),
                workerId: 'texts-journey',
                providerId: model.providerId,
                modelId: model.id,
                adapterRevision: model.adapterRevision,
                status: 'available',
                message: 'Deterministic Texts journey provider',
                checkedAt: now,
                expiresAt: new Date(now.getTime() + 3600000),
                textAiSelectionRevision: 1,
                textAiCapacityRevision: 1,
                textsCapacityRevision: 1,
                textsExecutionRevision: 1,
                creditSettlementRevision: 1,
                textAiSupportedFormats: [...textAiTextsFormats],
            })
            .onConflictDoNothing();
    }, 30000);
    afterAll(async () => {
        await authentication?.close();
        const redis = createTestRedisClient();
        await redis.connect();
        await deleteNamespacedKeys(redis, namespace);
        await redis.quit();
    });
    async function request(
        path: string,
        token?: string,
        body?: unknown,
        method = body === undefined ? 'GET' : 'POST',
        key?: string,
    ) {
        return app.request(path, {
            method,
            headers: {
                Origin: origin,
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(key ? { 'x-languon-share-key': key } : {}),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
    }
    async function signup() {
        const response = await request('/auth/sign-up', undefined, {
            email: `texts-${randomUUID()}@example.test`,
            password: 'Synthetic safe journey password 47!',
        });
        expect(response.status).toBe(202);
        const { verification } = SignUpResponseSchema.parse(
            await response.json(),
        );
        const verified = await request(
            '/auth/email-verification/verify',
            undefined,
            { flowId: verification.flowId, code: '0000' },
        );
        expect(verified.status).toBe(200);
        const token = AuthenticationSuccessResponseSchema.parse(
            await verified.json(),
        ).accessToken;
        const claims =
            await authentication.productDependencies.accessTokens.verify(token);
        await authentication.productDependencies.database.transaction((tx) =>
            new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                ownerId: claims.userId,
                amount: 1000000000n,
                createdAt: new Date(),
                expiresAt: null,
                source: 'admin',
                sourceReference: randomUUID(),
            }),
        );
        return token;
    }
    async function folder(token: string) {
        const response = await request('/text-folders', token, {
            name: 'Journey folder',
        });
        expect(response.status).toBe(201);
        return TextFolderResponseSchema.parse(await response.json()).folder;
    }
    async function translated(token: string) {
        const parent = await folder(token);
        const created = await request('/texts', token, {
            folderId: parent.id,
            sourceText: 'Hello world.',
            sourceLanguage: 'en',
            targetLanguage: 'es',
        });
        expect(created.status).toBe(201);
        const draft = TextResponseSchema.parse(await created.json()).text;
        const input = {
            folderId: parent.id,
            textId: draft.id,
            expectedTextVersion: 1,
            sourceText: draft.sourceText,
            sourceLanguage: 'en',
            targetLanguage: 'es',
            operationId: randomUUID(),
        };
        const queued = await request('/texts/ai/translation', token, input);
        expect(queued.status, JSON.stringify(await queued.clone().json())).toBe(
            202,
        );
        const job = TextAiJobResponseSchema.parse(await queued.json()).job;
        const replay = await request('/texts/ai/translation', token, input);
        expect(TextAiJobResponseSchema.parse(await replay.json()).job.id).toBe(
            job.id,
        );
        expect(await worker.processNext(signal)).toBe(true);
        const completed = await request(`/texts/ai/jobs/${job.id}`, token);
        expect(
            TextAiJobResponseSchema.parse(await completed.json()).job.state,
        ).toBe('completed');
        const unsaved = await request(`/texts/${draft.id}`, token);
        expect(TextResponseSchema.parse(await unsaved.json()).text.status).toBe(
            'draft',
        );
        const saved = await request(
            `/texts/${draft.id}`,
            token,
            { kind: 'proposal', expectedVersion: 1, jobId: job.id },
            'PUT',
        );
        expect(saved.status, await saved.clone().text()).toBe(200);
        return {
            parent,
            text: TextResponseSchema.parse(await saved.json()).text,
        };
    }
    it('composed preflight preserves each module methods and real share-key header', async () => {
        const baseline = selectionRateCalls;
        const id = randomUUID();
        const cases = [
            [`/text-folders/${id}`, 'PATCH'],
            [`/texts/${id}`, 'PUT'],
            [`/texts/${id}/share`, 'DELETE'],
            [`/shared-texts/${'a'.repeat(24)}`, 'GET'],
            ['/texts/ai/translation', 'POST'],
            ['/dictionaries/text-selections', 'POST'],
            [`/dictionaries/${id}`, 'PATCH'],
            ['/users/me/handle', 'PATCH'],
        ];
        for (const [path, method] of cases) {
            const response = await app.request(path!, {
                method: 'OPTIONS',
                headers: {
                    Origin: origin,
                    'Access-Control-Request-Method': method!,
                    'Access-Control-Request-Headers':
                        'authorization,content-type,x-languon-share-key',
                },
            });
            expect(response.status, path).toBe(204);
            expect(
                response.headers.get('Access-Control-Allow-Origin'),
                path,
            ).toBe(origin);
            expect(
                response.headers
                    .get('Access-Control-Allow-Methods')
                    ?.split(/,\s*/),
                path,
            ).toContain(method);
            if (
                path!.startsWith('/shared-') ||
                path === '/dictionaries/text-selections'
            )
                expect(
                    response.headers
                        .get('Access-Control-Allow-Headers')
                        ?.toLowerCase(),
                    path,
                ).toContain('x-languon-share-key');
        }
        expect(selectionRateCalls).toBe(baseline);
        for (const path of [
            '/texts',
            '/texts/ai/translation',
            '/dictionaries/text-selections',
        ]) {
            const denied = await app.request(path, {
                method: 'OPTIONS',
                headers: {
                    Origin: 'https://untrusted.example',
                    'Access-Control-Request-Method': 'POST',
                },
            });
            expect(denied.status).toBe(403);
            expect(
                denied.headers.get('Access-Control-Allow-Origin'),
            ).toBeNull();
        }
    });
    it('accepts contract-valid ASCII and Unicode text above selection body limit without consuming selection quota', async () => {
        const token = await signup(),
            parent = await folder(token);
        const baseline = selectionRateCalls;
        for (const sourceText of ['A'.repeat(17000), '世'.repeat(20000)]) {
            const response = await request('/texts', token, {
                folderId: parent.id,
                sourceText,
                sourceLanguage: 'en',
                targetLanguage: 'es',
            });
            expect(response.status, await response.clone().text()).toBe(201);
            expect(
                TextResponseSchema.parse(await response.json()).text.sourceText,
            ).toBe(sourceText);
        }
        const languages = await request('/languages');
        expect(languages.status).toBe(200);
        expect(selectionRateCalls).toBe(baseline);
    }, 30000);
    // @user-flow texts/owner-translates-edits-and-collects
    it('owner explicitly saves translation, edits alignment, and atomically creates dictionary/card', async () => {
        const token = await signup();
        const { text } = await translated(token);
        const pairs = text.alignment!.source.map((p, i) => ({
            pairId: p.pairId,
            source: p.text,
            translation:
                i === 0
                    ? 'Hola planeta.'
                    : text.alignment!.translation[i]!.text,
        }));
        const response = await request(
            `/texts/${text.id}`,
            token,
            { kind: 'edits', expectedVersion: 2, pairs },
            'PUT',
        );
        expect(response.status).toBe(200);
        const edited = TextResponseSchema.parse(await response.json()).text;
        expect(edited.status).toBe('edited');
        expect(edited.alignment!.editedPairIds).toEqual([pairs[0]!.pairId]);
        const targetName = `Collected ${randomUUID()}`;
        const input = {
            operationId: randomUUID(),
            source: {
                kind: 'owned-text',
                textId: edited.id,
                expectedTextVersion: 3,
            },
            selection: {
                side: 'source',
                pairId: pairs[0]!.pairId,
                startOffset: 0,
                endOffset: 5,
            },
            target: { kind: 'new', name: targetName },
        };
        const [selected, duplicate] = await Promise.all([
            request('/dictionaries/text-selections', token, input),
            request('/dictionaries/text-selections', token, input),
        ]);
        expect(selected.status, await selected.clone().text()).toBe(202);
        const job = TextSelectionJobResponseSchema.parse(
            await selected.json(),
        ).job;
        expect(duplicate.status).toBe(202);
        expect(
            TextSelectionJobResponseSchema.parse(await duplicate.json()).job.id,
        ).toBe(job.id);
        expect(job.dictionaryId).toBeNull();
        expect(
            await authentication.productDependencies.database
                .select()
                .from(dictionariesTable)
                .where(eq(dictionariesTable.name, targetName)),
        ).toHaveLength(0);
        expect(await selection.worker.processNext(signal)).toBe(true);
        const polled = await request(
            `/dictionaries/text-selections/${job.id}`,
            token,
        );
        expect(polled.status).toBe(200);
        const result = TextSelectionJobResponseSchema.parse(
            await polled.json(),
        ).job;
        expect(result.state).toBe('completed');
        expect(result.dictionaryId).not.toBeNull();
        expect(result.cardId).not.toBeNull();
        const cards = await authentication.productDependencies.database
            .select()
            .from(dictionaryCardsTable)
            .where(eq(dictionaryCardsTable.dictionaryId, result.dictionaryId!));
        expect(cards).toHaveLength(1);
        const retry = await request(
            '/dictionaries/text-selections',
            token,
            input,
        );
        expect(
            TextSelectionJobResponseSchema.parse(await retry.json()).job.id,
        ).toBe(job.id);
    }, 30000);
    // @user-flow texts/shared-reading-copy-and-revocation
    it('anonymous shared reading, reader copy, and revocation preserve the private copy', async () => {
        const owner = await signup(),
            reader = await signup();
        const { text } = await translated(owner);
        const destination = await folder(reader);
        const issued = await request(`/texts/${text.id}/share`, owner, {
            expectedVersion: 2,
        });
        expect(issued.status, await issued.clone().text()).toBe(200);
        const { capability } = TextShareResponseSchema.parse(
            await issued.json(),
        );
        const path = `/shared-texts/${capability.shareId}`;
        expect((await request(path)).status).toBe(400);
        const read = await request(
            path,
            undefined,
            undefined,
            'GET',
            capability.key,
        );
        expect(read.status).toBe(200);
        expect(read.headers.get('cache-control')).toContain('no-store');
        expect(read.headers.get('referrer-policy')).toBe('no-referrer');
        expect(read.headers.get('x-robots-tag')).toContain('noindex');
        expect(
            SharedTextResponseSchema.parse(await read.json()).texts[0]!
                .sourceText,
        ).toBe(text.sourceText);
        const selected = await request(
            '/dictionaries/text-selections',
            reader,
            {
                operationId: randomUUID(),
                source: {
                    kind: 'shared-text',
                    shareId: capability.shareId,
                    textId: text.id,
                    expectedTextVersion: 2,
                },
                selection: {
                    side: 'source',
                    pairId: text.alignment!.source[0]!.pairId,
                    startOffset: 0,
                    endOffset: 5,
                },
                target: { kind: 'new', name: 'Shared selection' },
            },
            'POST',
            capability.key,
        );
        expect(selected.status, await selected.clone().text()).toBe(202);
        const sharedJob = TextSelectionJobResponseSchema.parse(
            await selected.json(),
        ).job;
        const cancelled = await request(
            `/dictionaries/text-selections/${sharedJob.id}/cancel`,
            reader,
            {},
        );
        expect(cancelled.status).toBe(200);
        expect(
            TextSelectionJobResponseSchema.parse(await cancelled.json()).job
                .state,
        ).toBe('cancelled');
        const body = {
            folderId: destination.id,
            expectedVersion: 2,
            operationId: randomUUID(),
        };
        const copied = await request(
            `${path}/copy`,
            reader,
            body,
            'POST',
            capability.key,
        );
        expect(copied.status, await copied.clone().text()).toBe(201);
        const copiedId = ((await copied.json()) as { id: string }).id;
        const copy = TextResponseSchema.parse(
            await (await request(`/texts/${copiedId}`, reader)).json(),
        ).text;
        expect(copy.id).not.toBe(text.id);
        expect(copy.alignment!.source[0]!.pairId).not.toBe(
            text.alignment!.source[0]!.pairId,
        );
        const revoked = await request(
            `/texts/${text.id}/share`,
            owner,
            { expectedVersion: 2 },
            'DELETE',
        );
        expect(revoked.status).toBe(204);
        expect(
            (await request(path, undefined, undefined, 'GET', capability.key))
                .status,
        ).toBe(404);
        const retained = await request(`/texts/${copy.id}`, reader);
        expect(
            TextResponseSchema.parse(await retained.json()).text.sourceText,
        ).toBe(text.sourceText);
    }, 30000);
    it('bounded expiry cleanup makes progress across more than one batch of terminal raw results', async () => {
        const token = fixtureToken;
        const owner =
            await authentication.productDependencies.accessTokens.verify(token);
        const parent = await content.store.createFolder(owner.userId, {
            name: 'Cleanup fixture',
            description: null,
        });
        await ai.store.enqueue(
            owner.userId,
            'text-detection',
            {
                folderId: parent.id,
                sourceText: 'Hello world.',
                operationId: randomUUID(),
            },
            { now: new Date(), signal },
        );
        await worker.processNext(signal);
        const database = authentication.productDependencies.database;
        const [template] = await database
            .select()
            .from(textsAiJobsTable)
            .where(eq(textsAiJobsTable.ownerId, owner.userId));
        expect(template?.executionState).toBe('completed');
        const ids = Array.from({ length: 205 }, () => randomUUID());
        await database
            .transaction(async (tx) => {
                await tx.execute(
                    sql`select set_config('languon.texts_execution_revision','1',true),set_config('languon.texts_capacity_revision','1',true),set_config('languon.text_ai_selection_revision','1',true),set_config('languon.ai_credit_settlement_revision','1',true)`,
                );
                await tx.insert(textsAiJobsTable).values(
                    ids.map((id) => ({
                        ...template!,
                        id,
                        operationId: randomUUID(),
                        expiresAt: new Date(Date.now() - 1000),
                    })),
                );
            })
            .catch((error: unknown) => {
                throw new Error(
                    String((error as { cause?: Error }).cause?.message),
                );
            });
        for (let i = 0; i < 3; i++)
            await ai.store.claimNext(
                {
                    workerId: 'cleanup',
                    leaseMs: 30000,
                    globalConcurrency: 10,
                    userConcurrency: 2,
                    supportedFormats: [
                        'text-translation:v1',
                        'text-translation:v2',
                    ],
                },
                { now: new Date(), signal },
            );
        const remaining = await database
            .select({ id: textsAiJobsTable.id })
            .from(textsAiJobsTable)
            .where(
                and(
                    inArray(textsAiJobsTable.id, ids),
                    or(
                        isNotNull(textsAiJobsTable.inputPayload),
                        isNotNull(textsAiJobsTable.resultPayload),
                    ),
                ),
            );
        expect(remaining).toHaveLength(0);
        expect(
            await database
                .select({ id: textsAiJobsTable.id })
                .from(textsAiJobsTable)
                .where(inArray(textsAiJobsTable.id, ids)),
        ).toHaveLength(205);
    }, 30000);
});
