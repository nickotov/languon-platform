import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import {
    dictionaryCardAuthoringGenerationFormat,
    dictionaryCardAuthoringGenerationFormatV1,
} from '../../../domain/card-authoring';
import { and, count, eq, sql } from 'drizzle-orm';
import {
    DictionaryCardNotFoundError,
    DictionaryGenerationCandidateConflictError,
    DictionaryGenerationJobNotFoundError,
    DictionaryGenerationNotReviewableError,
    DictionaryGenerationProposalExpiredError,
    DictionaryVersionConflictError,
} from '../../../application/dictionary-errors';
import type { DictionaryGenerationStore } from '../../../application/ports/dictionary-generation-store';
import {
    areCardSemanticStatesEqual,
    resolveCardMutationAuthorship,
} from '../../../domain/authorship';
import { resolveTranslationContext } from '../../../domain/translation-context';
import { hasLearningContentChanged } from '../../../domain/learning-content';
import {
    assertDictionaryOwnerCapacity,
    dictionaryLimits,
    normalizeDictionaryCardSourceForSearch,
} from '../../../domain/limits';
import {
    assertDictionaryCardCapacity,
    dictionaryCardSortGap,
} from '../../../domain/ordering';
import {
    assertCardSettingsOverrideTransition,
    resolveCardSettings,
} from '../../../domain/settings';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    dictionariesTable,
    dictionaryCardRevisionsTable,
    dictionaryCardsTable,
    dictionaryGenerationJobsTable,
    dictionaryGenerationProposalsTable,
    dictionarySettingsTable,
} from './schema';
import type { GenerationStoreContext, CardRow } from './generation-context';
import { abort } from './generation-context';
import {
    lockOwnedJob,
    lockProposal,
    readView,
    expireProposal,
} from './generation-job-access';
import { validateAuthoringAcceptance } from './generation-authoring-acceptance';
import {
    domainOverrides,
    domainSettings,
    wireOverrides,
    values,
    revisionSnapshot,
} from './generation-card-snapshots';

