import { randomUUID } from 'node:crypto';

import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { databaseSchema } from '../../../../../src/infrastructure/database/schema';
import { dictionaryCardAuthoringGenerationFormat } from '../../../../../src/modules/dictionaries/domain/card-authoring';
import {
    DictionaryGenerationCandidateConflictError,
    DictionaryGenerationCompletionConflictError,
    DictionaryGenerationNotReviewableError,
} from '../../../../../src/modules/dictionaries/application/dictionary-errors';
import { DrizzleDictionaryGenerationStore } from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-generation-store';
import { DrizzleDictionaryStore } from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-store';
import {
    dictionaryCardRevisionsTable,
    dictionaryCardsTable,
    dictionaryGenerationJobsTable,
    dictionaryGenerationProposalsTable,
    dictionaryGenerationProviderCircuitTable,
} from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
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
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
        dictionaryStore = new DrizzleDictionaryStore(database, {
            generate: randomUUID,
        });
        generationStore = new DrizzleDictionaryGenerationStore(database, {
            generate: randomUUID,
        });
    });

    beforeEach(async () => {
        await database.delete(dictionaryGenerationProposalsTable);
        await database.delete(dictionaryCardRevisionsTable);
        await database.delete(dictionaryGenerationJobsTable);
        await database.delete(dictionaryGenerationProviderCircuitTable);
        await database.delete(usersTable);
        ownerId = randomUUID();
        await database.insert(usersTable).values({
            createdAt: instant(),
            id: ownerId,
            status: 'active',
            updatedAt: instant(),
        });
    });

    afterAll(async () => client.end());

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
            supportedFormats: ['single-card:v1'],
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
});
