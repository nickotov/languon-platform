import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { and, count, eq } from 'drizzle-orm';
import {
    DictionaryGenerationCandidateConflictError,
    DictionaryGenerationNotAvailableError,
    DictionaryGenerationNotReviewableError,
    DictionaryGenerationProposalExpiredError,
    DictionaryVersionConflictError,
} from '../../../application/dictionary-errors';
import type { DictionaryGenerationStore } from '../../../application/ports/dictionary-generation-store';
import {
    areCardSemanticStatesEqual,
    resolveCardMutationAuthorship,
} from '../../../domain/authorship';
import { parseDictionaryGenerationProposal } from '../../../domain/generation';
import { hasLearningContentChanged } from '../../../domain/learning-content';
import {
    normalizeCardValues,
    normalizeDictionaryCardSourceForSearch,
} from '../../../domain/limits';
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
} from './schema';
import type { GenerationStoreContext } from './generation-context';
import { abort } from './generation-context';
import {
    lockOwnedJob,
    lockProposal,
    readView,
    expireProposal,
    lockCardSnapshot,
} from './generation-job-access';
import {
    domainOverrides,
    domainSettings,
    wireOverrides,
    values,
    revisionSnapshot,
} from './generation-card-snapshots';

export async function acceptSingleCard(
    context: GenerationStoreContext,
    input: Parameters<DictionaryGenerationStore['acceptSingleCard']>[0],
) {
    const result = await modelPricingTransaction(
        context.database,
        async (tx) => {
            abort(input.context);
            await lockTextAiCapacity(tx);
            abort(input.context);
            await tx
                .select({ id: usersTable.id })
                .from(usersTable)
                .where(eq(usersTable.id, input.ownerId))
                .for('update');

            abort(input.context);
            const job = await lockOwnedJob(tx, input.ownerId, input.jobId);
            if (job.kind !== 'single-card')
                throw new DictionaryGenerationNotReviewableError();
            const proposal = await lockProposal(tx, job.id);
            abort(input.context);
            if (!proposal) throw new DictionaryGenerationNotReviewableError();
            if (proposal.reviewState === 'accepted') {
                if (
                    proposal.acceptedCandidateFingerprint !==
                    input.candidateFingerprint
                )
                    throw new DictionaryGenerationCandidateConflictError();
                const acceptedJob = await readView(tx, job, input.context.now);
                if (acceptedJob.kind !== 'single-card' || !acceptedJob.outcome)
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

            const storedProposal = parseDictionaryGenerationProposal(
                proposal.payload,
            );
            const candidate = parseDictionaryGenerationProposal({
                ...storedProposal,
                candidate: input.candidate,
            }).candidate;
            const current = await lockCardSnapshot(tx, job);
            abort(input.context);
            if (
                current.dictionary.lifecycle !== 'active' ||
                current.card.lifecycle !== 'active' ||
                current.dictionary.version !== job.expectedDictionaryVersion ||
                current.settings.version !== job.expectedSettingsVersion ||
                current.card.version !== job.expectedCardVersion ||
                current.dictionary.sourceLanguageTag !==
                    job.sourceLanguageTag ||
                current.dictionary.targetLanguageTag !== job.targetLanguageTag
            )
                throw new DictionaryVersionConflictError();

            const candidateOverrides = domainOverrides(candidate.overrides);
            assertCardSettingsOverrideTransition({
                dictionary: domainSettings(current.settings),
                next: candidateOverrides,
                previous: domainOverrides(wireOverrides(current.card)),
            });

            const candidateValues = normalizeCardValues(candidate.values);
            const semanticChange = !areCardSemanticStatesEqual(
                {
                    overrides: domainOverrides(wireOverrides(current.card)),
                    values: values(current.card),
                },
                { overrides: candidateOverrides, values: candidateValues },
            );
            const proposalEdited = !areCardSemanticStatesEqual(
                {
                    overrides: domainOverrides(
                        storedProposal.candidate.overrides,
                    ),
                    values: storedProposal.candidate.values,
                },
                { overrides: candidateOverrides, values: candidateValues },
            );
            const authorship = resolveCardMutationAuthorship({
                mutationKind: 'ai_proposal_accept',
                prior: current.card.authorship,
                proposalEdited,
                semanticChange,
            }).authorship;

            let card = current.card;
            let dictionaryVersion = current.dictionary.version;
            let revisionId: string;
            if (semanticChange) {
                const [ownerRevisionCount] = await tx
                    .select({ value: count() })
                    .from(dictionaryCardRevisionsTable)
                    .innerJoin(
                        dictionariesTable,
                        eq(
                            dictionariesTable.id,
                            dictionaryCardRevisionsTable.dictionaryId,
                        ),
                    )
                    .where(eq(dictionariesTable.ownerId, input.ownerId));

                if (Number(ownerRevisionCount?.value ?? 0) >= 250_000)
                    throw new DictionaryGenerationNotAvailableError();
                abort(input.context);
                const [updatedCard] = await tx
                    .update(dictionaryCardsTable)
                    .set({
                        authorship,
                        customNotationLabelOverride:
                            candidateOverrides.customNotationLabel,
                        definition: candidateValues.definition,
                        definitionEnabledOverride:
                            candidateOverrides.definitionEnabled,
                        definitionLanguageRoleOverride:
                            candidateOverrides.definitionLanguageRole,
                        example: candidateValues.example,
                        exampleEnabledOverride:
                            candidateOverrides.exampleEnabled,
                        exampleLanguageRoleOverride:
                            candidateOverrides.exampleLanguageRole,
                        exampleTranslation: candidateValues.exampleTranslation,
                        exampleTranslationEnabledOverride:
                            candidateOverrides.exampleTranslationEnabled,
                        normalizedSource:
                            normalizeDictionaryCardSourceForSearch(
                                candidateValues.source,
                            ),
                        source: candidateValues.source,
                        transcription: candidateValues.transcription,
                        transcriptionEnabledOverride:
                            candidateOverrides.transcriptionEnabled,
                        transcriptionNotationOverride:
                            candidateOverrides.transcriptionNotation,
                        translation: candidateValues.translation,
                        learningVersion:
                            current.card.learningVersion +
                            Number(
                                hasLearningContentChanged({
                                    previous: {
                                        values: values(current.card),
                                        settings: resolveCardSettings({
                                            dictionary: domainSettings(
                                                current.settings,
                                            ),
                                            overrides: domainOverrides(
                                                wireOverrides(current.card),
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
                        updatedAt: input.context.now,
                        version: current.card.version + 1,
                    })
                    .where(
                        and(
                            eq(dictionaryCardsTable.id, current.card.id),
                            eq(
                                dictionaryCardsTable.version,
                                current.card.version,
                            ),
                        ),
                    )
                    .returning();

                if (!updatedCard) throw new DictionaryVersionConflictError();
                card = updatedCard;
                revisionId = context.ids.generate();
                await tx.insert(dictionaryCardRevisionsTable).values({
                    acceptedGenerationJobId: job.id,
                    actorUserId: input.ownerId,
                    authorship: card.authorship,
                    cardId: card.id,
                    cardVersion: card.version,
                    createdAt: input.context.now,
                    dictionaryId: card.dictionaryId,
                    id: revisionId,
                    mutationKind: 'ai_proposal_accept',
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

                if (!updatedDictionary)
                    throw new DictionaryVersionConflictError();
                dictionaryVersion = updatedDictionary.version;
            } else {
                const [currentRevision] = await tx
                    .select({ id: dictionaryCardRevisionsTable.id })
                    .from(dictionaryCardRevisionsTable)
                    .where(
                        and(
                            eq(
                                dictionaryCardRevisionsTable.cardId,
                                current.card.id,
                            ),
                            eq(
                                dictionaryCardRevisionsTable.cardVersion,
                                current.card.version,
                            ),
                        ),
                    )
                    .limit(1);

                if (!currentRevision)
                    throw new DictionaryGenerationCandidateConflictError();
                revisionId = currentRevision.id;
            }

            abort(input.context);
            await tx
                .update(dictionaryGenerationProposalsTable)
                .set({
                    acceptedCandidateFingerprint: input.candidateFingerprint,
                    acceptedCardVersion: card.version,
                    acceptedDictionaryVersion: dictionaryVersion,
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
            if (acceptedJob.kind !== 'single-card' || !acceptedJob.outcome)
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
