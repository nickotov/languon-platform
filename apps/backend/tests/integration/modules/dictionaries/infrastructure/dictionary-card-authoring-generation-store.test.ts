import { randomUUID } from 'node:crypto';

import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { eq, sql } from 'drizzle-orm';
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { databaseSchema } from '../../../../../src/infrastructure/database/schema';
import { DrizzleAiCreditTransactionParticipant } from '../../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import {
    aiCreditAccountsTable,
    aiCreditReservationsTable,
} from '../../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/schema';
import { dictionaryCardAuthoringGenerationFormatV1 as dictionaryCardAuthoringGenerationFormat } from '../../../../../src/modules/dictionaries/domain/card-authoring';
import {
    DictionaryGenerationCandidateConflictError,
    DictionaryGenerationCompletionConflictError,
    DictionaryGenerationNotReviewableError,
    DictionaryVersionConflictError,
} from '../../../../../src/modules/dictionaries/application/dictionary-errors';
import { DrizzleDictionaryGenerationStore } from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-generation-store';
import { DrizzleDictionaryStore } from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-store';
import {
    dictionaryCardRevisionsTable,
    dictionaryCardsTable,
    dictionaryGenerationJobsTable,
    dictionaryGenerationProposalsTable,
    dictionaryGenerationProviderCircuitTable,
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
} from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import { dictionaryAiModelCatalog } from '../../../../../src/modules/dictionaries/application/dictionary-ai-provider-catalog';
import {
    DictionaryTextProviderRouter,
    type DictionaryTextProviderSet,
} from '../../../../../src/modules/dictionaries/infrastructure/ai/dictionary-text-provider-router';
import { usersTable } from '../../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../support/test-database';

const run = describe.runIf(isDatabaseIntegrationEnabled());
const instant = (offset = 0) =>
    new Date(Date.parse('2026-08-26T12:00:00.000Z') + offset);
const context = (offset = 0) => ({
    now: instant(offset),
    signal: new AbortController().signal,
});
const fingerprint = (character: string) =>
    `hmac-sha256:v1:${character.repeat(43)}`;
const overrides = {
    definitionEnabled: null,
    definitionLanguage: null,
    exampleEnabled: null,
    exampleLanguage: null,
    exampleTranslationEnabled: null,
    transcriptionCustomLabel: null,
    transcriptionEnabled: null,
    transcriptionNotation: null,
};

