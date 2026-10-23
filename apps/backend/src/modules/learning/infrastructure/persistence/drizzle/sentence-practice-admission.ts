import type {
    SentenceDirection,
    SentencePrepareRequest,
} from '@languon/contracts';
import { DictionaryLanguageTagSchema } from '@languon/contracts';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
    readTextAiCapacity,
    textAiProviderBudgetAllows,
} from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { ProviderCostAdmissionUnavailableError } from '../../../../ai-credits/domain/provider-cost-admission';
import { OperatorBudgetUnavailableError } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-operator-budget-participant';
import { prepareLegacyAction } from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import { TextAiSelectionUnavailableError } from '../../../../text-ai/application/text-ai-admission-participant';
import type { LearningAccess } from '../../../application/ports/learning-store';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import { LearningInvalidRequestError } from '../../../domain/errors';
import {
    SentenceCapacityUnavailableError,
    SentenceModelUnavailableError,
} from '../../../domain/sentence-errors';
import type {
    SentenceCheckInput,
    SentenceGenerationInput,
} from '../../../domain/sentence-types';
import { reserveSentenceAttempt } from './sentence-job-accounting';
import {
    sentenceLearner,
    type SentenceTransaction,
} from './sentence-persistence-support';
import { type SentencePracticePersistenceContext } from './sentence-practice-context';
import {
    sentencePracticePool,
    sentencePracticePreparedSelection,
} from './sentence-practice-selection';
import { sentencePracticeRun } from './sentence-practice-transaction';
import {
    sentenceJobEntriesTable as jobEntries,
    sentenceAiJobsTable as jobs,
    sentenceManualReviewsTable as manualReviews,
} from './sentence-schema';

export async function sentencePracticePrepare(
    persistence: SentencePracticePersistenceContext,
    access: LearningAccess,
    input: SentencePrepareRequest,
    context: SentenceContext,
) {
    return sentencePracticeRun(
        persistence,
        access,
        context,
        async (tx, owned, id) => {
            if (input.replayExerciseIds && input.mode !== 'review-only')
                throw new LearningInvalidRequestError();
            const prepared = await sentencePracticePreparedSelection(
                persistence,
                tx,
                access,
                input,
                context,
            );
            const pool = await sentencePracticePool(
                tx,
                owned.dictionary,
                id,
                input.direction,
                prepared?.scope ?? input.scope,
                undefined,
                input.replayExerciseIds,
                prepared?.exerciseIds,
            );
            const sourceLanguage = DictionaryLanguageTagSchema.parse(
                input.direction === 'source-to-target'
                    ? owned.dictionary.sourceLanguageTag
                    : owned.dictionary.targetLanguageTag,
            );
            const targetLanguage = DictionaryLanguageTagSchema.parse(
                input.direction === 'source-to-target'
                    ? owned.dictionary.targetLanguageTag
                    : owned.dictionary.sourceLanguageTag,
            );

            return {
                direction: input.direction,
                mode: input.mode,
                sourceLanguage,
                targetLanguage,
                explanationLanguage:
                    input.explanationLanguage ?? sourceLanguage,
                eligibleCount: pool.candidates.length,
                skippedCount: pool.skippedCount,
                usedCount: pool.candidates.filter((c) => c.exposureCount > 0)
                    .length,
                remainingCount: pool.candidates.filter((c) => !c.exposureCount)
                    .length,
                savedUncheckedCount: pool.savedUncheckedCount,
                savedReviewCount: pool.savedReviewCount,
            };
        },
    );
}

