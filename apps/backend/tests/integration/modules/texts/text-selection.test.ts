import {
    fixtureRouteFingerprint,
    seedTextAiRoutingFixture,
} from '../../../support/text-ai-routing-fixture';
import { aiProviderExpenseRecordsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-schema';
import { DrizzleTextAiRoutingStore } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/drizzle-text-ai-routing-store';
import { textAiRoutingRevisionsTable } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/routing-schema';
import { cardAuthoringProviderInputTokens } from '../../../../src/modules/dictionaries/infrastructure/ai/card-authoring-input-envelope';
import { DictionaryTextProviderRouter } from '../../../../src/modules/dictionaries/infrastructure/ai/dictionary-text-provider-router';
import { selectionProviderInput } from '../../../../src/modules/dictionaries/domain/text-selection';
import { defaultDictionarySettings } from '../../../../src/modules/dictionaries/domain/settings';
import { seedLegacyActionFixture } from '../../../support/legacy-action-fixture';
import {
    aiCreditActionsTable as actions,
    aiCreditActionAttemptsTable as actionAttempts,
} from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
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
import {
    beforeAll,
    beforeEach,
    afterAll,
    afterEach,
    describe,
    it,
    expect,
    vi,
} from 'vitest';
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
        now = new Date();
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
        await seedLegacyActionFixture(db, '100');
        options = {
            selectionPolicy: {
                routingEnabled: true,
                credentialConfigured: () => true,
                routeFingerprint: fixtureRouteFingerprint,
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
    afterEach(() => vi.unstubAllGlobals());
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
    it.each([-1, 1])(
        'matches real provider input limits at the per-call boundary (%i byte)',
        async (offset) => {
            const baseSentence = 'Hello .';
            const model = textAiModelCatalog[0]!;
            const providerInput = (sentence: string) =>
                selectionProviderInput(
                    {
                        phrase: 'Hello',
                        sentence,
                        previousSentence: null,
                        nextSentence: null,
                        startOffset: 0,
                        endOffset: 5,
                        sourceLanguageTag: 'en',
                        targetLanguageTag: 'es',
                    },
                    defaultDictionarySettings,
                    null,
                );
            const padding =
                model.perCallMaxInputTokens +
                offset -
                cardAuthoringProviderInputTokens(providerInput(baseSentence));
            // Multibyte context reaches the token ceiling within the text character limit.
            const context =
                '界'.repeat(Math.floor(padding / 3)) + 'x'.repeat(padding % 3);
            const sentence = `Hello ${context}.`;
            const expectedInput = providerInput(sentence);
            expect(cardAuthoringProviderInputTokens(expectedInput)).toBe(
                model.perCallMaxInputTokens + offset,
            );
            const longSource = segmentText(sentence, 'en', randomUUID);
            const longAlignment = validateTranslation(
                longSource,
                longSource.map((pair) => ({
                    pairId: pair.pairId,
                    text: 'Hola.',
                })),
            );
            store = new DrizzleTextSelectionStore(db, {
                ...options,
                proposal: async () => ({
                    alignment: longAlignment,
                    sourceLanguage: 'en',
                    targetLanguage: 'es',
                }),
            });
            const selected = request();
            selected.selection.pairId = longSource[0]!.pairId;
            let calls = 0;
            vi.stubGlobal('fetch', async (url: unknown, init?: RequestInit) => {
                expect(String(url)).toBe(
                    'https://api.deepseek.com/chat/completions',
                );
                expect(init?.method).toBe('POST');
                const body = JSON.parse(String(init?.body));
                expect(body.max_tokens).toBeGreaterThan(0);
                expect(body.max_tokens).toBeLessThanOrEqual(
                    model.perCallMaxOutputTokens,
                );
                calls++;
                return new Response(
                    JSON.stringify({
                        id: 'synthetic-selection-boundary',
                        object: 'chat.completion',
                        created: 0,
                        model: 'deepseek-flash',
                        choices: [
                            {
                                index: 0,
                                message: {
                                    role: 'assistant',
                                    content: JSON.stringify(delta),
                                },
                                finish_reason: 'stop',
                            },
                        ],
                        usage: {
                            prompt_tokens: 100,
                            completion_tokens: 20,
                            total_tokens: 120,
                        },
                    }),
                    { headers: { 'Content-Type': 'application/json' } },
                );
            });
            if (offset > 0) {
                await expect(
                    store.enqueue(owner, selected),
                ).rejects.toMatchObject({ code: 'model_input_too_large' });
                expect(await db.select().from(jobs)).toHaveLength(0);
                expect(await db.select().from(actions)).toHaveLength(0);
                expect(await db.select().from(actionAttempts)).toHaveLength(0);
                expect(
                    await db.select().from(aiCreditReservationsTable),
                ).toHaveLength(0);
                expect(calls).toBe(0);
                return;
            }
            await store.enqueue(owner, selected);
            const lease = await claim();
            expect(lease.input).toEqual(expectedInput);
            expect(lease.execution).not.toBeNull();
            expect(await store.dispatch(lease)).toBe(true);
            const router = new DictionaryTextProviderRouter({
                credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
                currentFingerprint: fixtureRouteFingerprint,
            });
            const result = await router
                .resolve(lease.execution!, lease.budget)
                .cardAuthoring.generate({
                    input: lease.input,
                    providerBudget: lease.budget,
                    providerExecution: lease.execution,
                    idempotencyKey: `text-selection:${lease.id}:${lease.attempt}`,
                    signal: new AbortController().signal,
                });
            expect(calls).toBe(1);
            expect('delta' in result && result.delta).toEqual(delta);
            expect(
                await store.complete(
                    lease,
                    'delta' in result ? result.delta : result,
                    'delta' in result ? result.usage : undefined,
                ),
            ).toBe(true);
        },
    );
    it.each([false, true])(
        'does not dispatch a disabled route or charge the learner (claimed: %s)',
        async (alreadyClaimed) => {
            const job = await store.enqueue(owner, request());
            const lease = alreadyClaimed ? await claim() : null;
            const routing = new DrizzleTextAiRoutingStore(
                db,
                async () => {},
                () => true,
            );
            const current = (await routing.current())!;
            const [revision] = await db
                .select()
                .from(textAiRoutingRevisionsTable)
                .where(eq(textAiRoutingRevisionsTable.id, current.id));
            await routing.disable(
                {
                    expectedVersion: current.version,
                    routeId: 'deepseek/deepseek-flash',
                    reason: 'Synthetic emergency disable before HTTP',
                },
                revision!.createdBy,
                now,
            );
            if (lease) expect(await store.dispatch(lease)).toBe(false);
            else expect(await store.claim('selection-test')).toBeNull();
            const [persisted] = await db
                .select()
                .from(jobs)
                .where(eq(jobs.id, job.id));
            expect(persisted?.executionState).toBe('failed');
            expect(persisted?.aiCreditProviderDispatchedAt).toBeNull();
            const [settled] = await db
                .select()
                .from(actions)
                .where(eq(actions.id, job.id));
            expect(settled).toMatchObject({
                state: 'settled',
                outcome: 'failure',
                chargedMilli: 0n,
            });
        },
    );
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
        const [action] = await db
            .select()
            .from(actions)
            .where(eq(actions.id, duplicate.id));
        expect(action).toMatchObject({
            state: 'settled',
            outcome: 'failure',
            chargedMilli: 0n,
        });
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
            'provider_timeout',
        );
        expect(await db.select().from(dictionariesTable)).toHaveLength(0);
    });
    it('Feature052 keeps one bounded selection action and releases invalid model output', async () => {
        const admitted = await store.enqueue(owner, request());
        const first = await claim();
        expect(first.budget.maxOutputTokensPerAttempt).toBeLessThanOrEqual(
            10000,
        );
        await store.dispatch(first);
        await store.fail(first, 'invalid_model_output', {
            inputTokens: 100,
            outputTokens: 40,
        });
        const [action] = await db
            .select()
            .from(actions)
            .where(eq(actions.id, admitted.id));
        expect(action).toMatchObject({
            state: 'settled',
            outcome: 'failure',
            chargedMilli: 0n,
        });
        const [attempt] = await db
            .select()
            .from(actionAttempts)
            .where(eq(actionAttempts.actionId, admitted.id));
        expect(attempt).toMatchObject({
            state: 'settled',
            successful: 0,
            inputTokens: 100,
            outputTokens: 40,
            actualCostMicros: 220,
        });
        const expenses = await db.execute(
            sql`select measurement, amount_usd_micros from ai_provider_expense_records where action_id=${admitted.id}`,
        );
        expect(expenses[0]).toMatchObject({
            measurement: 'measured',
            amount_usd_micros: '220',
        });
        expect(await db.select().from(aiCreditReservationsTable)).toHaveLength(
            0,
        );
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
    it('retains unknown expense for a rejected selection attempt while using only its approved fallback', async () => {
        const fallback = textAiModelCatalog.find(
            (model) =>
                model.providerId === 'openrouter' &&
                model.id === 'openai/gpt-6-luna',
        )!;
        const fallbackId = `${fallback.providerId}/${fallback.id}`;
        const revision = await seedTextAiRoutingFixture(db, {
            routeId: fallbackId,
            replace: true,
            at: now,
        });
        const [authority] = await db
            .select()
            .from(textAiRoutingRevisionsTable)
            .where(eq(textAiRoutingRevisionsTable.id, revision.id));
        await new DrizzleTextAiRoutingStore(
            db,
            async () => {},
            () => true,
        ).publish(
            {
                expectedVersion: revision.version,
                configuration: {
                    ...revision.configuration,
                    default: {
                        primaryRouteId: 'deepseek/deepseek-flash',
                        fallbackRouteIds: [fallbackId],
                    },
                    enabledRouteIds: ['deepseek/deepseek-flash', fallbackId],
                },
                reason: 'Synthetic selection fallback authorization',
            },
            authority!.createdBy,
            now,
        );
        await db.insert(dictionaryAiWorkerObservationsTable).values({
            id: textsExecutionObservationId(
                'selection-test',
                fallback.providerId,
                fallback.id,
            ),
            workerId: 'selection-test',
            providerId: fallback.providerId,
            modelId: fallback.id,
            adapterRevision: fallback.adapterRevision,
            textAiSelectionRevision: 1,
            textAiCapacityRevision: 1,
            textsExecutionRevision: 1,
            textsCapacityRevision: 1,
            creditSettlementRevision: 1,
            textAiSupportedFormats: [...fallback.supportedFormats],
            status: 'available',
            message: 'Synthetic fallback worker',
            checkedAt: now,
            expiresAt: new Date(now.getTime() + 3600000),
        });
        const job = await store.enqueue(owner, request());
        const first = await claim();
        expect(await store.dispatch(first)).toBe(true);
        const [attempt] = await db
            .select()
            .from(actionAttempts)
            .where(eq(actionAttempts.actionId, job.id));
        await db.execute(
            sql`select languon_record_text_ai_route_health(${randomUUID()}::uuid,${attempt!.id}::uuid,${first.id}::uuid,null,${first.workerId},${first.fencingToken}::bigint,'rate_limited')`,
        );
        await store.fail(
            first,
            'provider_failure',
            undefined,
            'conclusive-provider-failure',
        );
        const [failedExpense] = await db
            .select()
            .from(aiProviderExpenseRecordsTable)
            .where(eq(aiProviderExpenseRecordsTable.attemptId, attempt!.id));
        expect(failedExpense).toMatchObject({
            measurement: 'unknown',
            costSource: 'unknown',
            amountUsdMicros: null,
        });
        now = new Date(now.getTime() + 1001);
        const second = await claim();
        expect(second.execution?.providerId).toBe('openrouter');
        expect(await store.dispatch(second)).toBe(true);
        expect(
            await store.complete(second, delta, {
                inputTokens: 100,
                outputTokens: 40,
            }),
        ).toBe(true);
        const [settled] = await db
            .select()
            .from(actions)
            .where(eq(actions.id, job.id));
        expect(settled?.outcome).toBe('success');
        const persistedAttempts = await db
            .select()
            .from(actionAttempts)
            .where(eq(actionAttempts.actionId, job.id));
        expect(persistedAttempts.map((item) => item.successful).sort()).toEqual(
            [0, 1],
        );
    });
    it('does not repeat a rejected route when no fallback was authorized; retains one hold', async () => {
        await store.enqueue(owner, request());
        const first = await claim();
        await store.dispatch(first);
        await store.fail(first, 'provider_rate_limited');
        expect((await store.read(owner, first.id)).state).toBe('queued');
        expect(await store.claim('early')).toBeNull();
        now = new Date(now.getTime() + 1001);
        expect(await store.claim('after-delay')).toBeNull();
        expect(await store.complete(first, delta)).toBe(false);
        expect((await store.read(owner, first.id)).state).toBe('failed');
        expect(await store.claim('later')).toBeNull();
        expect(await db.select().from(aiCreditReservationsTable)).toHaveLength(
            0,
        );
        const settled = await db.select().from(actions);
        expect(settled).toHaveLength(1);
        expect(settled[0]).toMatchObject({
            state: 'settled',
            chargedMilli: 0n,
        });
        expect(await db.select().from(actionAttempts)).toHaveLength(1);
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
