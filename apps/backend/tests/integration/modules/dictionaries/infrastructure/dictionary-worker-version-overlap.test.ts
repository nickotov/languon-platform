import { randomUUID } from 'node:crypto';

import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { databaseSchema } from '../../../../../src/infrastructure/database/schema';
import {
    DictionaryGenerationCandidateConflictError,
    DictionaryIdempotencyConflictError,
    DictionaryGenerationNotAvailableError,
    DictionaryGenerationProposalExpiredError,
    DictionaryVersionConflictError,
} from '../../../../../src/modules/dictionaries/application/dictionary-errors';
import { defaultDictionaryGenerationProviderBudgetPolicy } from '../../../../../src/modules/dictionaries/application/ports/dictionary-generation-provider-policy';
import {
    dictionaryGenerationFormat,
    type DictionaryGenerationProposalPayload,
} from '../../../../../src/modules/dictionaries/domain/generation';
import { InvalidDictionarySettingsError } from '../../../../../src/modules/dictionaries/domain/settings';
import { DrizzleDictionaryGenerationStore } from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-generation-store';
import { DrizzleDictionaryStore } from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-store';
import {
    dictionaryCardRevisionsTable,
    dictionaryCardsTable,
    dictionaryGenerationJobsTable,
    dictionaryGenerationProposalsTable,
    dictionaryGenerationProviderCircuitTable,
    dictionariesTable,
} from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import { usersTable } from '../../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../support/test-database';

const run = describe.runIf(isDatabaseIntegrationEnabled());
const instant = (milliseconds = 0) =>
    new Date(Date.parse('2026-08-21T12:00:00.000Z') + milliseconds);
const context = (milliseconds = 0) => ({
    now: instant(milliseconds),
    signal: new AbortController().signal,
});
const fingerprint = (character: string) =>
    `hmac-sha256:v1:${character.repeat(43)}`;

