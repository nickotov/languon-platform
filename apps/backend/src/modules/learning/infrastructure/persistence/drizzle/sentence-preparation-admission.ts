import { and, eq, sql } from 'drizzle-orm';
import {
    readTextAiCapacity,
    textAiProviderBudgetAllows,
} from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { AiCreditInsufficientBalanceError } from '../../../../ai-credits/domain/ai-credit';
import { ProviderCostAdmissionUnavailableError } from '../../../../ai-credits/domain/provider-cost-admission';
import { OperatorBudgetUnavailableError } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-operator-budget-participant';
import {
    prepareLegacyAction,
    reserveLegacyAction,
} from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import { TextAiSelectionUnavailableError } from '../../../../text-ai/application/text-ai-admission-participant';
import type { LearningAccess } from '../../../application/ports/learning-store';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import {
    SentenceCapacityUnavailableError,
    SentenceCreditsExhaustedError,
    SentenceModelUnavailableError,
} from '../../../domain/sentence-errors';
import {
    sentenceLearner,
    type SentenceTransaction,
} from './sentence-persistence-support';
import { type SentencePracticePersistenceContext } from './sentence-practice-context';
import {
    sentencePreparationActionsTable as preparationActions,
    sentencePreparationsTable as preparations,
} from './sentence-preparation-schema';

export async function sentencePracticePreparePreparationAction(
    persistence: SentencePracticePersistenceContext,
    tx: SentenceTransaction,
    access: LearningAccess,
    input: {
        actionId: string;
        operationId: string;
        fingerprint: string;
        inputPayload: unknown;
    },
    context: SentenceContext,
) {
    const learnerId = sentenceLearner(access);
    const format =
        persistence.policy.generationFormat ?? 'sentence-generation:v1';

    try {
        const execution = await persistence.policy.resolveExecution(
            tx,
            learnerId,
            format,
            context.now,
            format === 'sentence-generation:v2'
                ? 'sentence-preparation:v2'
                : 'sentence-preparation:v1',
        );

        if (
            !execution.snapshot ||
            !execution.revisionId ||
            !execution.snapshot.creditPricing
        )
            throw new SentenceModelUnavailableError();
        const preparedSnapshot = await prepareLegacyAction(
            tx,
            learnerId,
            'sentence-generation',
            execution.snapshot,
            context.now,
        );
        const snapshot = {
            ...preparedSnapshot,
            preparationQueueLimits: {
                global: persistence.policy.globalQueueLimit ?? 1000,
                learner: persistence.policy.userQueueLimit ?? 5,
            },
            preparationFormat:
                format === 'sentence-generation:v2'
                    ? 'sentence-preparation:v2'
                    : 'sentence-preparation:v1',
        };

        await reserveLegacyAction(tx, {
            id: input.actionId,
            ownerId: learnerId,
            kind: 'sentence-generation',
            snapshot,
            inputPayload: input.inputPayload,
            holdMaximumInputTokens:
                snapshot.aggregateBudget.maxInputTokensPerAttempt,
            requestKey: input.operationId,
            fingerprint: input.fingerprint,
            scope: 'sentence-preparation',
            at: context.now,
        });

        return { snapshot, revisionId: execution.revisionId };
    } catch (error) {
        if (error instanceof AiCreditInsufficientBalanceError)
            throw new SentenceCreditsExhaustedError();
        if (
            error instanceof TextAiSelectionUnavailableError ||
            error instanceof ProviderCostAdmissionUnavailableError
        )
            throw new SentenceModelUnavailableError();
        if (error instanceof OperatorBudgetUnavailableError)
            throw new SentenceCapacityUnavailableError();

        throw error;
    }
}

export async function sentencePracticeAdmitPreparationGeneration(
    persistence: SentencePracticePersistenceContext,
    tx: SentenceTransaction,
    _access: LearningAccess,
    input: {
        preparationId: string;
        batchId: string;
        coordinatorFence: bigint;
    },
    context: SentenceContext,
) {
    const learnerId = sentenceLearner(_access);
    const [parent] = await tx
        .select({ snapshot: preparationActions.selectedExecutionSnapshot })
        .from(preparations)
        .innerJoin(
            preparationActions,
            eq(preparationActions.actionId, preparations.currentActionId),
        )
        .where(
            and(
                eq(preparations.id, input.preparationId),
                eq(preparations.learnerId, learnerId),
            ),
        );

    if (!parent) throw new SentenceCreditsExhaustedError();
    const budget = parent.snapshot.aggregateBudget;
    const capacity = await readTextAiCapacity(tx, {
        actorId: learnerId,
        now: context.now,
        budget,
    });

    if (
        capacity.globalQueued + capacity.globalRunning >=
            (persistence.policy.globalQueueLimit ?? 1000) ||
        capacity.actorQueued + capacity.actorRunning >=
            (persistence.policy.userQueueLimit ?? 5) ||
        (capacity.oldestRunnableAt &&
            context.now.getTime() - capacity.oldestRunnableAt.getTime() >
                300000) ||
        !textAiProviderBudgetAllows(capacity.providerUsage, true, budget)
    )
        throw new SentenceCapacityUnavailableError();
    const rows = await tx
        .execute<{ job_id: string }>(
            sql`
            select languon_admit_sentence_preparation_child(${input.preparationId}::uuid,
                ${input.batchId}::uuid, ${input.coordinatorFence}, ${context.now.toISOString()}::timestamptz) as job_id`,
        )
        .catch((error: unknown) => {
            const cause = error instanceof Error ? error.cause : undefined;
            if (
                cause &&
                typeof cause === 'object' &&
                'code' in cause &&
                cause.code === '54000'
            )
                throw new SentenceCapacityUnavailableError();

            throw error;
        });
    const jobId = rows[0]?.job_id;
    if (!jobId) throw new SentenceCreditsExhaustedError();

    return { jobId };
}
