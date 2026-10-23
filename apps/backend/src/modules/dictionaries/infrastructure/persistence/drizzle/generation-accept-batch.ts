import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import {
    DictionaryImportPairsGenerationAcceptedOutcomeSchema,
    DictionaryPastedTermsGenerationAcceptedOutcomeSchema,
} from '@languon/contracts';
import { and, asc, count, eq, sql } from 'drizzle-orm';
import {
    DictionaryGenerationCandidateConflictError,
    DictionaryGenerationJobNotFoundError,
    DictionaryGenerationNotReviewableError,
    DictionaryGenerationProposalExpiredError,
    DictionaryVersionConflictError,
} from '../../../application/dictionary-errors';
import type { DictionaryGenerationStore } from '../../../application/ports/dictionary-generation-store';
import { areCardSemanticStatesEqual } from '../../../domain/authorship';
import {
    createDictionaryBatchDuplicateWarnings,
    parseDictionaryImportPairsGenerationProposal,
    parseDictionaryBatchGenerationProposal,
} from '../../../domain/batch-generation';
import { parseDictionaryGenerationProposal } from '../../../domain/generation';
import {
    assertDictionaryOwnerCapacity,
    dictionaryLimits,
    normalizeCardValues,
    normalizeDictionaryCardSourceForSearch,
} from '../../../domain/limits';
import {
    assertDictionaryCardCapacity,
    dictionaryCardSortGap,
} from '../../../domain/ordering';
import { assertCardSettingsOverrideTransition } from '../../../domain/settings';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    dictionariesTable,
    dictionaryCardRevisionsTable,
    dictionaryCardsTable,
    dictionaryGenerationJobsTable,
    dictionaryGenerationProposalsTable,
    dictionarySettingsTable,
} from './schema';
import type { GenerationStoreContext } from './generation-context';
import { abort } from './generation-context';
import {
    lockOwnedJob,
    lockProposal,
    readView,
    expireProposal,
} from './generation-job-access';
import {
    domainOverrides,
    domainSettings,
    revisionSnapshot,
} from './generation-card-snapshots';