run('dictionary worker version overlap', () => {
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

    async function seedCard(seedOwnerId = ownerId) {
        const dictionary = await dictionaryStore.createDictionary({
            context: context(),
            fingerprint: fingerprint('A'),
            idempotencyKey: `dictionary-create-${randomUUID()}`,
            ownerId: seedOwnerId,
            request: {
                description: null,
                name: 'Worker overlap',
                sourceLanguage: 'en',
                targetLanguage: 'fr',
            },
        });
        const created = await dictionaryStore.createCard({
            context: context(1),
            dictionaryId: dictionary.id,
            ownerId: seedOwnerId,
            request: {
                expectedDictionaryVersion: dictionary.version,
                expectedSettingsVersion: dictionary.settings.version,
                overrides: {
                    definitionEnabled: null,
                    definitionLanguage: null,
                    exampleEnabled: null,
                    exampleLanguage: null,
                    exampleTranslationEnabled: null,
                    transcriptionCustomLabel: null,
                    transcriptionEnabled: null,
                    transcriptionNotation: null,
                },
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
        return { dictionary, created, ownerId: seedOwnerId };
    }

    async function enqueue(
        seeded: Awaited<ReturnType<typeof seedCard>>,
        key = `generation-job-${randomUUID()}`,
        requestFingerprint = fingerprint('B'),
        at = 2,
        store = generationStore,
    ) {
        return store.enqueue({
            cardId: seeded.created.card.id,
            context: context(at),
            dictionaryId: seeded.dictionary.id,
            expectedCardVersion: seeded.created.card.version,
            expectedDictionaryVersion: seeded.created.dictionaryVersion,
            expectedSettingsVersion: seeded.dictionary.settings.version,
            fingerprint: requestFingerprint,
            idempotencyKey: key,
            instruction: 'Improve articles',
            ownerId: seeded.ownerId,
        });
    }

    async function markCardAsAiGenerated(
        seeded: Awaited<ReturnType<typeof seedCard>>,
    ) {
        const [revision] = await database
            .select()
            .from(dictionaryCardRevisionsTable)
            .where(
                eq(dictionaryCardRevisionsTable.cardId, seeded.created.card.id),
            );
        expect(revision).toBeDefined();
        await database
            .update(dictionaryCardsTable)
            .set({ authorship: 'ai-generated' })
            .where(eq(dictionaryCardsTable.id, seeded.created.card.id));
        await database
            .update(dictionaryCardRevisionsTable)
            .set({
                authorship: 'ai-generated',
                mutationKind: 'ai_create',
                snapshot: {
                    ...revision!.snapshot,
                    authorship: 'ai-generated',
                },
            })
            .where(eq(dictionaryCardRevisionsTable.id, revision!.id));
    }

    async function completeGeneration(
        seeded: Awaited<ReturnType<typeof seedCard>>,
        generatedProposal: DictionaryGenerationProposalPayload,
        at: number,
        reviewExpiresAt = instant(at + 60_000),
    ) {
        const job = await enqueue(
            seeded,
            `generation-job-${randomUUID()}`,
            fingerprint(String.fromCharCode(65 + (at % 26))),
            at,
        );
        const claim = await generationStore.claim({
            context: context(at + 1),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryGenerationFormat],
            workerId: `worker-${at}`,
        });
        expect(claim?.id).toBe(job.id);
        await expect(
            generationStore.complete({
                context: context(at + 2),
                fencingToken: claim!.fencingToken,
                jobId: job.id,
                leaseDeadline: claim!.leaseDeadline,
                proposal: generatedProposal,
                reviewExpiresAt,
                workerId: claim!.workerId,
            }),
        ).resolves.toBe(true);
        return job;
    }

    async function persistedAcceptance(cardId: string, jobId: string) {
        const [card] = await database
            .select()
            .from(dictionaryCardsTable)
            .where(eq(dictionaryCardsTable.id, cardId));
        const revisions = await database
            .select()
            .from(dictionaryCardRevisionsTable)
            .where(eq(dictionaryCardRevisionsTable.cardId, cardId));
        const [acceptedProposal] = await database
            .select()
            .from(dictionaryGenerationProposalsTable)
            .where(eq(dictionaryGenerationProposalsTable.jobId, jobId));
        const [dictionary] = await database
            .select()
            .from(dictionariesTable)
            .where(eq(dictionariesTable.id, card!.dictionaryId));
        return { acceptedProposal, card, dictionary, revisions };
    }

    const proposal = {
        candidate: {
            overrides: {
                definitionEnabled: null,
                definitionLanguage: null,
                exampleEnabled: null,
                exampleLanguage: null,
                exampleTranslationEnabled: null,
                transcriptionCustomLabel: null,
                transcriptionEnabled: null,
                transcriptionNotation: null,
            },
            values: {
                definition: null,
                example: null,
                exampleTranslation: null,
                source: 'the hello',
                transcription: null,
                translation: 'le bonjour',
            },
        },
        fieldFeedback: [],
        warnings: [],
    };

    it('lets only a compatible worker claim, recovers an expired lease, and fences paused stale output', async () => {
        const seeded = await seedCard();
        const job = await enqueue(seeded);

        await expect(
            generationStore.claim({
                context: context(3),
                globalConcurrency: 2,
                leaseDurationMs: 1_000,
                ownerConcurrency: 1,
                supportedFormats: [],
                workerId: 'release-r',
            }),
        ).resolves.toBeNull();
        const oldClaim = await generationStore.claim({
            context: context(4),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryGenerationFormat],
            workerId: 'release-r',
        });
        expect(oldClaim?.id).toBe(job.id);

        const newClaim = await generationStore.claim({
            context: context(1_100),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryGenerationFormat],
            workerId: 'release-r-plus-one',
        });
        expect(newClaim?.id).toBe(job.id);
        expect(newClaim!.fencingToken).toBeGreaterThan(oldClaim!.fencingToken);

        await expect(
            generationStore.complete({
                context: context(1_200),
                fencingToken: oldClaim!.fencingToken,
                jobId: job.id,
                leaseDeadline: oldClaim!.leaseDeadline,
                proposal,
                reviewExpiresAt: instant(60_000),
                workerId: oldClaim!.workerId,
            }),
        ).resolves.toBe(false);
        await expect(
            generationStore.complete({
                context: context(1_200),
                fencingToken: newClaim!.fencingToken,
                jobId: job.id,
                leaseDeadline: newClaim!.leaseDeadline,
                proposal,
                reviewExpiresAt: instant(60_000),
                workerId: newClaim!.workerId,
            }),
        ).resolves.toBe(true);

        await expect(
            generationStore.read({
                context: context(1_300),
                jobId: job.id,
                ownerId,
            }),
        ).resolves.toMatchObject({
            id: job.id,
            originalSnapshot: { values: { source: 'hello' } },
            proposal: { candidate: { values: { source: 'the hello' } } },
            state: 'review',
        });
    });

    it('allows exactly one independent database client to claim the same queued job', async () => {
        const seeded = await seedCard();
        const job = await enqueue(seeded);
        const competingClient = createTestPostgresClient();
        const competingDatabase = createDrizzleDatabase(
            competingClient,
            databaseSchema,
        );
        const competingStore = new DrizzleDictionaryGenerationStore(
            competingDatabase,
            { generate: randomUUID },
        );

        try {
            const claims = await Promise.all([
                generationStore.claim({
                    context: context(3),
                    globalConcurrency: 2,
                    leaseDurationMs: 1_000,
                    ownerConcurrency: 2,
                    supportedFormats: [dictionaryGenerationFormat],
                    workerId: 'independent-worker-a',
                }),
                competingStore.claim({
                    context: context(3),
                    globalConcurrency: 2,
                    leaseDurationMs: 1_000,
                    ownerConcurrency: 2,
                    supportedFormats: [dictionaryGenerationFormat],
                    workerId: 'independent-worker-b',
                }),
            ]);
            const claimed = claims.filter((claim) => claim !== null);
            expect(claimed).toHaveLength(1);
            expect(claimed[0]?.id).toBe(job.id);

            const [persisted] = await database
                .select({
                    state: dictionaryGenerationJobsTable.executionState,
                    workerId: dictionaryGenerationJobsTable.workerId,
                })
                .from(dictionaryGenerationJobsTable)
                .where(eq(dictionaryGenerationJobsTable.id, job.id));
            expect(persisted).toEqual({
                state: 'running',
                workerId: claimed[0]?.workerId,
            });
        } finally {
            await competingClient.end();
        }
    });

    it('never claims behind a sweep page of legacy cancellation-marked queued rows', async () => {
        const seeded = await seedCard();
        const job = await enqueue(seeded);
        const [template] = await database
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, job.id));
        expect(template).toBeDefined();
        const cancellationRequestedAt = instant(3);
        await database
            .update(dictionaryGenerationJobsTable)
            .set({ cancellationRequestedAt })
            .where(eq(dictionaryGenerationJobsTable.id, job.id));
        await database.insert(dictionaryGenerationJobsTable).values(
            Array.from({ length: 25 }, (_, index) => ({
                ...template!,
                cancellationRequestedAt,
                id: randomUUID(),
                idempotencyKey: `legacy-cancelled-job-${index}-${randomUUID()}`,
            })),
        );

        await expect(
            generationStore.claim({
                context: context(4),
                globalConcurrency: 50,
                leaseDurationMs: 1_000,
                ownerConcurrency: 50,
                supportedFormats: [dictionaryGenerationFormat],
                workerId: 'cancel-sweep-worker',
            }),
        ).resolves.toBeNull();
        const afterFirstSweep = await database
            .select()
            .from(dictionaryGenerationJobsTable);
        expect(
            afterFirstSweep.filter((row) => row.executionState === 'running'),
        ).toHaveLength(0);
        expect(
            afterFirstSweep.filter(
                (row) =>
                    row.executionState === 'queued' &&
                    row.cancellationRequestedAt !== null,
            ),
        ).toHaveLength(1);

        await expect(
            generationStore.claim({
                context: context(5),
                globalConcurrency: 50,
                leaseDurationMs: 1_000,
                ownerConcurrency: 50,
                supportedFormats: [dictionaryGenerationFormat],
                workerId: 'cancel-sweep-worker',
            }),
        ).resolves.toBeNull();
        const terminal = await database
            .select()
            .from(dictionaryGenerationJobsTable);
        expect(
            terminal.every((row) => row.executionState === 'cancelled'),
        ).toBe(true);
    });

    it('persists AI acceptance authorship, immutable provenance, and semantic no-op identity', async () => {
        const humanSeeded = await seedCard();
        const humanJob = await completeGeneration(humanSeeded, proposal, 10);
        const humanAccepted = await generationStore.accept({
            candidate: proposal.candidate,
            candidateFingerprint: fingerprint('H'),
            context: context(13),
            jobId: humanJob.id,
            ownerId,
        });
        const humanPersistence = await persistedAcceptance(
            humanSeeded.created.card.id,
            humanJob.id,
        );
        expect(humanAccepted.outcome).toEqual({
            cardId: humanSeeded.created.card.id,
            cardVersion: 2,
            dictionaryVersion: 3,
        });
        expect(humanPersistence.card).toMatchObject({
            authorship: 'mixed',
            source: 'the hello',
            translation: 'le bonjour',
            version: 2,
        });
        expect(humanPersistence.revisions).toHaveLength(2);
        expect(humanPersistence.revisions[1]).toMatchObject({
            acceptedGenerationJobId: humanJob.id,
            actorUserId: ownerId,
            authorship: 'mixed',
            cardVersion: 2,
            mutationKind: 'ai_proposal_accept',
            revisionNumber: 2,
            settingsVersion: 1,
            snapshot: {
                authorship: 'mixed',
                cardVersion: 2,
                values: {
                    source: 'the hello',
                    translation: 'le bonjour',
                },
            },
        });
        expect(humanPersistence.acceptedProposal).toMatchObject({
            acceptedCardVersion: 2,
            acceptedDictionaryVersion: 3,
            acceptedRevisionId: humanPersistence.revisions[1]!.id,
            payload: null,
            reviewState: 'accepted',
        });

        const aiSeeded = await seedCard();
        await markCardAsAiGenerated(aiSeeded);
        const aiJob = await completeGeneration(aiSeeded, proposal, 20);
        await generationStore.accept({
            candidate: proposal.candidate,
            candidateFingerprint: fingerprint('I'),
            context: context(23),
            jobId: aiJob.id,
            ownerId,
        });
        const aiPersistence = await persistedAcceptance(
            aiSeeded.created.card.id,
            aiJob.id,
        );
        expect(aiPersistence.card).toMatchObject({
            authorship: 'ai-generated',
            version: 2,
        });
        expect(aiPersistence.revisions[1]).toMatchObject({
            acceptedGenerationJobId: aiJob.id,
            actorUserId: ownerId,
            authorship: 'ai-generated',
            mutationKind: 'ai_proposal_accept',
            snapshot: { authorship: 'ai-generated' },
        });

        const editedSeeded = await seedCard();
        await markCardAsAiGenerated(editedSeeded);
        const editedJob = await completeGeneration(editedSeeded, proposal, 30);
        const editedCandidate = {
            ...proposal.candidate,
            values: {
                ...proposal.candidate.values,
                translation: 'bonjour humain',
            },
        };
        await generationStore.accept({
            candidate: editedCandidate,
            candidateFingerprint: fingerprint('J'),
            context: context(33),
            jobId: editedJob.id,
            ownerId,
        });
        const editedPersistence = await persistedAcceptance(
            editedSeeded.created.card.id,
            editedJob.id,
        );
        expect(editedPersistence.card).toMatchObject({
            authorship: 'mixed',
            translation: 'bonjour humain',
            version: 2,
        });
        expect(editedPersistence.revisions[1]).toMatchObject({
            acceptedGenerationJobId: editedJob.id,
            actorUserId: ownerId,
            authorship: 'mixed',
            mutationKind: 'ai_proposal_accept',
            snapshot: {
                authorship: 'mixed',
                values: { translation: 'bonjour humain' },
            },
        });

        const noOpSeeded = await seedCard();
        const noOpProposal = {
            ...proposal,
            candidate: {
                overrides: noOpSeeded.created.card.overrides,
                values: noOpSeeded.created.card.values,
            },
        };
        const noOpAt = 86_400_040;
        const noOpJob = await completeGeneration(
            noOpSeeded,
            noOpProposal,
            noOpAt,
        );
        const noOpBefore = await persistedAcceptance(
            noOpSeeded.created.card.id,
            noOpJob.id,
        );
        const noOpAccepted = await generationStore.accept({
            candidate: noOpProposal.candidate,
            candidateFingerprint: fingerprint('K'),
            context: context(noOpAt + 3),
            jobId: noOpJob.id,
            ownerId,
        });
        const noOpAfter = await persistedAcceptance(
            noOpSeeded.created.card.id,
            noOpJob.id,
        );
        expect(noOpAccepted.outcome).toEqual({
            cardId: noOpSeeded.created.card.id,
            cardVersion: 1,
            dictionaryVersion: 2,
        });
        expect(noOpAfter.card).toEqual(noOpBefore.card);
        expect(noOpAfter.dictionary).toEqual(noOpBefore.dictionary);
        expect(noOpAfter.revisions).toEqual(noOpBefore.revisions);
        expect(noOpAfter.acceptedProposal).toMatchObject({
            acceptedCardVersion: 1,
            acceptedDictionaryVersion: 2,
            acceptedRevisionId: noOpAfter.revisions[0]!.id,
            payload: null,
            reviewState: 'accepted',
        });
        expect(noOpAfter.revisions[0]).toMatchObject({
            acceptedGenerationJobId: null,
            authorship: 'human',
            cardVersion: 1,
            mutationKind: 'manual_create',
            revisionNumber: 1,
        });
    });

    it('commits proposal expiry during reads and rejected review actions', async () => {
        const accepting = await seedCard();
        const acceptingJob = await completeGeneration(
            accepting,
            proposal,
            50,
            instant(53),
        );
        await expect(
            generationStore.accept({
                candidate: proposal.candidate,
                candidateFingerprint: fingerprint('L'),
                context: context(54),
                jobId: acceptingJob.id,
                ownerId,
            }),
        ).rejects.toBeInstanceOf(DictionaryGenerationProposalExpiredError);
        await expect(
            generationStore.read({
                context: context(55),
                jobId: acceptingJob.id,
                ownerId,
            }),
        ).resolves.toMatchObject({
            originalSnapshot: null,
            proposal: null,
            state: 'expired',
        });

        const discarding = await seedCard();
        const discardingJob = await completeGeneration(
            discarding,
            proposal,
            60,
            instant(63),
        );
        await expect(
            generationStore.discard({
                context: context(64),
                jobId: discardingJob.id,
                ownerId,
            }),
        ).rejects.toBeInstanceOf(DictionaryGenerationProposalExpiredError);
        const [discardedProposal] = await database
            .select()
            .from(dictionaryGenerationProposalsTable)
            .where(
                eq(dictionaryGenerationProposalsTable.jobId, discardingJob.id),
            );
        const [discardedJob] = await database
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, discardingJob.id));
        expect(discardedProposal).toMatchObject({
            payload: null,
            reviewState: 'expired',
            terminalAt: instant(64),
        });
        expect(discardedJob?.inputPayload).toBeNull();
    });

    it('rejects settings-invalid provider candidates before proposal persistence', async () => {
        const seeded = await seedCard();
        const job = await enqueue(seeded);
        const claim = await generationStore.claim({
            context: context(3),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryGenerationFormat],
            workerId: 'validation-worker',
        });
        const invalidProposal = {
            ...proposal,
            candidate: {
                ...proposal.candidate,
                overrides: {
                    ...proposal.candidate.overrides,
                    transcriptionEnabled: 'enabled' as const,
                    transcriptionNotation: 'custom' as const,
                },
            },
        };

        await expect(
            generationStore.complete({
                context: context(4),
                fencingToken: claim!.fencingToken,
                jobId: job.id,
                leaseDeadline: claim!.leaseDeadline,
                proposal: invalidProposal,
                reviewExpiresAt: instant(60_000),
                workerId: claim!.workerId,
            }),
        ).rejects.toBeInstanceOf(InvalidDictionarySettingsError);
        await expect(
            database
                .select()
                .from(dictionaryGenerationProposalsTable)
                .where(eq(dictionaryGenerationProposalsTable.jobId, job.id)),
        ).resolves.toEqual([]);
    });

    it('reserves owner provider budget idempotently and releases it on terminal cancellation', async () => {
        const seeded = await seedCard();
        const firstKey = `generation-job-${randomUUID()}`;
        const first = await enqueue(seeded, firstKey, fingerprint('M'), 2);
        await expect(
            enqueue(seeded, firstKey, fingerprint('M'), 3),
        ).resolves.toMatchObject({ id: first.id });
        await enqueue(seeded, undefined, fingerprint('N'), 4);
        await enqueue(seeded, undefined, fingerprint('O'), 5);
        await expect(
            enqueue(seeded, undefined, fingerprint('P'), 6),
        ).rejects.toBeInstanceOf(DictionaryGenerationNotAvailableError);

        const beforeRelease = await database
            .select()
            .from(dictionaryGenerationJobsTable);
        expect(beforeRelease).toHaveLength(3);
        expect(
            beforeRelease.reduce(
                (total, job) => total + job.providerReservedCostMicros,
                0,
            ),
        ).toBe(150_000);
        expect(
            beforeRelease.every(
                (job) => job.providerReservationState === 'active',
            ),
        ).toBe(true);

        await generationStore.cancel({
            context: context(7),
            jobId: first.id,
            ownerId,
        });
        await expect(
            enqueue(seeded, undefined, fingerprint('P'), 8),
        ).resolves.toMatchObject({ state: 'queued' });
        const [released] = await database
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, first.id));
        expect(released).toMatchObject({
            providerActualCostMicros: 0,
            providerActualInputTokens: 0,
            providerActualOutputTokens: 0,
            providerReservationState: 'released',
        });
    });

    it('does not double-reserve retries and settles available provider usage exactly once', async () => {
        const seeded = await seedCard();
        const job = await enqueue(seeded);
        const firstClaim = await generationStore.claim({
            context: context(3),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryGenerationFormat],
            workerId: 'retry-worker',
        });
        await expect(
            generationStore.fail({
                context: context(4),
                failureCategory: 'provider_timeout',
                fencingToken: firstClaim!.fencingToken,
                jobId: job.id,
                leaseDeadline: firstClaim!.leaseDeadline,
                retryAt: instant(5),
                workerId: firstClaim!.workerId,
            }),
        ).resolves.toBe(true);
        const [afterRetry] = await database
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, job.id));
        expect(afterRetry).toMatchObject({
            providerActualCostMicros: null,
            providerReservationState: 'active',
            providerReservedAttempts: 1,
            providerReservedCostMicros: 50_000,
            providerReservedInputTokens:
                defaultDictionaryGenerationProviderBudgetPolicy.maxInputTokensPerAttempt,
            providerReservedOutputTokens:
                defaultDictionaryGenerationProviderBudgetPolicy.maxOutputTokensPerAttempt,
        });

        const secondClaim = await generationStore.claim({
            context: context(5),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryGenerationFormat],
            workerId: 'retry-worker',
        });
        const [afterSecondClaim] = await database
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, job.id));
        expect(afterSecondClaim).toMatchObject({
            providerReservationState: 'active',
            providerReservedAttempts: 2,
            providerReservedCostMicros: 100_000,
            providerReservedInputTokens:
                defaultDictionaryGenerationProviderBudgetPolicy.maxInputTokensPerAttempt *
                2,
            providerReservedOutputTokens:
                defaultDictionaryGenerationProviderBudgetPolicy.maxOutputTokensPerAttempt *
                2,
        });
        await expect(
            generationStore.complete({
                context: context(6),
                fencingToken: secondClaim!.fencingToken,
                jobId: job.id,
                leaseDeadline: secondClaim!.leaseDeadline,
                proposal,
                providerUsage: { inputTokens: 321, outputTokens: 123 },
                reviewExpiresAt: instant(60_000),
                workerId: secondClaim!.workerId,
            }),
        ).resolves.toBe(true);
        const [settled] = await database
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, job.id));
        expect(settled).toMatchObject({
            attemptCount: 2,
            providerActualCostMicros: 50_000,
            providerActualInputTokens:
                defaultDictionaryGenerationProviderBudgetPolicy.maxInputTokensPerAttempt +
                321,
            providerActualOutputTokens:
                defaultDictionaryGenerationProviderBudgetPolicy.maxOutputTokensPerAttempt +
                123,
            providerReservationState: 'settled',
            providerReservedAttempts: 2,
            providerReservedCostMicros: 100_000,
        });
    });

    it('derives conservative reservation and actual settlement from one shared priced policy', async () => {
        const pricedStore = new DrizzleDictionaryGenerationStore(
            database,
            { generate: randomUUID },
            {
                inputCostMicrosPerMillionTokens: 1_000_000,
                maxCostMicrosPerAttempt: 100_000,
                maxInputTokensPerAttempt: 65_536,
                maxOutputTokensPerAttempt: 1_024,
                outputCostMicrosPerMillionTokens: 10_000_000,
            },
        );
        const seeded = await seedCard();
        const job = await enqueue(
            seeded,
            undefined,
            fingerprint('p'),
            2,
            pricedStore,
        );
        const claim = await generationStore.claim({
            context: context(3),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryGenerationFormat],
            workerId: 'priced-worker',
        });
        expect(claim?.providerBudget).toEqual({
            inputCostMicrosPerMillionTokens: 1_000_000,
            maxCostMicrosPerAttempt: 100_000,
            maxInputTokensPerAttempt: 65_536,
            maxOutputTokensPerAttempt: 1_024,
            outputCostMicrosPerMillionTokens: 10_000_000,
        });
        await expect(
            generationStore.complete({
                context: context(4),
                fencingToken: claim!.fencingToken,
                jobId: job.id,
                leaseDeadline: claim!.leaseDeadline,
                proposal,
                providerUsage: { inputTokens: 321, outputTokens: 123 },
                reviewExpiresAt: instant(60_000),
                workerId: claim!.workerId,
            }),
        ).resolves.toBe(true);
        const [settled] = await database
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, job.id));
        expect(settled).toMatchObject({
            providerActualCostMicros: 1_551,
            providerActualInputTokens: 321,
            providerActualOutputTokens: 123,
            providerReservationState: 'settled',
            providerReservedAttempts: 1,
            providerReservedCostMicros: 100_000,
            providerReservedInputTokens: 65_536,
            providerReservedOutputTokens: 1_024,
        });

        const cheapJob = await enqueue(
            seeded,
            undefined,
            fingerprint('q'),
            5,
            generationStore,
        );
        await expect(
            pricedStore.claim({
                context: context(6),
                globalConcurrency: 2,
                leaseDurationMs: 1_000,
                ownerConcurrency: 1,
                supportedFormats: [dictionaryGenerationFormat],
                workerId: 'incompatible-priced-worker',
            }),
        ).resolves.toBeNull();
        const [stillQueued] = await database
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, cheapJob.id));
        expect(stillQueued).toMatchObject({
            executionState: 'queued',
            providerInputCostMicrosPerMillionTokens: 0,
            providerMaxCostMicrosPerAttempt: 50_000,
            providerOutputCostMicrosPerMillionTokens: 0,
        });
    });

    it('settles every dispatched running cancellation and blocks a paid-call loop at the owner budget', async () => {
        const seeded = await seedCard();
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const at = 2 + attempt * 4;
            const job = await enqueue(
                seeded,
                undefined,
                fingerprint(String.fromCharCode(98 + attempt)),
                at,
            );
            const claim = await generationStore.claim({
                context: context(at + 1),
                globalConcurrency: 2,
                leaseDurationMs: 1_000,
                ownerConcurrency: 1,
                supportedFormats: [dictionaryGenerationFormat],
                workerId: `cancelled-paid-worker-${attempt}`,
            });
            await expect(
                generationStore.cancel({
                    context: context(at + 2),
                    jobId: job.id,
                    ownerId,
                }),
            ).resolves.toMatchObject({
                cancellationRequested: true,
                state: 'running',
            });
            await generationStore.releaseWorkerLeases({
                context: context(at + 3),
                workerId: claim!.workerId,
            });
            const [settled] = await database
                .select()
                .from(dictionaryGenerationJobsTable)
                .where(eq(dictionaryGenerationJobsTable.id, job.id));
            expect(settled).toMatchObject({
                attemptCount: 1,
                executionState: 'cancelled',
                providerActualCostMicros: 50_000,
                providerActualInputTokens:
                    defaultDictionaryGenerationProviderBudgetPolicy.maxInputTokensPerAttempt,
                providerActualOutputTokens:
                    defaultDictionaryGenerationProviderBudgetPolicy.maxOutputTokensPerAttempt,
                providerReservationState: 'settled',
            });
        }

        await expect(
            enqueue(seeded, undefined, fingerprint('e'), 15),
        ).rejects.toBeInstanceOf(DictionaryGenerationNotAvailableError);
    });

    it('settles a dispatched attempt when an expired lease exhausts retries', async () => {
        const seeded = await seedCard();
        const job = await enqueue(seeded);
        await database
            .update(dictionaryGenerationJobsTable)
            .set({ maxAttempts: 1 })
            .where(eq(dictionaryGenerationJobsTable.id, job.id));
        const claim = await generationStore.claim({
            context: context(3),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryGenerationFormat],
            workerId: 'stale-terminal-worker',
        });
        expect(claim?.id).toBe(job.id);
        await expect(
            generationStore.claim({
                context: context(1_004),
                globalConcurrency: 2,
                leaseDurationMs: 1_000,
                ownerConcurrency: 1,
                supportedFormats: [dictionaryGenerationFormat],
                workerId: 'recovery-worker',
            }),
        ).resolves.toBeNull();
        const [settled] = await database
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, job.id));
        expect(settled).toMatchObject({
            attemptCount: 1,
            executionState: 'failed',
            failureCategory: 'retry_exhausted',
            providerActualCostMicros: 50_000,
            providerActualInputTokens:
                defaultDictionaryGenerationProviderBudgetPolicy.maxInputTokensPerAttempt,
            providerActualOutputTokens:
                defaultDictionaryGenerationProviderBudgetPolicy.maxOutputTokensPerAttempt,
            providerReservationState: 'settled',
        });
    });

    it('enforces the multi-owner global provider reservation cap transactionally', async () => {
        const owners = [ownerId, randomUUID(), randomUUID(), randomUUID()];
        await database.insert(usersTable).values(
            owners.slice(1).map((id) => ({
                createdAt: instant(),
                id,
                status: 'active' as const,
                updatedAt: instant(),
            })),
        );
        const seeded = await Promise.all(
            owners.map((seedOwnerId) => seedCard(seedOwnerId)),
        );
        const jobs = [];
        let at = 2;
        for (const [index, countForOwner] of [3, 3, 3, 1].entries()) {
            for (let count = 0; count < countForOwner; count += 1) {
                jobs.push(
                    await enqueue(
                        seeded[index]!,
                        undefined,
                        fingerprint(String.fromCharCode(65 + at)),
                        at++,
                    ),
                );
            }
        }
        expect(jobs).toHaveLength(10);
        await expect(
            enqueue(seeded[3]!, undefined, fingerprint('Z'), at),
        ).rejects.toBeInstanceOf(DictionaryGenerationNotAvailableError);

        await generationStore.cancel({
            context: context(at + 1),
            jobId: jobs[0]!.id,
            ownerId: owners[0]!,
        });
        await expect(
            enqueue(seeded[3]!, undefined, fingerprint('Z'), at + 2),
        ).resolves.toMatchObject({ state: 'queued' });
    });

    it('admits exactly one concurrent reservation at the global rolling cost and token edge', async () => {
        const anchorSeeded = await seedCard();
        const anchor = await enqueue(
            anchorSeeded,
            undefined,
            fingerprint('V'),
            2,
        );
        await generationStore.cancel({
            context: context(3),
            jobId: anchor.id,
            ownerId,
        });
        await database
            .update(dictionaryGenerationJobsTable)
            .set({
                providerActualCostMicros: 950_000,
                providerActualInputTokens: 1_245_184,
                providerActualOutputTokens: 19_456,
                providerReservationSettledAt: instant(3),
                providerReservationState: 'settled',
            })
            .where(eq(dictionaryGenerationJobsTable.id, anchor.id));

        const contenders = [randomUUID(), randomUUID()];
        await database.insert(usersTable).values(
            contenders.map((id) => ({
                createdAt: instant(),
                id,
                status: 'active' as const,
                updatedAt: instant(),
            })),
        );
        const [firstSeeded, secondSeeded] = await Promise.all(
            contenders.map((contender) => seedCard(contender)),
        );
        const competingClient = createTestPostgresClient();
        const competingStore = new DrizzleDictionaryGenerationStore(
            createDrizzleDatabase(competingClient, databaseSchema),
            { generate: randomUUID },
        );
        try {
            const results = await Promise.allSettled([
                enqueue(firstSeeded!, undefined, fingerprint('W'), 4),
                enqueue(
                    secondSeeded!,
                    undefined,
                    fingerprint('X'),
                    4,
                    competingStore,
                ),
            ]);
            expect(
                results.filter((result) => result.status === 'fulfilled'),
            ).toHaveLength(1);
            const rejected = results.find(
                (result) => result.status === 'rejected',
            );
            expect(rejected).toMatchObject({
                reason: expect.any(DictionaryGenerationNotAvailableError),
                status: 'rejected',
            });
        } finally {
            await competingClient.end();
        }

        const admitted = await database
            .select()
            .from(dictionaryGenerationJobsTable);
        const active = admitted.filter(
            (job) => job.providerReservationState === 'active',
        );
        expect(active).toHaveLength(1);
        expect(
            admitted.reduce(
                (total, job) =>
                    total +
                    (job.providerReservationState === 'settled'
                        ? (job.providerActualCostMicros ?? 0)
                        : job.providerReservedCostMicros),
                0,
            ),
        ).toBe(1_000_000);
        expect(
            admitted.reduce(
                (total, job) =>
                    total +
                    (job.providerReservationState === 'settled'
                        ? (job.providerActualInputTokens ?? 0)
                        : job.providerReservedInputTokens),
                0,
            ),
        ).toBe(
            1_245_184 +
                defaultDictionaryGenerationProviderBudgetPolicy.maxInputTokensPerAttempt,
        );
        expect(
            admitted.reduce(
                (total, job) =>
                    total +
                    (job.providerReservationState === 'settled'
                        ? (job.providerActualOutputTokens ?? 0)
                        : job.providerReservedOutputTokens),
                0,
            ),
        ).toBe(
            19_456 +
                defaultDictionaryGenerationProviderBudgetPolicy.maxOutputTokensPerAttempt,
        );
    });

    it('enforces the owner rolling settled plus active cost and token edge', async () => {
        const seeded = await seedCard();
        const settled = await enqueue(seeded, undefined, fingerprint('Y'), 2);
        await generationStore.cancel({
            context: context(3),
            jobId: settled.id,
            ownerId,
        });
        await database
            .update(dictionaryGenerationJobsTable)
            .set({
                providerActualCostMicros: 100_000,
                providerActualInputTokens: 131_072,
                providerActualOutputTokens: 2_048,
                providerReservationSettledAt: instant(3),
                providerReservationState: 'settled',
            })
            .where(eq(dictionaryGenerationJobsTable.id, settled.id));

        await expect(
            enqueue(seeded, undefined, fingerprint('Z'), 4),
        ).resolves.toMatchObject({ state: 'queued' });
        await expect(
            enqueue(seeded, undefined, fingerprint('a'), 5),
        ).rejects.toBeInstanceOf(DictionaryGenerationNotAvailableError);
    });

    it('opens provider and spend circuits before another provider claim', async () => {
        const seeded = await seedCard();
        const waitingOwnerId = randomUUID();
        await database.insert(usersTable).values({
            createdAt: instant(),
            id: waitingOwnerId,
            status: 'active',
            updatedAt: instant(),
        });
        const waitingSeeded = await seedCard(waitingOwnerId);
        const failing = await enqueue(seeded, undefined, fingerprint('Q'), 2);
        const waiting = await enqueue(
            waitingSeeded,
            undefined,
            fingerprint('R'),
            3,
        );
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const at = 4 + attempt * 2;
            const claim = await generationStore.claim({
                context: context(at),
                globalConcurrency: 2,
                leaseDurationMs: 1_000,
                ownerConcurrency: 1,
                supportedFormats: [dictionaryGenerationFormat],
                workerId: 'circuit-worker',
            });
            expect(claim?.id).toBe(failing.id);
            await generationStore.fail({
                context: context(at + 1),
                failureCategory: 'provider_unavailable',
                fencingToken: claim!.fencingToken,
                jobId: claim!.id,
                leaseDeadline: claim!.leaseDeadline,
                retryAt: instant(at + 2),
                workerId: claim!.workerId,
            });
        }
        await expect(
            generationStore.claim({
                context: context(10),
                globalConcurrency: 2,
                leaseDurationMs: 1_000,
                ownerConcurrency: 1,
                supportedFormats: [dictionaryGenerationFormat],
                workerId: 'blocked-worker',
            }),
        ).resolves.toBeNull();
        await expect(
            enqueue(waitingSeeded, undefined, fingerprint('S'), 11),
        ).rejects.toBeInstanceOf(DictionaryGenerationNotAvailableError);
        const [circuit] = await database
            .select()
            .from(dictionaryGenerationProviderCircuitTable);
        expect(circuit).toMatchObject({
            consecutiveFailures: 3,
            openUntil: instant(60_009),
        });

        await database
            .update(dictionaryGenerationJobsTable)
            .set({ providerActualCostMicros: 1_000_000 })
            .where(eq(dictionaryGenerationJobsTable.id, failing.id));
        await expect(
            generationStore.claim({
                context: context(60_010),
                globalConcurrency: 2,
                leaseDurationMs: 1_000,
                ownerConcurrency: 1,
                supportedFormats: [dictionaryGenerationFormat],
                workerId: 'spend-blocked-worker',
            }),
        ).resolves.toBeNull();
        const [waitingRow] = await database
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, waiting.id));
        expect(waitingRow?.executionState).toBe('queued');
    });

    it('rejects new admission when the oldest runnable queue age circuit is open', async () => {
        const seeded = await seedCard();
        const old = await enqueue(seeded, undefined, fingerprint('T'), 2);
        await expect(
            enqueue(seeded, undefined, fingerprint('U'), 300_002),
        ).rejects.toBeInstanceOf(DictionaryGenerationNotAvailableError);

        await generationStore.cancel({
            context: context(300_003),
            jobId: old.id,
            ownerId,
        });
        await expect(
            enqueue(seeded, undefined, fingerprint('U'), 300_004),
        ).resolves.toMatchObject({ state: 'queued' });
    });

    it('keeps enqueue and acceptance retries fingerprint-stable after payload redaction', async () => {
        const seeded = await seedCard();
        const key = `generation-job-${randomUUID()}`;
        const job = await enqueue(seeded, key);
        const claim = await generationStore.claim({
            context: context(3),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryGenerationFormat],
            workerId: 'worker-a',
        });
        await generationStore.complete({
            context: context(4),
            fencingToken: claim!.fencingToken,
            jobId: job.id,
            leaseDeadline: claim!.leaseDeadline,
            proposal,
            reviewExpiresAt: instant(60_000),
            workerId: claim!.workerId,
        });
        const accepted = await generationStore.accept({
            candidate: proposal.candidate,
            candidateFingerprint: fingerprint('C'),
            context: context(5),
            jobId: job.id,
            ownerId,
        });
        expect(accepted.outcome).toMatchObject({
            cardId: seeded.created.card.id,
            cardVersion: 2,
        });
        await expect(
            generationStore.accept({
                candidate: proposal.candidate,
                candidateFingerprint: fingerprint('C'),
                context: context(6),
                jobId: job.id,
                ownerId,
            }),
        ).resolves.toEqual(accepted);
        await expect(
            generationStore.accept({
                candidate: proposal.candidate,
                candidateFingerprint: fingerprint('D'),
                context: context(7),
                jobId: job.id,
                ownerId,
            }),
        ).rejects.toBeInstanceOf(DictionaryGenerationCandidateConflictError);

        await expect(
            enqueue(seeded, key, fingerprint('B'), 8),
        ).resolves.toMatchObject({
            id: job.id,
            state: 'accepted',
        });
        await expect(
            enqueue(seeded, key, fingerprint('E'), 9),
        ).rejects.toBeInstanceOf(DictionaryIdempotencyConflictError);
    });

    it('rejects acceptance after the settings snapshot changes and keeps terminal actions idempotent', async () => {
        const seeded = await seedCard();
        const job = await enqueue(seeded);
        const claim = await generationStore.claim({
            context: context(3),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryGenerationFormat],
            workerId: 'worker-a',
        });
        await generationStore.complete({
            context: context(4),
            fencingToken: claim!.fencingToken,
            jobId: job.id,
            leaseDeadline: claim!.leaseDeadline,
            proposal,
            reviewExpiresAt: instant(60_000),
            workerId: claim!.workerId,
        });
        await dictionaryStore.updateDictionary({
            context: context(5),
            dictionaryId: seeded.dictionary.id,
            ownerId,
            request: {
                expectedDictionaryVersion: seeded.created.dictionaryVersion,
                expectedSettingsVersion: seeded.dictionary.settings.version,
                settings: { definitionEnabled: true },
            },
        });
        await expect(
            generationStore.accept({
                candidate: proposal.candidate,
                candidateFingerprint: fingerprint('C'),
                context: context(6),
                jobId: job.id,
                ownerId,
            }),
        ).rejects.toBeInstanceOf(DictionaryVersionConflictError);

        const discarded = await generationStore.discard({
            context: context(7),
            jobId: job.id,
            ownerId,
        });
        await expect(
            generationStore.discard({
                context: context(8),
                jobId: job.id,
                ownerId,
            }),
        ).resolves.toEqual(discarded);
        expect(discarded).toMatchObject({
            originalSnapshot: null,
            proposal: null,
            state: 'discarded',
        });
    });

    it('makes cancellation replay-safe and redacts cancelled and expired payloads', async () => {
        const seeded = await seedCard();
        const cancelledJob = await enqueue(seeded);
        const requested = await generationStore.cancel({
            context: context(3),
            jobId: cancelledJob.id,
            ownerId,
        });
        await expect(
            generationStore.cancel({
                context: context(4),
                jobId: cancelledJob.id,
                ownerId,
            }),
        ).resolves.toEqual(requested);
        expect(requested).toMatchObject({
            cancellationRequested: true,
            originalSnapshot: null,
            state: 'cancelled',
        });
        const cancelled = await generationStore.cancel({
            context: context(5),
            jobId: cancelledJob.id,
            ownerId,
        });
        expect(cancelled).toMatchObject({
            originalSnapshot: null,
            proposal: null,
            state: 'cancelled',
        });

        const expiringJob = await enqueue(
            seeded,
            `generation-job-${randomUUID()}`,
            fingerprint('F'),
            7,
        );
        const claim = await generationStore.claim({
            context: context(8),
            globalConcurrency: 2,
            leaseDurationMs: 1_000,
            ownerConcurrency: 1,
            supportedFormats: [dictionaryGenerationFormat],
            workerId: 'worker-a',
        });
        await generationStore.complete({
            context: context(9),
            fencingToken: claim!.fencingToken,
            jobId: expiringJob.id,
            leaseDeadline: claim!.leaseDeadline,
            proposal,
            reviewExpiresAt: instant(20),
            workerId: claim!.workerId,
        });
        await expect(
            generationStore.read({
                context: context(21),
                jobId: expiringJob.id,
                ownerId,
            }),
        ).resolves.toMatchObject({
            originalSnapshot: null,
            proposal: null,
            state: 'expired',
        });
        await expect(
            generationStore.expireReviewPayloads({
                context: context(22),
                limit: 100,
            }),
        ).resolves.toBe(0);
        const [redacted] = await database
            .select({ input: dictionaryGenerationJobsTable.inputPayload })
            .from(dictionaryGenerationJobsTable)
            .where(eq(dictionaryGenerationJobsTable.id, expiringJob.id));
        expect(redacted?.input).toBeNull();
    });
});