export async function sentencePracticeAdmit(
    persistence: SentencePracticePersistenceContext,
    tx: SentenceTransaction,
    access: LearningAccess,
    dictionaryId: string,
    input: { operationId: string; sessionId: string },
    payload: SentenceGenerationInput | SentenceCheckInput,
    kind: 'sentence-generation' | 'sentence-check',
    direction: SentenceDirection,
    hash: string,
    now: Date,
    storedFormat?: 'sentence-preparation:v1' | 'sentence-preparation:v2',
) {
    await tx.execute(
        sql`select set_config('languon.learning_execution_revision','1',true),set_config('languon.text_ai_selection_revision','1',true),set_config('languon.ai_credit_settlement_revision','1',true)`,
    );

    const learnerId = sentenceLearner(access);
    const format =
        kind === 'sentence-generation'
            ? (persistence.policy.generationFormat ?? 'sentence-generation:v1')
            : 'sentence-check:v1';
    const execution = await persistence.policy
        .resolveExecution(tx, learnerId, format, now, storedFormat)
        .catch((error: unknown) => {
            if (error instanceof TextAiSelectionUnavailableError)
                throw new SentenceModelUnavailableError();

            throw error;
        });

    if (
        !execution.snapshot ||
        !execution.revisionId ||
        execution.selectionVersion !== 1 ||
        !execution.snapshot.creditPricing
    )
        throw new SentenceModelUnavailableError();
    try {
        execution.snapshot = await prepareLegacyAction(
            tx,
            learnerId,
            kind,
            execution.snapshot!,
            now,
        );
    } catch (error) {
        if (
            error instanceof OperatorBudgetUnavailableError ||
            error instanceof ProviderCostAdmissionUnavailableError
        )
            throw new SentenceModelUnavailableError();

        throw error;
    }

    execution.budget = execution.snapshot.aggregateBudget;
    const capacity = await readTextAiCapacity(tx, {
        actorId: learnerId,
        now,
        budget: execution.budget,
    });

    if (
        capacity.globalQueued + capacity.globalRunning >=
            (persistence.policy.globalQueueLimit ?? 1000) ||
        capacity.actorQueued + capacity.actorRunning >=
            (persistence.policy.userQueueLimit ?? 5) ||
        (capacity.oldestRunnableAt &&
            now.getTime() - capacity.oldestRunnableAt.getTime() > 300000) ||
        !textAiProviderBudgetAllows(
            capacity.providerUsage,
            true,
            execution.budget,
        )
    )
        throw new SentenceCapacityUnavailableError();
    const pricing = execution.snapshot.creditPricing!;
    const budget = execution.budget;
    const [referenceReview] =
        kind === 'sentence-check'
            ? await tx
                  .select({ id: manualReviews.id })
                  .from(manualReviews)
                  .where(
                      and(
                          eq(manualReviews.learnerId, learnerId),
                          eq(
                              manualReviews.exerciseId,
                              (payload as SentenceCheckInput).exerciseId,
                          ),
                          eq(manualReviews.sessionId, input.sessionId),
                      ),
                  )
                  .limit(1)
            : [];
    const [job] = await tx
        .insert(jobs)
        .values({
            id: randomUUID(),
            learnerId,
            dictionaryId,
            jobKind: kind,
            format: storedFormat ?? format,
            direction,
            authority:
                access.kind === 'owner'
                    ? { kind: 'owner' }
                    : {
                          kind: 'shared',
                          shareId: access.shareId,
                          keyDigest: access.keyDigest,
                      },
            operationId: input.operationId,
            sessionId: input.sessionId,
            requestFingerprint: hash,
            referenceRevealed: !!referenceReview,
            inputPayload: payload,
            selectedExecutionSnapshot: execution.snapshot,
            selectedExecutionVersion: 1,
            executionRevisionId: execution.revisionId,
            createdAt: now,
            updatedAt: now,
            nextAttemptAt: now,
            maxAttempts: Math.min(
                2,
                persistence.policy.defaultMaxAttempts ?? 2,
            ),
            providerInputCostMicrosPerMillionTokens:
                budget.inputCostMicrosPerMillionTokens,
            providerOutputCostMicrosPerMillionTokens:
                budget.outputCostMicrosPerMillionTokens,
            providerMaxCostMicrosPerAttempt: budget.maxCostMicrosPerAttempt,
            providerMaxInputTokensPerAttempt: budget.maxInputTokensPerAttempt,
            providerMaxOutputTokensPerAttempt: budget.maxOutputTokensPerAttempt,
            providerReservationState: 'active',
            providerReservedAttempts: 1,
            providerReservedCostMicros: budget.maxCostMicrosPerAttempt,
            providerReservedInputTokens: budget.maxInputTokensPerAttempt,
            providerReservedOutputTokens: budget.maxOutputTokensPerAttempt,
            aiCreditAccounted: false,
            aiCreditInputCreditsPerMillionTokens:
                pricing.inputCreditsPerMillionTokens,
            aiCreditOutputCreditsPerMillionTokens:
                pricing.outputCreditsPerMillionTokens,
            aiCreditMaxCreditsPerAttempt: pricing.maxCreditsPerAttempt,
            aiCreditPricingRevision: pricing.revision,
        })
        .returning();
    const provenance =
        'candidates' in payload ? payload.candidates : payload.targets;

    await tx.insert(jobEntries).values(
        provenance.map((e) => ({
            jobId: job!.id,
            dictionaryId,
            entryId: e.entryId,
            learningVersion: e.learningVersion,
        })),
    );

    await reserveSentenceAttempt(tx, job!, 1, now);
    const [updated] = await tx.select().from(jobs).where(eq(jobs.id, job!.id));

    return updated!;
}