export async function acceptBatch(
    context: GenerationStoreContext,
    input: Parameters<DictionaryGenerationStore['acceptBatch']>[0],
) {
    const selected = [...input.selected].sort(
        (left, right) => left.rowIndex - right.rowIndex,
    );
    const result = await modelPricingTransaction(
        context.database,
        async (tx) => {
            abort(input.context);
            await lockTextAiCapacity(tx);
            await tx
                .select({ id: usersTable.id })
                .from(usersTable)
                .where(eq(usersTable.id, input.ownerId))
                .for('update');

            abort(input.context);
            const job = await lockOwnedJob(tx, input.ownerId, input.jobId);
            if (
                job.kind !== 'pasted-terms' &&
                job.kind !== 'document-terms' &&
                job.kind !== 'import-pairs'
            )
                throw new DictionaryGenerationNotReviewableError();
            const proposal = await lockProposal(tx, job.id);
            if (!proposal) throw new DictionaryGenerationNotReviewableError();
            if (proposal.reviewState === 'accepted') {
                if (
                    proposal.acceptedCandidateFingerprint !==
                    input.acceptanceFingerprint
                )
                    throw new DictionaryGenerationCandidateConflictError();
                const acceptedJob = await readView(tx, job, input.context.now);
                if (
                    ![
                        'pasted-terms',
                        'document-terms',
                        'import-pairs',
                    ].includes(acceptedJob.kind) ||
                    !acceptedJob.outcome ||
                    !('cards' in acceptedJob.outcome)
                )
                    throw new DictionaryGenerationCandidateConflictError();

                return {
                    expired: false as const,
                    value: {
                        job: acceptedJob,
                        outcome: acceptedJob.outcome,
                    },
                };
            }

            if (proposal.reviewState === 'expired')
                return { expired: true as const };
            if (proposal.reviewState !== 'reviewable' || !proposal.payload)
                throw new DictionaryGenerationNotReviewableError();
            if (proposal.documentStagedAt && !proposal.documentPublishedAt)
                throw new DictionaryGenerationNotReviewableError();
            if (proposal.expiresAt <= input.context.now) {
                await expireProposal(tx, job.id, input.context.now);

                return { expired: true as const };
            }

            const storedProposal =
                job.kind === 'import-pairs'
                    ? parseDictionaryImportPairsGenerationProposal(
                          proposal.payload,
                      )
                    : parseDictionaryBatchGenerationProposal(proposal.payload);
            const storedCandidates = new Map(
                storedProposal.candidates.map((candidate) => [
                    candidate.rowIndex,
                    candidate,
                ]),
            );
            const acceptedCandidates = selected.map((selection) => {
                const stored = storedCandidates.get(selection.rowIndex);
                if (!stored)
                    throw new DictionaryGenerationCandidateConflictError();
                const candidate = parseDictionaryGenerationProposal({
                    candidate: selection.candidate,
                    fieldFeedback: stored.fieldFeedback,
                    warnings: [],
                }).candidate;
                const candidateOverrides = domainOverrides(candidate.overrides);
                const candidateValues = normalizeCardValues(candidate.values);
                const proposalEdited = !areCardSemanticStatesEqual(
                    {
                        overrides: domainOverrides(stored.candidate.overrides),
                        values: stored.candidate.values,
                    },
                    {
                        overrides: candidateOverrides,
                        values: candidateValues,
                    },
                );

                return {
                    authorship:
                        job.kind === 'import-pairs' || proposalEdited
                            ? ('mixed' as const)
                            : ('ai-generated' as const),
                    overrides: candidateOverrides,
                    rowIndex: selection.rowIndex,
                    values: candidateValues,
                };
            });

            const [current] = await tx
                .select({
                    dictionary: dictionariesTable,
                    settings: dictionarySettingsTable,
                })
                .from(dictionariesTable)
                .innerJoin(
                    dictionarySettingsTable,
                    eq(
                        dictionarySettingsTable.dictionaryId,
                        dictionariesTable.id,
                    ),
                )
                .where(
                    and(
                        eq(dictionariesTable.id, job.dictionaryId),
                        eq(dictionariesTable.ownerId, input.ownerId),
                    ),
                )
                .for('update');

            if (!current) throw new DictionaryGenerationJobNotFoundError();
            if (
                current.dictionary.lifecycle !== 'active' ||
                current.dictionary.version !== job.expectedDictionaryVersion ||
                current.settings.version !== job.expectedSettingsVersion ||
                current.dictionary.sourceLanguageTag !==
                    job.sourceLanguageTag ||
                current.dictionary.targetLanguageTag !== job.targetLanguageTag
            )
                throw new DictionaryVersionConflictError();
            for (const candidate of acceptedCandidates) {
                assertCardSettingsOverrideTransition({
                    dictionary: domainSettings(current.settings),
                    next: candidate.overrides,
                    previous: null,
                });
            }

            const [dictionaryCardState] = await tx
                .select({
                    active: sql<number>`count(*) filter (where ${dictionaryCardsTable.lifecycle} = 'active')`,
                    maximumSortKey: sql<
                        string | null
                    >`(max(${dictionaryCardsTable.sortKey}) filter (where ${dictionaryCardsTable.lifecycle} = 'active'))::text`,
                })
                .from(dictionaryCardsTable)
                .where(eq(dictionaryCardsTable.dictionaryId, job.dictionaryId));
            const existingSources = await tx
                .select({
                    cardId: dictionaryCardsTable.id,
                    source: dictionaryCardsTable.source,
                })
                .from(dictionaryCardsTable)
                .where(eq(dictionaryCardsTable.dictionaryId, job.dictionaryId))
                .orderBy(
                    asc(dictionaryCardsTable.createdAt),
                    asc(dictionaryCardsTable.id),
                );
            const acceptanceWarnings = createDictionaryBatchDuplicateWarnings(
                acceptedCandidates.map((candidate) => ({
                    input: candidate.values.source,
                    rowIndex: candidate.rowIndex,
                })),
                existingSources,
            );

            assertDictionaryCardCapacity(
                Number(dictionaryCardState?.active ?? 0) +
                    acceptedCandidates.length,
            );

            const [ownerCardCount] = await tx
                .select({ value: count() })
                .from(dictionaryCardsTable)
                .innerJoin(
                    dictionariesTable,
                    eq(dictionaryCardsTable.dictionaryId, dictionariesTable.id),
                )
                .where(eq(dictionariesTable.ownerId, input.ownerId));
            const [ownerDictionaryCount] = await tx
                .select({ value: count() })
                .from(dictionariesTable)
                .where(eq(dictionariesTable.ownerId, input.ownerId));
            const [ownerRevisionCount] = await tx
                .select({ value: count() })
                .from(dictionaryCardRevisionsTable)
                .innerJoin(
                    dictionariesTable,
                    eq(
                        dictionaryCardRevisionsTable.dictionaryId,
                        dictionariesTable.id,
                    ),
                )
                .where(eq(dictionariesTable.ownerId, input.ownerId));

            assertDictionaryOwnerCapacity(
                {
                    cards: Number(ownerCardCount?.value ?? 0),
                    dictionaries: Number(ownerDictionaryCount?.value ?? 0),
                    revisions: Number(ownerRevisionCount?.value ?? 0),
                },
                {
                    cards: acceptedCandidates.length,
                    dictionaries: 0,
                    revisions: acceptedCandidates.length,
                },
                dictionaryLimits,
            );

            abort(input.context);

            const maximumSortKey = BigInt(
                dictionaryCardState?.maximumSortKey ?? 0,
            );
            const cardInserts = acceptedCandidates.map((candidate, index) => ({
                authorship: candidate.authorship,
                createdAt: input.context.now,
                customNotationLabelOverride:
                    candidate.overrides.customNotationLabel,
                definition: candidate.values.definition,
                definitionEnabledOverride:
                    candidate.overrides.definitionEnabled,
                definitionLanguageRoleOverride:
                    candidate.overrides.definitionLanguageRole,
                dictionaryId: job.dictionaryId,
                example: candidate.values.example,
                exampleEnabledOverride: candidate.overrides.exampleEnabled,
                exampleLanguageRoleOverride:
                    candidate.overrides.exampleLanguageRole,
                exampleTranslation: candidate.values.exampleTranslation,
                exampleTranslationEnabledOverride:
                    candidate.overrides.exampleTranslationEnabled,
                id: context.ids.generate(),
                lifecycle: 'active' as const,
                normalizedSource: normalizeDictionaryCardSourceForSearch(
                    candidate.values.source,
                ),
                sortKey:
                    maximumSortKey + BigInt(index + 1) * dictionaryCardSortGap,
                source: candidate.values.source,
                transcription: candidate.values.transcription,
                transcriptionEnabledOverride:
                    candidate.overrides.transcriptionEnabled,
                transcriptionNotationOverride:
                    candidate.overrides.transcriptionNotation,
                translation: candidate.values.translation,
                updatedAt: input.context.now,
            }));
            const insertedCards = await tx
                .insert(dictionaryCardsTable)
                .values(cardInserts)
                .returning();

            if (insertedCards.length !== acceptedCandidates.length)
                throw new DictionaryVersionConflictError();
            const cardsById = new Map(
                insertedCards.map((card) => [card.id, card]),
            );
            const orderedCards = cardInserts.map((insert) => {
                const card = cardsById.get(insert.id);
                if (!card) throw new DictionaryVersionConflictError();

                return card;
            });

            await tx.insert(dictionaryCardRevisionsTable).values(
                orderedCards.map((card) => ({
                    acceptedGenerationJobId: job.id,
                    actorUserId: input.ownerId,
                    authorship: card.authorship,
                    cardId: card.id,
                    cardVersion: card.version,
                    createdAt: input.context.now,
                    dictionaryId: card.dictionaryId,
                    id: context.ids.generate(),
                    mutationKind: 'ai_proposal_accept' as const,
                    revisionNumber: card.version,
                    schemaVersion: 2,
                    settingsVersion: current.settings.version,
                    snapshot: revisionSnapshot(
                        card,
                        current.settings,
                        current.dictionary.translationContext,
                    ),
                })),
            );

            const [updatedDictionary] = await tx
                .update(dictionariesTable)
                .set({
                    updatedAt: input.context.now,
                    version: current.dictionary.version + 1,
                })
                .where(
                    and(
                        eq(dictionariesTable.id, current.dictionary.id),
                        eq(
                            dictionariesTable.version,
                            current.dictionary.version,
                        ),
                    ),
                )
                .returning({ version: dictionariesTable.version });

            if (!updatedDictionary) throw new DictionaryVersionConflictError();
            const outcome =
                job.kind === 'import-pairs'
                    ? DictionaryImportPairsGenerationAcceptedOutcomeSchema.parse(
                          {
                              authorship: 'mixed',
                              cards: orderedCards.map((card, index) => ({
                                  cardId: card.id,
                                  cardVersion: card.version,
                                  rowIndex: acceptedCandidates[index]!.rowIndex,
                              })),
                              dictionaryVersion: updatedDictionary.version,
                              warnings: acceptanceWarnings,
                          },
                      )
                    : DictionaryPastedTermsGenerationAcceptedOutcomeSchema.parse(
                          {
                              cards: orderedCards.map((card, index) => ({
                                  cardId: card.id,
                                  cardVersion: card.version,
                                  rowIndex: acceptedCandidates[index]!.rowIndex,
                              })),
                              dictionaryVersion: updatedDictionary.version,
                              warnings: acceptanceWarnings,
                          },
                      );

            await tx
                .update(dictionaryGenerationProposalsTable)
                .set({
                    acceptedBatchOutcome: outcome,
                    acceptedCandidateFingerprint: input.acceptanceFingerprint,
                    payload: null,
                    reviewState: 'accepted',
                    terminalAt: input.context.now,
                    updatedAt: input.context.now,
                })
                .where(eq(dictionaryGenerationProposalsTable.jobId, job.id));

            await tx
                .update(dictionaryGenerationJobsTable)
                .set({ inputPayload: null, updatedAt: input.context.now })
                .where(eq(dictionaryGenerationJobsTable.id, job.id));

            const acceptedJob = await readView(tx, job, input.context.now);
            if (
                !['pasted-terms', 'document-terms', 'import-pairs'].includes(
                    acceptedJob.kind,
                ) ||
                !acceptedJob.outcome ||
                !('cards' in acceptedJob.outcome)
            )
                throw new DictionaryGenerationCandidateConflictError();

            return {
                expired: false as const,
                value: { job: acceptedJob, outcome: acceptedJob.outcome },
            };
        },
    );

    if (result.expired) throw new DictionaryGenerationProposalExpiredError();

    return result.value;
}
