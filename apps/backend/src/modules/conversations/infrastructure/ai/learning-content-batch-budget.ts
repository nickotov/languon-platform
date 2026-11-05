import {
    learningContentAuthoringCallLimit,
    learningContentActionOutputLimit,
    type LearningContentExecutionBudget,
} from '../../application/learning-content-batches';

/** Mirrors an admitted parent when present; standalone callers reserve conservatively. */
export function createLearningContentBatchBudget(
    readBudget?: () => LearningContentExecutionBudget,
) {
    let calls = 0;
    let reservedOutput = 0;

    return {
        remaining(): LearningContentExecutionBudget {
            const parent = readBudget?.() ?? {
                remainingCalls: learningContentAuthoringCallLimit - calls,
                remainingOutputTokens:
                    learningContentActionOutputLimit - reservedOutput,
            };

            if (
                !Number.isSafeInteger(parent.remainingCalls) ||
                !Number.isSafeInteger(parent.remainingOutputTokens)
            ) {
                return { remainingCalls: 0, remainingOutputTokens: 0 };
            }

            return {
                remainingCalls: Math.max(
                    0,
                    Math.min(
                        learningContentAuthoringCallLimit - calls,
                        parent.remainingCalls,
                    ),
                ),
                remainingOutputTokens: Math.max(
                    0,
                    Math.min(
                        learningContentActionOutputLimit,
                        parent.remainingOutputTokens,
                    ),
                ),
            };
        },
        reserve(outputTokens: number) {
            calls += 1;
            reservedOutput += outputTokens;
        },
    };
}