export async function acceptCardAuthoring(
    context: GenerationStoreContext,
    input: Parameters<DictionaryGenerationStore['acceptCardAuthoring']>[0],
) {
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

            const job = await lockOwnedJob(tx, input.ownerId, input.jobId);
            if (job.kind !== 'card-authoring')
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
                    acceptedJob.kind !== 'card-authoring' ||
                    !acceptedJob.outcome
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
            if (proposal.expiresAt <= input.context.now) {
                await expireProposal(tx, job.id, input.context.now);

                return { expired: true as const };
            }

            const {
                jobInput,
                candidateValues,
                candidateTranslationContext,
                aiAssisted,
            } = validateAuthoringAcceptance(job, proposal, input);

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
            const candidateOverrides = domainOverrides(
                input.candidate.overrides,
            );
            const target =
                jobInput.format === dictionaryCardAuthoringGenerationFormatV1
                    ? ({ kind: 'create' } as const)
                    : jobInput.target;
            let targetCard: CardRow | null = null;
            if (target.kind === 'update') {
                const [lockedCard] = await tx
                    .select()
                    .from(dictionaryCardsTable)
                    .where(
                        and(
                            eq(dictionaryCardsTable.id, target.cardId),
                            eq(
                                dictionaryCardsTable.dictionaryId,
                                job.dictionaryId,
                            ),
                            eq(dictionaryCardsTable.lifecycle, 'active'),
                        ),
                    )
                    .limit(1)
                    .for('update');

                if (!lockedCard) throw new DictionaryCardNotFoundError();
                if (lockedCard.version !== target.expectedCardVersion)
                    throw new DictionaryVersionConflictError();
                targetCard = lockedCard;
            }

            const rawTranslationContext =
                jobInput.format === dictionaryCardAuthoringGenerationFormat
                    ? candidateTranslationContext!
                    : (targetCard?.translationContext ?? null);

            if (
                jobInput.format === dictionaryCardAuthoringGenerationFormat &&
                resolveTranslationContext({
                    card: rawTranslationContext,
                    dictionary: current.dictionary.translationContext,
                }) !== jobInput.translationContext
            )
                throw new DictionaryGenerationCandidateConflictError();
            assertCardSettingsOverrideTransition({
                dictionary: domainSettings(current.settings),
                next: candidateOverrides,
                previous: targetCard
                    ? domainOverrides(wireOverrides(targetCard))
                    : null,
            });

            const [cardState] = await tx
                .select({
                    active: sql<number>`count(*) filter (where ${dictionaryCardsTable.lifecycle} = 'active')`,
                    maximumSortKey: sql<
                        string | null
                    >`(max(${dictionaryCardsTable.sortKey}) filter (where ${dictionaryCardsTable.lifecycle} = 'active'))::text`,
                })
                .from(dictionaryCardsTable)
                .where(eq(dictionaryCardsTable.dictionaryId, job.dictionaryId));

            if (!targetCard)
                assertDictionaryCardCapacity(
                    Number(cardState?.active ?? 0) + 1,
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
                    cards: targetCard ? 0 : 1,
                    dictionaries: 0,
                    revisions: 1,
                },
                dictionaryLimits,
            );

            const [duplicateSourceMatch] = await tx
                .select({ id: dictionaryCardsTable.id })
                .from(dictionaryCardsTable)
                .where(
                    and(
                        eq(dictionaryCardsTable.dictionaryId, job.dictionaryId),
                        eq(
                            dictionaryCardsTable.normalizedSource,
                            normalizeDictionaryCardSourceForSearch(
                                candidateValues.source,
                            ),
                        ),
                        ...(targetCard
                            ? [
                                  sql`${dictionaryCardsTable.id} <> ${targetCard.id}`,
                              ]
                            : []),
                    ),
                )
                .limit(1);
            const duplicateSource = Boolean(duplicateSourceMatch);
            abort(input.context);

            const authorship = targetCard
                ? resolveCardMutationAuthorship({
                      mutationKind: 'ai_proposal_accept',
                      prior: targetCard.authorship,
                      proposalEdited: true,
                      semanticChange:
                          targetCard.translationContext !==
                              rawTranslationContext ||
                          !areCardSemanticStatesEqual(
                              {
                                  overrides: domainOverrides(
                                      wireOverrides(targetCard),
                                  ),
                                  values: values(targetCard),
                              },
                              {
                                  overrides: candidateOverrides,
                                  values: candidateValues,
                              },
                          ),
                  }).authorship
                : aiAssisted
                  ? 'mixed'
                  : 'human';
            const cardId = targetCard?.id ?? context.ids.generate();
            const cardValues = {
                authorship,
                createdAt: input.context.now,
                customNotationLabelOverride:
                    candidateOverrides.customNotationLabel,
                definition: candidateValues.definition,
                definitionEnabledOverride: candidateOverrides.definitionEnabled,
                definitionLanguageRoleOverride:
                    candidateOverrides.definitionLanguageRole,
                dictionaryId: job.dictionaryId,
                example: candidateValues.example,
                exampleEnabledOverride: candidateOverrides.exampleEnabled,
                exampleLanguageRoleOverride:
                    candidateOverrides.exampleLanguageRole,
                exampleTranslation: candidateValues.exampleTranslation,
                exampleTranslationEnabledOverride:
                    candidateOverrides.exampleTranslationEnabled,
                lifecycle: 'active' as const,
                normalizedSource: normalizeDictionaryCardSourceForSearch(
                    candidateValues.source,
                ),
                sortKey:
                    targetCard?.sortKey ??
                    BigInt(cardState?.maximumSortKey ?? 0) +
                        dictionaryCardSortGap,
                source: candidateValues.source,
                transcription: candidateValues.transcription,
                transcriptionEnabledOverride:
                    candidateOverrides.transcriptionEnabled,
                transcriptionNotationOverride:
                    candidateOverrides.transcriptionNotation,
                translation: candidateValues.translation,
                translationContext: rawTranslationContext,
                updatedAt: input.context.now,
            };
            const [card] = targetCard
                ? await tx
                      .update(dictionaryCardsTable)
                      .set({
                          ...cardValues,
                          createdAt: targetCard.createdAt,
                          learningVersion:
                              targetCard.learningVersion +
                              Number(
                                  hasLearningContentChanged({
                                      previous: {
                                          values: values(targetCard),
                                          settings: resolveCardSettings({
                                              dictionary: domainSettings(
                                                  current.settings,
                                              ),
                                              overrides: domainOverrides(
                                                  wireOverrides(targetCard),
                                              ),
                                          }),
                                      },
                                      next: {
                                          values: candidateValues,
                                          settings: resolveCardSettings({
                                              dictionary: domainSettings(
                                                  current.settings,
                                              ),
                                              overrides: candidateOverrides,
                                          }),
                                      },
                                  }),
                              ),
                          version: targetCard.version + 1,
                      })
                      .where(
                          and(
                              eq(dictionaryCardsTable.id, targetCard.id),
                              eq(
                                  dictionaryCardsTable.version,
                                  targetCard.version,
                              ),
                          ),
                      )
                      .returning()
                : await tx
                      .insert(dictionaryCardsTable)
                      .values({ ...cardValues, id: cardId })
                      .returning();

            if (!card) throw new DictionaryVersionConflictError();
            const revisionId = context.ids.generate();
            await tx.insert(dictionaryCardRevisionsTable).values({
                acceptedGenerationJobId: job.id,
                actorUserId: input.ownerId,
                authorship: card.authorship,
                cardId: card.id,
                cardVersion: card.version,
                createdAt: input.context.now,
                dictionaryId: card.dictionaryId,
                id: revisionId,
                mutationKind: targetCard
                    ? 'ai_proposal_accept'
                    : aiAssisted
                      ? 'ai_proposal_accept'
                      : 'manual_create',
                revisionNumber: card.version,
                schemaVersion: 2,
                settingsVersion: current.settings.version,
                snapshot: revisionSnapshot(
                    card,
                    current.settings,
                    current.dictionary.translationContext,
                ),
            });

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

            await tx
                .update(dictionaryGenerationProposalsTable)
                .set({
                    acceptedCandidateFingerprint: input.acceptanceFingerprint,
                    acceptedCardId: card.id,
                    acceptedCardVersion: card.version,
                    acceptedDictionaryVersion: updatedDictionary.version,
                    acceptedDuplicateSource: duplicateSource,
                    acceptedRevisionId: revisionId,
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
            if (acceptedJob.kind !== 'card-authoring' || !acceptedJob.outcome)
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