run('card-authoring generation persistence', () => {
    let client: PostgresClient;
    let database: PostgresJsDatabase<typeof databaseSchema>;
    let dictionaryStore: DrizzleDictionaryStore;
    let generationStore: DrizzleDictionaryGenerationStore;
    let ownerId: string;

    beforeAll(async () => {
        client = createTestPostgresClient();
        database = createDrizzleDatabase(client, databaseSchema);
        dictionaryStore = new DrizzleDictionaryStore(database, {
            generate: randomUUID,
        });
        generationStore = new DrizzleDictionaryGenerationStore(database, {
            generate: randomUUID,
        });
    });

    beforeEach(async () => {
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
        ownerId = randomUUID();
        await database.insert(usersTable).values({
            createdAt: instant(),
            id: ownerId,
            status: 'active',
            updatedAt: instant(),
        });
    });

    afterAll(async () => client.end());

    it.each([true, false])(
        'latest advanced rewrite lookup ignores newer inline authoring jobs (hasRewrite=%s)',
        async (hasRewrite) => {
            const dictionary = await dictionaryStore.createDictionary({
                context: context(),
                fingerprint: fingerprint('L'),
                idempotencyKey: `latest-rewrite-dictionary-${randomUUID()}`,
                ownerId,
                request: {
                    description: null,
                    name: 'Advanced and inline generation',
                    sourceLanguage: 'en',
                    targetLanguage: 'fr',
                },
            });
            const draft = {
                translationContext: null,
                overrides,
                values: {
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                    source: 'hello',
                    transcription: null,
                    translation: 'bonjour',
                },
            };
            const created = await dictionaryStore.createCard({
                context: context(1),
                dictionaryId: dictionary.id,
                ownerId,
                request: {
                    ...draft,
                    expectedDictionaryVersion: dictionary.version,
                    expectedSettingsVersion: dictionary.settings.version,
                },
            });
            const versionInput = {
                dictionaryId: dictionary.id,
                expectedDictionaryVersion: created.dictionaryVersion,
                expectedSettingsVersion: dictionary.settings.version,
                ownerId,
            };
            let rewriteId: string | null = null;
            if (hasRewrite) {
                const rewrite = await generationStore.enqueue({
                    ...versionInput,
                    cardId: created.card.id,
                    context: context(2),
                    expectedCardVersion: created.card.version,
                    fingerprint: fingerprint('M'),
                    idempotencyKey: `latest-rewrite-${randomUUID()}`,
                    instruction: null,
                });
                rewriteId = rewrite.id;
                await generationStore.cancel({
                    context: context(3),
                    jobId: rewrite.id,
                    ownerId,
                });
            }
            const inline = await generationStore.enqueueCardAuthoring({
                ...versionInput,
                context: context(4),
                draft: {
                    ...draft,
                    values: {
                        definition: draft.values.definition,
                        example: draft.values.example,
                        exampleTranslation: draft.values.exampleTranslation,
                        transcription: draft.values.transcription,
                        translation: draft.values.translation,
                    },
                },
                fingerprint: fingerprint('N'),
                format: 'card-authoring:v3',
                idempotencyKey: `latest-inline-${randomUUID()}`,
                scope: { kind: 'field', field: 'translation' },
                source: draft.values.source,
                target: {
                    cardId: created.card.id,
                    expectedCardVersion: created.card.version,
                    kind: 'update',
                },
            });
            const lookup = {
                cardId: created.card.id,
                context: context(5),
                dictionaryId: dictionary.id,
                ownerId,
            };
            const latest = await generationStore.latestForCard(lookup);
            if (hasRewrite) {
                expect(latest).toMatchObject({
                    id: rewriteId,
                    kind: 'single-card',
                });
                expect(latest?.id).not.toBe(inline.id);
            } else {
                expect(latest).toBeNull();
            }
            await expect(
                generationStore.latestForCard({
                    ...lookup,
                    ownerId: randomUUID(),
                }),
            ).resolves.toBeNull();
        },
    );

    it('pins the active AI revision at admission and replays the original job after a default switch', async () => {
        const creditedStore = new DrizzleDictionaryGenerationStore(
            database,
            { generate: randomUUID },
            undefined,
            true,
        );
        await database.insert(aiCreditAccountsTable).values({
            createdAt: instant(),
            mode: 'unlimited',
            unlimitedUntil: null,
            updatedAt: instant(),
            userId: ownerId,
        });
        const dictionary = await dictionaryStore.createDictionary({
            context: context(),
            fingerprint: fingerprint('P'),
            idempotencyKey: `dictionary-create-${randomUUID()}`,
            ownerId,
            request: {
                description: null,
                name: 'Pinned routing',
                sourceLanguage: 'en',
                targetLanguage: 'fr',
            },
        });
        const card = await dictionaryStore.createCard({
            context: context(1),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: dictionary.version,
                expectedSettingsVersion: dictionary.settings.version,
                translationContext: null,
                overrides,
                values: {
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                    source: 'hello',
                    transcription: null,
                    translation: 'bonjour',
                },
            },
        });
        const deepSeek = dictionaryAiModelCatalog[0]!;
        const kie = dictionaryAiModelCatalog[1]!;
        const revisionOne = randomUUID();
        const revisionTwo = randomUUID();
        const snapshot = (
            model: (typeof dictionaryAiModelCatalog)[number],
        ) => ({
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
        });
        await database.insert(dictionaryAiConfigurationRevisionsTable).values({
            catalogSnapshot: snapshot(deepSeek),
            createdAt: instant(2),
            createdByUserId: ownerId,
            id: revisionOne,
            version: 1,
        });
        await database.insert(dictionaryAiConfigurationTable).values({
            activeRevisionId: revisionOne,
            id: 'global',
            updatedAt: instant(2),
            version: 1,
        });
        const request = {
            cardId: card.card.id,
            context: context(3),
            dictionaryId: dictionary.id,
            expectedCardVersion: card.card.version,
            expectedDictionaryVersion: card.dictionaryVersion,
            expectedSettingsVersion: dictionary.settings.version,
            fingerprint: fingerprint('Q'),
            idempotencyKey: `pinned-${randomUUID()}`,
            instruction: null,
            ownerId,
        };
        const first = await creditedStore.enqueue(request);

        await database.insert(dictionaryAiConfigurationRevisionsTable).values({
            catalogSnapshot: snapshot(kie),
            createdAt: instant(4),
            createdByUserId: ownerId,
            id: revisionTwo,
            version: 2,
        });
        await database
            .update(dictionaryAiConfigurationTable)
            .set({
                activeRevisionId: revisionTwo,
                updatedAt: instant(4),
                version: 2,
            })
            .where(eq(dictionaryAiConfigurationTable.id, 'global'));

        const replay = await creditedStore.enqueue({
            ...request,
            context: context(5),
        });
        const second = await creditedStore.enqueue({
            ...request,
            context: context(6),
            fingerprint: fingerprint('R'),
            idempotencyKey: `pinned-${randomUUID()}`,
        });
        expect(replay.id).toBe(first.id);
        const rows = await database
            .select({
                id: dictionaryGenerationJobsTable.id,
                revisionId: dictionaryGenerationJobsTable.executionRevisionId,
            })
            .from(dictionaryGenerationJobsTable);
        expect(rows).toEqual(
            expect.arrayContaining([
                { id: first.id, revisionId: revisionOne },
                { id: second.id, revisionId: revisionTwo },
            ]),
        );

        await expect(
            database
                .update(dictionaryGenerationJobsTable)
                .set({
                    executionState: 'running',
                    heartbeatAt: instant(7),
                    leaseDeadline: instant(1_007),
                    workerId: 'old-worker-without-managed-routing',
                })
                .where(eq(dictionaryGenerationJobsTable.id, first.id))
                .returning({ id: dictionaryGenerationJobsTable.id }),
        ).rejects.toThrow();

        const compatibleUpdate = await database.transaction(async (tx) => {
            await tx.execute(
                sql`select set_config('languon.dictionary_ai_routing_revision', '1', true)`,
            );
            await tx.execute(
                sql`select set_config('languon.ai_credit_settlement_revision', '1', true)`,
            );
            return tx
                .update(dictionaryGenerationJobsTable)
                .set({
                    executionState: 'running',
                    heartbeatAt: instant(8),
                    leaseDeadline: instant(1_008),
                    workerId: 'managed-routing-worker',
                })
                .where(eq(dictionaryGenerationJobsTable.id, first.id))
                .returning({ id: dictionaryGenerationJobsTable.id });
        });
        expect(compatibleUpdate).toEqual([{ id: first.id }]);

        await database.transaction(async (tx) => {
            await tx.execute(
                sql`select set_config('languon.ai_credit_settlement_revision', '1', true)`,
            );
            await tx
                .update(dictionaryGenerationJobsTable)
                .set({
                    executionState: 'queued',
                    heartbeatAt: null,
                    leaseDeadline: null,
                    workerId: null,
                })
                .where(eq(dictionaryGenerationJobsTable.id, first.id));
        });
        await database
            .delete(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, second.id));

        const claim = await creditedStore.claim({
            context: context(9),
            creditSettlementRevision: 1,
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            managedRoutingRevision: 1,
            ownerConcurrency: 2,
            supportedFormats: ['single-card:v2'],
            workerId: 'managed-routing-worker',
        });
        expect(claim).toMatchObject({
            id: first.id,
            providerExecution: { modelId: deepSeek.id },
        });
        if (
            !claim?.providerExecution ||
            claim.input.format !== 'single-card:v2'
        )
            throw new Error('Expected a pinned single-card claim.');
        await expect(
            creditedStore.markProviderDispatch({
                context: context(9),
                fencingToken: claim.fencingToken,
                jobId: claim.id,
                leaseDeadline: claim.leaseDeadline,
                workerId: claim.workerId,
            }),
        ).resolves.toBe(true);

        const generated = {
            proposal: {
                candidate: {
                    overrides: claim.input.original.overrides,
                    values: {
                        ...claim.input.original.values,
                        translation: 'salut',
                    },
                },
                fieldFeedback: [],
                warnings: [],
            },
        };
        const cardGenerate = vi.fn(async () => generated);
        const unusedGenerate = vi.fn(async () => {
            throw new Error('Unexpected generation format.');
        });
        const providers: DictionaryTextProviderSet = {
            card: { generate: cardGenerate },
            cardAuthoring: { generate: unusedGenerate },
            importPairs: { generate: unusedGenerate },
            pastedTerms: { generate: unusedGenerate },
        };
        const router = new DictionaryTextProviderRouter({
            credentials: { DEEPSEEK_API_KEY: 'integration-secret' },
            factory: () => providers,
        });
        const routed = router.resolve(
            claim.providerExecution,
            claim.providerBudget,
        );
        const result = await routed.card.generate({
            idempotencyKey: claim.id,
            input: claim.input,
            providerBudget: claim.providerBudget,
            signal: new AbortController().signal,
        });
        expect(cardGenerate).toHaveBeenCalledOnce();
        const completed =
            'proposal' in result
                ? result
                : { proposal: result, usage: undefined };
        await expect(
            creditedStore.complete({
                context: context(10),
                fencingToken: claim.fencingToken,
                jobId: claim.id,
                leaseDeadline: claim.leaseDeadline,
                proposal: completed.proposal,
                ...(completed.usage ? { providerUsage: completed.usage } : {}),
                reviewExpiresAt: instant(60_000),
                workerId: claim.workerId,
            }),
        ).resolves.toBe(true);
        await expect(
            creditedStore.read({
                context: context(11),
                jobId: claim.id,
                ownerId,
            }),
        ).resolves.toMatchObject({ state: 'review' });
        await expect(
            database
                .select({
                    chargedCredits: aiCreditReservationsTable.chargedCredits,
                    measurement: aiCreditReservationsTable.measurement,
                    policyMode: aiCreditReservationsTable.policyMode,
                })
                .from(aiCreditReservationsTable)
                .where(eq(aiCreditReservationsTable.jobId, claim.id)),
        ).resolves.toEqual([
            {
                chargedCredits: 0n,
                measurement: 'unmetered',
                policyMode: 'unlimited',
            },
        ]);
    });

    it('settles provider budget and exposes credit exhaustion when a retry cannot reserve credits', async () => {
        const dictionary = await dictionaryStore.createDictionary({
            context: context(),
            fingerprint: fingerprint('C'),
            idempotencyKey: `credit-dictionary-${randomUUID()}`,
            ownerId,
            request: {
                description: null,
                name: 'Credit retry',
                sourceLanguage: 'en',
                targetLanguage: 'fr',
            },
        });
        const model = dictionaryAiModelCatalog[0]!;
        const revisionId = randomUUID();
        await database.insert(dictionaryAiConfigurationRevisionsTable).values({
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
            createdAt: instant(1),
            createdByUserId: ownerId,
            id: revisionId,
            version: 1,
        });
        await database.insert(dictionaryAiConfigurationTable).values({
            activeRevisionId: revisionId,
            id: 'global',
            updatedAt: instant(1),
            version: 1,
        });
        await database.transaction(async (transaction) => {
            await new DrizzleAiCreditTransactionParticipant(
                transaction,
            ).issueGrant({
                amount: BigInt(model.creditPricing.maxCreditsPerAttempt),
                createdAt: instant(1),
                expiresAt: null,
                ownerId,
                source: 'admin',
                sourceReference: `retry-credit-${randomUUID()}`,
            });
        });
        const creditedStore = new DrizzleDictionaryGenerationStore(
            database,
            { generate: randomUUID },
            undefined,
            true,
        );
        const job = await creditedStore.enqueueCardAuthoring({
            context: context(2),
            dictionaryId: dictionary.id,
            draft: {
                overrides,
                values: {
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                    transcription: null,
                    translation: null,
                },
            },
            expectedDictionaryVersion: dictionary.version,
            expectedSettingsVersion: dictionary.settings.version,
            fingerprint: fingerprint('D'),
            idempotencyKey: `credit-authoring-${randomUUID()}`,
            ownerId,
            scope: { kind: 'all' },
            source: 'hello',
        });
        const firstClaim = await creditedStore.claim({
            context: context(3),
            creditSettlementRevision: 1,
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            managedRoutingRevision: 1,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryCardAuthoringGenerationFormat],
            workerId: 'credit-retry-worker',
        });
        expect(firstClaim?.id).toBe(job.id);
        await expect(
            creditedStore.markProviderDispatch({
                context: context(4),
                fencingToken: firstClaim!.fencingToken,
                jobId: job.id,
                leaseDeadline: firstClaim!.leaseDeadline,
                workerId: firstClaim!.workerId,
            }),
        ).resolves.toBe(true);
        await expect(
            creditedStore.fail({
                context: context(5),
                failureCategory: 'provider_timeout',
                fencingToken: firstClaim!.fencingToken,
                jobId: job.id,
                leaseDeadline: firstClaim!.leaseDeadline,
                retryAt: instant(6),
                workerId: firstClaim!.workerId,
            }),
        ).resolves.toBe(true);

        await expect(
            creditedStore.claim({
                context: context(6),
                creditSettlementRevision: 1,
                globalConcurrency: 2,
                leaseDurationMs: 1_000,
                managedRoutingRevision: 1,
                ownerConcurrency: 1,
                supportedFormats: [dictionaryCardAuthoringGenerationFormat],
                workerId: 'credit-retry-worker',
            }),
        ).resolves.toBeNull();
        await expect(
            creditedStore.read({
                context: context(7),
                jobId: job.id,
                ownerId,
            }),
        ).resolves.toMatchObject({
            failure: { code: 'ai_credits_exhausted', retryable: false },
            state: 'failed',
        });
        const [stored] = await database
            .select({
                actualCost:
                    dictionaryGenerationJobsTable.providerActualCostMicros,
                actualInput:
                    dictionaryGenerationJobsTable.providerActualInputTokens,
                actualOutput:
                    dictionaryGenerationJobsTable.providerActualOutputTokens,
                reservedCost:
                    dictionaryGenerationJobsTable.providerReservedCostMicros,
                reservedInput:
                    dictionaryGenerationJobsTable.providerReservedInputTokens,
                reservedOutput:
                    dictionaryGenerationJobsTable.providerReservedOutputTokens,
                state: dictionaryGenerationJobsTable.providerReservationState,
            })
            .from(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, job.id));
        expect(stored).toMatchObject({
            actualCost: stored?.reservedCost,
            actualInput: stored?.reservedInput,
            actualOutput: stored?.reservedOutput,
            state: 'settled',
        });
    });

    it('preserves predecessor review, merges a successor, and atomically replays mixed card creation with redaction', async () => {
        const createdDictionary = await dictionaryStore.createDictionary({
            context: context(),
            fingerprint: fingerprint('A'),
            idempotencyKey: `dictionary-create-${randomUUID()}`,
            ownerId,
            request: {
                description: null,
                name: 'AI authoring',
                sourceLanguage: 'en',
                targetLanguage: 'fr',
            },
        });
        const dictionary = await dictionaryStore.updateDictionary({
            context: context(1),
            dictionaryId: createdDictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: createdDictionary.version,
                expectedSettingsVersion: createdDictionary.settings.version,
                settings: { definitionEnabled: true },
            },
        });
        const existingCard = await dictionaryStore.createCard({
            context: context(1),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: dictionary.version,
                expectedSettingsVersion: dictionary.settings.version,
                translationContext: null,
                overrides,
                values: {
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                    source: 'hello',
                    transcription: null,
                    translation: 'bonjour existant',
                },
            },
        });
        const dictionaryVersion = existingCard.dictionaryVersion;
        const draft = {
            overrides,
            values: {
                definition: null,
                example: null,
                exampleTranslation: null,
                transcription: null,
                translation: null,
            },
        };
        const first = await generationStore.enqueueCardAuthoring({
            context: context(2),
            dictionaryId: dictionary.id,
            draft,
            expectedDictionaryVersion: dictionaryVersion,
            expectedSettingsVersion: dictionary.settings.version,
            fingerprint: fingerprint('B'),
            idempotencyKey: `authoring-${randomUUID()}`,
            ownerId,
            scope: { kind: 'all' },
            source: 'hello',
        });
        expect(first).toMatchObject({
            dictionaryId: dictionary.id,
            kind: 'card-authoring',
            state: 'queued',
        });
        const firstClaim = await generationStore.claim({
            context: context(2),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryCardAuthoringGenerationFormat],
            workerId: 'authoring-worker',
        });
        expect(firstClaim?.input).toMatchObject({
            format: dictionaryCardAuthoringGenerationFormat,
            source: 'hello',
        });
        await expect(
            generationStore.complete({
                context: context(3),
                fencingToken: firstClaim!.fencingToken,
                jobId: first.id,
                leaseDeadline: firstClaim!.leaseDeadline,
                proposal: {
                    suggestions: [
                        { field: 'translation', value: 'bonjour' },
                        { field: 'definition', value: 'a greeting' },
                    ],
                },
                providerUsage: { inputTokens: 0, outputTokens: 0 },
                reviewExpiresAt: instant(60_000),
                workerId: firstClaim!.workerId,
            }),
        ).resolves.toBe(true);
        const firstReview = await generationStore.read({
            context: context(4),
            jobId: first.id,
            ownerId,
        });
        expect(firstReview).toMatchObject({ state: 'review' });
        if (firstReview.kind !== 'card-authoring' || !firstReview.proposal)
            throw new Error('Expected a card-authoring review');
        const discardedId = firstReview.proposal.suggestions.find(
            (suggestion) => suggestion.field === 'translation',
        )!.id;

        await database
            .update(dictionaryGenerationJobsTable)
            .set({ expectedDictionaryVersion: dictionaryVersion - 1 })
            .where(eq(dictionaryGenerationJobsTable.id, first.id));
        await expect(
            generationStore.enqueueCardAuthoring({
                context: context(5),
                dictionaryId: dictionary.id,
                draft,
                expectedDictionaryVersion: dictionaryVersion,
                expectedSettingsVersion: dictionary.settings.version,
                fingerprint: fingerprint('V'),
                idempotencyKey: `authoring-stale-predecessor-${randomUUID()}`,
                ownerId,
                predecessor: {
                    discardedSuggestionIds: [discardedId],
                    jobId: first.id,
                },
                scope: { field: 'translation', kind: 'field' },
                source: 'hello',
            }),
        ).rejects.toBeInstanceOf(DictionaryGenerationNotReviewableError);
        await database
            .update(dictionaryGenerationJobsTable)
            .set({ expectedDictionaryVersion: dictionaryVersion })
            .where(eq(dictionaryGenerationJobsTable.id, first.id));

        const originalProposal = firstReview.proposal;
        await database
            .update(dictionaryGenerationProposalsTable)
            .set({
                payload: {
                    source: 'hello',
                    suggestions: Array.from({ length: 6 }, (_, index) => ({
                        field: 'translation' as const,
                        id: randomUUID(),
                        value: `translation ${index}`,
                    })),
                },
            })
            .where(eq(dictionaryGenerationProposalsTable.jobId, first.id));
        await expect(
            generationStore.enqueueCardAuthoring({
                context: context(5),
                dictionaryId: dictionary.id,
                draft,
                expectedDictionaryVersion: dictionaryVersion,
                expectedSettingsVersion: dictionary.settings.version,
                fingerprint: fingerprint('W'),
                idempotencyKey: `authoring-full-predecessor-${randomUUID()}`,
                ownerId,
                predecessor: {
                    discardedSuggestionIds: [],
                    jobId: first.id,
                },
                scope: { field: 'translation', kind: 'field' },
                source: 'hello',
            }),
        ).rejects.toBeInstanceOf(DictionaryGenerationCandidateConflictError);
        await database
            .update(dictionaryGenerationProposalsTable)
            .set({ payload: originalProposal })
            .where(eq(dictionaryGenerationProposalsTable.jobId, first.id));

        const postCallConflict = await generationStore.enqueueCardAuthoring({
            context: context(5),
            dictionaryId: dictionary.id,
            draft,
            expectedDictionaryVersion: dictionaryVersion,
            expectedSettingsVersion: dictionary.settings.version,
            fingerprint: fingerprint('X'),
            idempotencyKey: `authoring-post-call-conflict-${randomUUID()}`,
            ownerId,
            predecessor: { discardedSuggestionIds: [], jobId: first.id },
            scope: { field: 'translation', kind: 'field' },
            source: 'hello',
        });
        const conflictClaim = await generationStore.claim({
            context: context(6),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryCardAuthoringGenerationFormat],
            workerId: 'authoring-worker',
        });
        await database
            .update(dictionaryGenerationProposalsTable)
            .set({
                payload: null,
                reviewState: 'discarded',
                terminalAt: context(7).now,
            })
            .where(eq(dictionaryGenerationProposalsTable.jobId, first.id));
        await expect(
            generationStore.complete({
                context: context(8),
                fencingToken: conflictClaim!.fencingToken,
                jobId: postCallConflict.id,
                leaseDeadline: conflictClaim!.leaseDeadline,
                proposal: {
                    suggestions: [{ field: 'translation', value: 'salut' }],
                },
                providerUsage: { inputTokens: 7, outputTokens: 3 },
                reviewExpiresAt: instant(60_000),
                workerId: conflictClaim!.workerId,
            }),
        ).rejects.toBeInstanceOf(DictionaryGenerationCompletionConflictError);
        await expect(
            generationStore.fail({
                context: context(9),
                countProviderFailure: false,
                failureCategory: 'generation_conflict',
                fencingToken: conflictClaim!.fencingToken,
                jobId: postCallConflict.id,
                leaseDeadline: conflictClaim!.leaseDeadline,
                providerUsage: { inputTokens: 7, outputTokens: 3 },
                retryAt: null,
                workerId: conflictClaim!.workerId,
            }),
        ).resolves.toBe(true);
        const [failedConflict] = await database
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, postCallConflict.id));
        expect(failedConflict).toMatchObject({
            executionState: 'failed',
            failureCategory: 'generation_conflict',
            providerActualInputTokens: 7,
            providerActualOutputTokens: 3,
            providerReservationState: 'settled',
        });
        const [providerCircuit] = await database
            .select()
            .from(dictionaryGenerationProviderCircuitTable)
            .where(
                eq(
                    dictionaryGenerationProviderCircuitTable.id,
                    dictionaryCardAuthoringGenerationFormat,
                ),
            );
        expect(providerCircuit?.consecutiveFailures ?? 0).toBe(0);
        await database
            .update(dictionaryGenerationProposalsTable)
            .set({
                payload: originalProposal,
                reviewState: 'reviewable',
                terminalAt: null,
            })
            .where(eq(dictionaryGenerationProposalsTable.jobId, first.id));

        const successor = await generationStore.enqueueCardAuthoring({
            context: context(5),
            dictionaryId: dictionary.id,
            draft,
            expectedDictionaryVersion: dictionaryVersion,
            expectedSettingsVersion: dictionary.settings.version,
            fingerprint: fingerprint('C'),
            idempotencyKey: `authoring-successor-${randomUUID()}`,
            ownerId,
            predecessor: {
                discardedSuggestionIds: [discardedId],
                jobId: first.id,
            },
            scope: { field: 'translation', kind: 'field' },
            source: 'hello',
        });
        const successorClaim = await generationStore.claim({
            context: context(6),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryCardAuthoringGenerationFormat],
            workerId: 'authoring-worker',
        });
        await generationStore.complete({
            context: context(7),
            fencingToken: successorClaim!.fencingToken,
            jobId: successor.id,
            leaseDeadline: successorClaim!.leaseDeadline,
            proposal: {
                suggestions: [{ field: 'translation', value: 'salut' }],
            },
            providerUsage: { inputTokens: 0, outputTokens: 0 },
            reviewExpiresAt: instant(60_000),
            workerId: successorClaim!.workerId,
        });
        const successorReview = await generationStore.read({
            context: context(8),
            jobId: successor.id,
            ownerId,
        });
        const retainedPredecessor = await generationStore.read({
            context: context(8),
            jobId: first.id,
            ownerId,
        });
        if (
            successorReview.kind !== 'card-authoring' ||
            !successorReview.proposal ||
            retainedPredecessor.kind !== 'card-authoring' ||
            !retainedPredecessor.proposal
        )
            throw new Error('Expected retained authoring proposals');
        expect(
            retainedPredecessor.proposal.suggestions.map(
                (suggestion) => suggestion.value,
            ),
        ).toContain('bonjour');
        expect(
            successorReview.proposal.suggestions.map(
                (suggestion) => suggestion.value,
            ),
        ).toEqual(expect.arrayContaining(['a greeting', 'salut']));
        expect(
            successorReview.proposal.suggestions.map(
                (suggestion) => suggestion.id,
            ),
        ).not.toContain(discardedId);

        const secondSuccessor = await generationStore.enqueueCardAuthoring({
            context: context(9),
            dictionaryId: dictionary.id,
            draft: {
                ...draft,
                overrides: { ...overrides, definitionEnabled: 'disabled' },
            },
            expectedDictionaryVersion: dictionaryVersion,
            expectedSettingsVersion: dictionary.settings.version,
            fingerprint: fingerprint('E'),
            idempotencyKey: `authoring-second-successor-${randomUUID()}`,
            ownerId,
            predecessor: {
                discardedSuggestionIds: [discardedId],
                jobId: successor.id,
            },
            scope: { field: 'translation', kind: 'field' },
            source: 'hello',
        });
        const secondClaim = await generationStore.claim({
            context: context(10),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryCardAuthoringGenerationFormat],
            workerId: 'authoring-worker',
        });
        expect(secondClaim?.input).toMatchObject({
            excludedValues: [
                { field: 'translation', values: ['bonjour', 'salut'] },
                { field: 'definition', values: ['a greeting'] },
            ],
        });
        await generationStore.complete({
            context: context(11),
            fencingToken: secondClaim!.fencingToken,
            jobId: secondSuccessor.id,
            leaseDeadline: secondClaim!.leaseDeadline,
            proposal: {
                suggestions: [{ field: 'translation', value: 'coucou' }],
            },
            providerUsage: { inputTokens: 0, outputTokens: 0 },
            reviewExpiresAt: instant(60_000),
            workerId: secondClaim!.workerId,
        });
        const secondReview = await generationStore.read({
            context: context(12),
            jobId: secondSuccessor.id,
            ownerId,
        });
        if (secondReview.kind !== 'card-authoring' || !secondReview.proposal)
            throw new Error('Expected a second authoring successor');
        expect(
            secondReview.proposal.suggestions.map(
                (suggestion) => suggestion.value,
            ),
        ).toEqual(expect.arrayContaining(['a greeting', 'salut', 'coucou']));

        const thirdSuccessor = await generationStore.enqueueCardAuthoring({
            context: context(12),
            dictionaryId: dictionary.id,
            draft,
            expectedDictionaryVersion: dictionaryVersion,
            expectedSettingsVersion: dictionary.settings.version,
            fingerprint: fingerprint('F'),
            idempotencyKey: `authoring-third-successor-${randomUUID()}`,
            ownerId,
            predecessor: {
                discardedSuggestionIds: [discardedId],
                jobId: secondSuccessor.id,
            },
            scope: { field: 'definition', kind: 'field' },
            source: 'hello',
        });
        const thirdClaim = await generationStore.claim({
            context: context(12),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryCardAuthoringGenerationFormat],
            workerId: 'authoring-worker',
        });
        expect(thirdClaim?.input).toMatchObject({
            excludedValues: [
                {
                    field: 'translation',
                    values: ['bonjour', 'salut', 'coucou'],
                },
                { field: 'definition', values: ['a greeting'] },
            ],
            scope: { field: 'definition', kind: 'field' },
        });
        await generationStore.complete({
            context: context(12),
            fencingToken: thirdClaim!.fencingToken,
            jobId: thirdSuccessor.id,
            leaseDeadline: thirdClaim!.leaseDeadline,
            proposal: {
                suggestions: [
                    { field: 'definition', value: 'a newer greeting' },
                ],
            },
            providerUsage: { inputTokens: 0, outputTokens: 0 },
            reviewExpiresAt: instant(60_000),
            workerId: thirdClaim!.workerId,
        });
        const thirdReview = await generationStore.read({
            context: context(12),
            jobId: thirdSuccessor.id,
            ownerId,
        });
        if (thirdReview.kind !== 'card-authoring' || !thirdReview.proposal)
            throw new Error('Expected a third authoring successor');
        const selected = thirdReview.proposal.suggestions.find(
            (suggestion) => suggestion.value === 'coucou',
        )!;
        const acceptance = {
            acceptanceFingerprint: fingerprint('D'),
            candidate: {
                overrides,
                values: {
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                    source: 'hello',
                    transcription: null,
                    translation: 'coucou',
                },
            },
            context: context(13),
            jobId: thirdSuccessor.id,
            ownerId,
            selectedSuggestions: [
                { field: 'translation' as const, suggestionId: selected.id },
            ],
        };
        const accepted = await generationStore.acceptCardAuthoring(acceptance);
        const replay = await generationStore.acceptCardAuthoring({
            ...acceptance,
            context: context(14),
        });
        expect(replay).toEqual(accepted);
        expect(accepted).toMatchObject({
            job: { proposal: null, state: 'accepted' },
            outcome: {
                cardVersion: 1,
                dictionaryVersion: 4,
                duplicateSource: true,
            },
        });
        const [card] = await database
            .select()
            .from(dictionaryCardsTable)
            .where(eq(dictionaryCardsTable.id, accepted.outcome.cardId));
        expect(card).toMatchObject({
            authorship: 'mixed',
            source: 'hello',
            translation: 'coucou',
        });
        const [revision] = await database
            .select()
            .from(dictionaryCardRevisionsTable)
            .where(
                eq(
                    dictionaryCardRevisionsTable.cardId,
                    accepted.outcome.cardId,
                ),
            );
        expect(revision).toMatchObject({
            acceptedGenerationJobId: thirdSuccessor.id,
            authorship: 'mixed',
            mutationKind: 'ai_proposal_accept',
        });
        const [redactedJob] = await database
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, thirdSuccessor.id));
        const [redactedProposal] = await database
            .select()
            .from(dictionaryGenerationProposalsTable)
            .where(
                eq(dictionaryGenerationProposalsTable.jobId, thirdSuccessor.id),
            );
        expect(redactedJob?.inputPayload).toBeNull();
        expect(redactedProposal).toMatchObject({
            acceptedCardId: accepted.outcome.cardId,
            acceptedDuplicateSource: true,
            payload: null,
            reviewState: 'accepted',
        });

        const currentDictionary = await dictionaryStore.readDictionary({
            context: context(15),
            dictionaryId: dictionary.id,
            ownerId,
        });
        const single = await generationStore.enqueue({
            cardId: existingCard.card.id,
            context: context(15),
            dictionaryId: dictionary.id,
            expectedCardVersion: existingCard.card.version,
            expectedDictionaryVersion: currentDictionary.version,
            expectedSettingsVersion: currentDictionary.settings.version,
            fingerprint: fingerprint('S'),
            idempotencyKey: `single-after-authoring-${randomUUID()}`,
            instruction: null,
            ownerId,
        });
        const singleClaim = await generationStore.claim({
            context: context(16),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: ['single-card:v2'],
            workerId: 'single-card-worker',
        });
        const singleCandidate = {
            overrides,
            values: {
                definition: null,
                example: null,
                exampleTranslation: null,
                source: 'hello',
                transcription: null,
                translation: 'bonjour régénéré',
            },
        };
        await generationStore.complete({
            context: context(17),
            fencingToken: singleClaim!.fencingToken,
            jobId: single.id,
            leaseDeadline: singleClaim!.leaseDeadline,
            proposal: {
                candidate: singleCandidate,
                fieldFeedback: [],
                warnings: [],
            },
            providerUsage: { inputTokens: 0, outputTokens: 0 },
            reviewExpiresAt: instant(70_000),
            workerId: singleClaim!.workerId,
        });
        await expect(
            generationStore.acceptSingleCard({
                candidate: singleCandidate,
                candidateFingerprint: fingerprint('T'),
                context: context(18),
                jobId: single.id,
                ownerId,
            }),
        ).resolves.toMatchObject({
            outcome: { cardId: existingCard.card.id, cardVersion: 2 },
        });
        const [acceptedSingleProposal] = await database
            .select()
            .from(dictionaryGenerationProposalsTable)
            .where(eq(dictionaryGenerationProposalsTable.jobId, single.id));
        expect(acceptedSingleProposal).toMatchObject({
            acceptedCardId: null,
            acceptedDuplicateSource: null,
            reviewState: 'accepted',
        });

        const afterSingle = await dictionaryStore.readDictionary({
            context: context(19),
            dictionaryId: dictionary.id,
            ownerId,
        });
        const manualAuthoring = await generationStore.enqueueCardAuthoring({
            context: context(19),
            dictionaryId: dictionary.id,
            draft,
            expectedDictionaryVersion: afterSingle.version,
            expectedSettingsVersion: afterSingle.settings.version,
            fingerprint: fingerprint('U'),
            idempotencyKey: `manual-authoring-${randomUUID()}`,
            ownerId,
            scope: { kind: 'all' },
            source: 'seed source',
        });
        const manualClaim = await generationStore.claim({
            context: context(20),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryCardAuthoringGenerationFormat],
            workerId: 'manual-authoring-worker',
        });
        await generationStore.complete({
            context: context(21),
            fencingToken: manualClaim!.fencingToken,
            jobId: manualAuthoring.id,
            leaseDeadline: manualClaim!.leaseDeadline,
            proposal: {
                suggestions: [
                    { field: 'translation', value: 'generated value' },
                    { field: 'definition', value: 'generated definition' },
                ],
            },
            providerUsage: { inputTokens: 0, outputTokens: 0 },
            reviewExpiresAt: instant(80_000),
            workerId: manualClaim!.workerId,
        });
        const manualAcceptance = await generationStore.acceptCardAuthoring({
            acceptanceFingerprint: fingerprint('W'),
            candidate: {
                overrides,
                values: {
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                    source: 'manual source',
                    transcription: null,
                    translation: 'manual translation',
                },
            },
            context: context(22),
            jobId: manualAuthoring.id,
            ownerId,
            selectedSuggestions: [],
        });
        const [manualCard] = await database
            .select()
            .from(dictionaryCardsTable)
            .where(
                eq(dictionaryCardsTable.id, manualAcceptance.outcome.cardId),
            );
        expect(manualCard).toMatchObject({
            authorship: 'human',
            source: 'manual source',
            translation: 'manual translation',
        });
        const [manualProposal] = await database
            .select()
            .from(dictionaryGenerationProposalsTable)
            .where(
                eq(
                    dictionaryGenerationProposalsTable.jobId,
                    manualAuthoring.id,
                ),
            );
        expect(manualProposal).toMatchObject({
            payload: null,
            reviewState: 'accepted',
        });
    });

    it('updates a saved card through v2 and preserves its order and terminal target', async () => {
        const dictionary = await dictionaryStore.createDictionary({
            context: context(),
            fingerprint: fingerprint('V'),
            idempotencyKey: `dictionary-create-${randomUUID()}`,
            ownerId,
            request: {
                description: null,
                name: 'V2 authoring',
                sourceLanguage: 'en',
                targetLanguage: 'es',
            },
        });
        const created = await dictionaryStore.createCard({
            context: context(1),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: dictionary.version,
                expectedSettingsVersion: dictionary.settings.version,
                translationContext: null,
                overrides,
                values: {
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                    source: 'teh atelier',
                    transcription: null,
                    translation: 'el taller',
                },
            },
        });
        const card = created.card;
        const [persistedBefore] = await database
            .select()
            .from(dictionaryCardsTable)
            .where(eq(dictionaryCardsTable.id, card.id));
        const job = await generationStore.enqueueCardAuthoring({
            context: context(2),
            dictionaryId: dictionary.id,
            draft: {
                overrides,
                values: {
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                    transcription: null,
                    translation: 'el taller',
                },
            },
            expectedDictionaryVersion: created.dictionaryVersion,
            expectedSettingsVersion: dictionary.settings.version,
            fingerprint: fingerprint('W'),
            format: 'card-authoring:v2',
            idempotencyKey: `authoring-v2-${randomUUID()}`,
            ownerId,
            scope: { kind: 'field', field: 'source' },
            source: 'teh atelier',
            target: {
                kind: 'update',
                cardId: card.id,
                expectedCardVersion: card.version,
            },
        });
        const claim = await generationStore.claim({
            context: context(3),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: ['card-authoring:v2'],
            workerId: 'authoring-v2-worker',
        });
        await generationStore.complete({
            context: context(4),
            fencingToken: claim!.fencingToken,
            jobId: job.id,
            leaseDeadline: claim!.leaseDeadline,
            proposal: {
                sourceResult: { kind: 'suggested', value: 'the atelier' },
                suggestions: [],
            },
            providerUsage: { inputTokens: 2, outputTokens: 1 },
            reviewExpiresAt: instant(60_000),
            workerId: claim!.workerId,
        });
        const review = await generationStore.read({
            context: context(5),
            jobId: job.id,
            ownerId,
        });
        if (
            review.kind !== 'card-authoring' ||
            review.format !== 'card-authoring:v2' ||
            review.state !== 'review'
        )
            throw new Error('Expected v2 review');
        const sourceSuggestion = review.proposal.sourceSuggestions[0]!;
        const successor = await generationStore.enqueueCardAuthoring({
            context: context(6),
            dictionaryId: dictionary.id,
            draft: {
                overrides,
                values: {
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                    transcription: null,
                    translation: 'el taller',
                },
            },
            expectedDictionaryVersion: created.dictionaryVersion,
            expectedSettingsVersion: dictionary.settings.version,
            fingerprint: fingerprint('Y'),
            format: 'card-authoring:v2',
            idempotencyKey: `authoring-v2-successor-${randomUUID()}`,
            ownerId,
            predecessor: {
                discardedSuggestionIds: [],
                jobId: job.id,
            },
            scope: { kind: 'field', field: 'translation' },
            source: sourceSuggestion.value,
            target: {
                kind: 'update',
                cardId: card.id,
                expectedCardVersion: card.version,
            },
        });
        const successorClaim = await generationStore.claim({
            context: context(7),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: ['card-authoring:v2'],
            workerId: 'authoring-v2-worker',
        });
        await generationStore.complete({
            context: context(8),
            fencingToken: successorClaim!.fencingToken,
            jobId: successor.id,
            leaseDeadline: successorClaim!.leaseDeadline,
            proposal: {
                suggestions: [{ field: 'translation', value: 'el estudio' }],
            },
            providerUsage: { inputTokens: 2, outputTokens: 1 },
            reviewExpiresAt: instant(60_000),
            workerId: successorClaim!.workerId,
        });
        const successorReview = await generationStore.read({
            context: context(9),
            jobId: successor.id,
            ownerId,
        });
        if (
            successorReview.kind !== 'card-authoring' ||
            successorReview.format !== 'card-authoring:v2' ||
            successorReview.state !== 'review'
        )
            throw new Error('Expected v2 successor review');
        const translationSuggestion = successorReview.proposal.suggestions.find(
            (suggestion) => suggestion.field === 'translation',
        )!;
        expect(translationSuggestion.basisSource).toBe(sourceSuggestion.value);
        const retry = await generationStore.enqueueCardAuthoring({
            context: context(10),
            dictionaryId: dictionary.id,
            draft: {
                overrides,
                values: {
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                    transcription: null,
                    translation: 'el taller',
                },
            },
            expectedDictionaryVersion: created.dictionaryVersion,
            expectedSettingsVersion: dictionary.settings.version,
            fingerprint: fingerprint('Q'),
            format: 'card-authoring:v2',
            idempotencyKey: `authoring-v2-retry-${randomUUID()}`,
            ownerId,
            predecessor: {
                discardedSuggestionIds: [translationSuggestion.id],
                jobId: successor.id,
            },
            scope: { kind: 'field', field: 'translation' },
            source: sourceSuggestion.value,
            target: {
                kind: 'update',
                cardId: card.id,
                expectedCardVersion: card.version,
            },
        });
        expect(retry.id).not.toBe(successor.id);
        await expect(
            generationStore.acceptCardAuthoring({
                acceptanceFingerprint: fingerprint('Z'),
                candidate: {
                    overrides,
                    values: {
                        definition: null,
                        example: null,
                        exampleTranslation: null,
                        source: sourceSuggestion.value,
                        transcription: null,
                        translation: translationSuggestion.value,
                    },
                },
                context: context(11),
                jobId: successor.id,
                ownerId,
                selectedSuggestions: [
                    {
                        field: 'translation',
                        suggestionId: translationSuggestion.id,
                    },
                ],
            }),
        ).rejects.toBeInstanceOf(DictionaryGenerationCandidateConflictError);
        const accepted = await generationStore.acceptCardAuthoring({
            acceptanceFingerprint: fingerprint('X'),
            candidate: {
                overrides,
                values: {
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                    source: sourceSuggestion.value,
                    transcription: null,
                    translation: translationSuggestion.value,
                },
            },
            context: context(12),
            jobId: successor.id,
            ownerId,
            selectedSuggestions: [
                { field: 'source', suggestionId: sourceSuggestion.id },
                {
                    field: 'translation',
                    suggestionId: translationSuggestion.id,
                },
            ],
        });
        expect(accepted.job).toMatchObject({
            state: 'accepted',
            target: {
                kind: 'update',
                cardId: card.id,
                expectedCardVersion: card.version,
            },
        });
        const [persisted] = await database
            .select()
            .from(dictionaryCardsTable)
            .where(eq(dictionaryCardsTable.id, card.id));
        expect(persisted).toMatchObject({
            source: 'the atelier',
            sortKey: persistedBefore!.sortKey,
            version: card.version + 1,
        });
        await expect(
            generationStore.read({
                context: context(12),
                jobId: successor.id,
                ownerId,
            }),
        ).resolves.toMatchObject({
            state: 'accepted',
            target: { kind: 'update', cardId: card.id },
        });
    });

    it('preserves AI provenance when a rejected existing-card candidate is corrected and explicitly accepted', async () => {
        const dictionary = await dictionaryStore.createDictionary({
            context: context(),
            fingerprint: fingerprint('R'),
            idempotencyKey: `corrected-ai-dictionary-${randomUUID()}`,
            ownerId,
            request: {
                description: null,
                name: 'Corrected AI draft',
                sourceLanguage: 'en',
                targetLanguage: 'fr',
            },
        });
        const values = {
            definition: null,
            example: null,
            exampleTranslation: null,
            source: 'helo',
            transcription: null,
            translation: 'bonjour',
        };
        const created = await dictionaryStore.createCard({
            context: context(1),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: dictionary.version,
                expectedSettingsVersion: dictionary.settings.version,
                overrides,
                translationContext: null,
                values,
            },
        });
        expect(created.card.authorship).toBe('human');
        const job = await generationStore.enqueueCardAuthoring({
            context: context(2),
            dictionaryId: dictionary.id,
            draft: {
                overrides,
                translationContext: null,
                values: {
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                    transcription: null,
                    translation: values.translation,
                },
            },
            expectedDictionaryVersion: created.dictionaryVersion,
            expectedSettingsVersion: dictionary.settings.version,
            fingerprint: fingerprint('S'),
            format: 'card-authoring:v3',
            idempotencyKey: `corrected-ai-update-${randomUUID()}`,
            ownerId,
            scope: { kind: 'field', field: 'source' },
            source: values.source,
            target: {
                kind: 'update',
                cardId: created.card.id,
                expectedCardVersion: created.card.version,
            },
        });
        const claim = await generationStore.claim({
            context: context(3),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: ['card-authoring:v3'],
            workerId: 'corrected-ai-worker',
        });
        if (!claim) throw new Error('Expected authoring claim');
        await generationStore.complete({
            context: context(4),
            fencingToken: claim.fencingToken,
            jobId: job.id,
            leaseDeadline: claim.leaseDeadline,
            proposal: {
                sourceResult: { kind: 'suggested', value: 'hello' },
                suggestions: [],
            },
            providerUsage: { inputTokens: 2, outputTokens: 1 },
            reviewExpiresAt: instant(60_000),
            workerId: claim.workerId,
        });
        const review = await generationStore.read({
            context: context(5),
            jobId: job.id,
            ownerId,
        });
        if (
            review.kind !== 'card-authoring' ||
            review.format !== 'card-authoring:v3' ||
            review.state !== 'review'
        ) {
            throw new Error('Expected v3 review');
        }
        const source = review.proposal.sourceSuggestions[0]!;
        const acceptance = {
            acceptanceFingerprint: fingerprint('T'),
            candidate: {
                overrides,
                translationContext: null,
                values: {
                    ...values,
                    source: source.value,
                    translation: 'salut (manually corrected)',
                },
            },
            context: context(7),
            jobId: job.id,
            ownerId,
            selectedSuggestions: [
                { field: 'source' as const, suggestionId: source.id },
            ],
        };
        await expect(
            generationStore.acceptCardAuthoring({
                ...acceptance,
                context: context(6),
                candidate: {
                    ...acceptance.candidate,
                    values: {
                        ...acceptance.candidate.values,
                        source: 'invalid source basis',
                    },
                },
            }),
        ).rejects.toBeInstanceOf(DictionaryGenerationCandidateConflictError);
        const [unchanged] = await database
            .select()
            .from(dictionaryCardsTable)
            .where(eq(dictionaryCardsTable.id, created.card.id));
        expect(unchanged).toMatchObject({
            authorship: 'human',
            source: values.source,
            version: created.card.version,
        });
        await expect(
            generationStore.read({
                context: context(6),
                jobId: job.id,
                ownerId,
            }),
        ).resolves.toMatchObject({ state: 'review' });
        const accepted = await generationStore.acceptCardAuthoring(acceptance);
        expect(accepted).toMatchObject({
            job: { id: job.id, state: 'accepted' },
            outcome: {
                cardId: created.card.id,
                cardVersion: created.card.version + 1,
            },
        });
        const [persisted] = await database
            .select()
            .from(dictionaryCardsTable)
            .where(eq(dictionaryCardsTable.id, created.card.id));
        expect(persisted).toMatchObject({
            authorship: 'mixed',
            source: source.value,
            translation: acceptance.candidate.values.translation,
            version: created.card.version + 1,
        });
        const revisions = await database
            .select()
            .from(dictionaryCardRevisionsTable)
            .where(eq(dictionaryCardRevisionsTable.cardId, created.card.id));
        expect(revisions).toHaveLength(2);
        expect(revisions).toContainEqual(
            expect.objectContaining({
                acceptedGenerationJobId: job.id,
                authorship: 'mixed',
                mutationKind: 'ai_proposal_accept',
            }),
        );
    });

    it('persists v3 inherited and overridden context through review, acceptance, and stale conflict', async () => {
        const created = await dictionaryStore.createDictionary({
            context: context(),
            fingerprint: fingerprint('K'),
            idempotencyKey: `dictionary-create-${randomUUID()}`,
            ownerId,
            request: {
                description: null,
                name: 'Context authoring',
                sourceLanguage: 'en',
                targetLanguage: 'fr',
            },
        });
        const dictionary = await dictionaryStore.updateDictionary({
            context: context(1),
            dictionaryId: created.id,
            ownerId,
            request: {
                expectedDictionaryVersion: created.version,
                translationContext: 'Museum curation terminology',
            },
        });
        const inherited = await generationStore.enqueueCardAuthoring({
            context: context(2),
            dictionaryId: dictionary.id,
            draft: {
                overrides,
                translationContext: null,
                values: {
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                    transcription: null,
                    translation: null,
                },
            },
            expectedDictionaryVersion: dictionary.version,
            expectedSettingsVersion: dictionary.settings.version,
            fingerprint: fingerprint('L'),
            format: 'card-authoring:v3',
            idempotencyKey: `authoring-v3-${randomUUID()}`,
            ownerId,
            scope: { kind: 'field', field: 'translation' },
            source: 'collection',
            target: { kind: 'create' },
        });
        const inheritedClaim = await generationStore.claim({
            context: context(3),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: ['card-authoring:v3'],
            workerId: 'authoring-v3-worker',
        });
        expect(inheritedClaim?.input).toMatchObject({
            draft: { translationContext: null },
            format: 'card-authoring:v3',
            translationContext: 'Museum curation terminology',
        });
        await generationStore.complete({
            context: context(4),
            fencingToken: inheritedClaim!.fencingToken,
            jobId: inherited.id,
            leaseDeadline: inheritedClaim!.leaseDeadline,
            proposal: {
                suggestions: [{ field: 'translation', value: 'collection' }],
            },
            providerUsage: { inputTokens: 3, outputTokens: 1 },
            reviewExpiresAt: instant(60_000),
            workerId: inheritedClaim!.workerId,
        });
        const review = await generationStore.read({
            context: context(5),
            jobId: inherited.id,
            ownerId,
        });
        if (
            review.kind !== 'card-authoring' ||
            review.format !== 'card-authoring:v3' ||
            review.state !== 'review'
        )
            throw new Error('Expected v3 review');
        expect(review.proposal.translationContext).toBe(
            'Museum curation terminology',
        );
        const translationSuggestion = review.proposal.suggestions.find(
            (suggestion) => suggestion.field === 'translation',
        )!;
        await expect(
            generationStore.acceptCardAuthoring({
                acceptanceFingerprint: fingerprint('M'),
                candidate: {
                    overrides,
                    translationContext: 'Conflicting card context',
                    values: {
                        definition: null,
                        example: null,
                        exampleTranslation: null,
                        source: 'collection',
                        transcription: null,
                        translation: translationSuggestion.value,
                    },
                },
                context: context(6),
                jobId: inherited.id,
                ownerId,
                selectedSuggestions: [
                    {
                        field: 'translation',
                        suggestionId: translationSuggestion.id,
                    },
                ],
            }),
        ).rejects.toBeInstanceOf(DictionaryGenerationCandidateConflictError);
        const accepted = await generationStore.acceptCardAuthoring({
            acceptanceFingerprint: fingerprint('N'),
            candidate: {
                overrides,
                translationContext: null,
                values: {
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                    source: 'collection',
                    transcription: null,
                    translation: translationSuggestion.value,
                },
            },
            context: context(7),
            jobId: inherited.id,
            ownerId,
            selectedSuggestions: [
                {
                    field: 'translation',
                    suggestionId: translationSuggestion.id,
                },
            ],
        });
        const [acceptedCard] = await database
            .select()
            .from(dictionaryCardsTable)
            .where(eq(dictionaryCardsTable.id, accepted.outcome.cardId));
        const [acceptedRevision] = await database
            .select()
            .from(dictionaryCardRevisionsTable)
            .where(
                eq(
                    dictionaryCardRevisionsTable.cardId,
                    accepted.outcome.cardId,
                ),
            );
        expect(acceptedCard?.translationContext).toBeNull();
        expect(acceptedRevision?.snapshot).toMatchObject({
            effectiveTranslationContext: 'Museum curation terminology',
            rawTranslationContext: null,
            schemaVersion: 2,
        });
        const [acceptedJob] = await database
            .select({
                inputPayload: dictionaryGenerationJobsTable.inputPayload,
            })
            .from(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, inherited.id));
        expect(acceptedJob?.inputPayload).toBeNull();

        const overridden = await generationStore.enqueueCardAuthoring({
            context: context(8),
            dictionaryId: dictionary.id,
            draft: {
                overrides,
                translationContext: 'Photography collection terminology',
                values: {
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                    transcription: null,
                    translation: null,
                },
            },
            expectedDictionaryVersion: accepted.outcome.dictionaryVersion,
            expectedSettingsVersion: dictionary.settings.version,
            fingerprint: fingerprint('O'),
            format: 'card-authoring:v3',
            idempotencyKey: `authoring-v3-override-${randomUUID()}`,
            ownerId,
            scope: { kind: 'field', field: 'translation' },
            source: 'exposure',
            target: { kind: 'create' },
        });
        const overriddenClaim = await generationStore.claim({
            context: context(9),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: ['card-authoring:v3'],
            workerId: 'authoring-v3-worker',
        });
        expect(overriddenClaim?.input).toMatchObject({
            draft: {
                translationContext: 'Photography collection terminology',
            },
            translationContext: 'Photography collection terminology',
        });
        await generationStore.complete({
            context: context(10),
            fencingToken: overriddenClaim!.fencingToken,
            jobId: overridden.id,
            leaseDeadline: overriddenClaim!.leaseDeadline,
            proposal: {
                suggestions: [{ field: 'translation', value: 'exposition' }],
            },
            providerUsage: { inputTokens: 3, outputTokens: 1 },
            reviewExpiresAt: instant(60_000),
            workerId: overriddenClaim!.workerId,
        });
        await dictionaryStore.updateDictionary({
            context: context(11),
            dictionaryId: dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: accepted.outcome.dictionaryVersion,
                translationContext: 'Changed dictionary terminology',
            },
        });
        const overriddenReview = await generationStore.read({
            context: context(12),
            jobId: overridden.id,
            ownerId,
        });
        if (
            overriddenReview.kind !== 'card-authoring' ||
            overriddenReview.format !== 'card-authoring:v3' ||
            overriddenReview.state !== 'review'
        )
            throw new Error('Expected overridden v3 review');
        const overriddenSuggestion = overriddenReview.proposal.suggestions.find(
            (suggestion) => suggestion.field === 'translation',
        )!;
        await expect(
            generationStore.acceptCardAuthoring({
                acceptanceFingerprint: fingerprint('P'),
                candidate: {
                    overrides,
                    translationContext: 'Photography collection terminology',
                    values: {
                        definition: null,
                        example: null,
                        exampleTranslation: null,
                        source: 'exposure',
                        transcription: null,
                        translation: overriddenSuggestion.value,
                    },
                },
                context: context(12),
                jobId: overridden.id,
                ownerId,
                selectedSuggestions: [
                    {
                        field: 'translation',
                        suggestionId: overriddenSuggestion.id,
                    },
                ],
            }),
        ).rejects.toBeInstanceOf(DictionaryVersionConflictError);
    });
});
