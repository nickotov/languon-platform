import { getExerciseActivity } from '@languon/contracts';
import type { LearningContentBrief } from './learning-content-contract';

export const learningContentAuthoringOutputTokenLimit = 4096;
export const learningContentOutputEstimateLimit =
    learningContentAuthoringOutputTokenLimit - 512;

const encodedBytes = (value: string) =>
    Buffer.byteLength(JSON.stringify(value), 'utf8');

/**
 * Deliberately conservative product preflight, not a tokenizer or completion guarantee.
 * Mandatory echoed literals reserve one token per encoded JSON byte, twice for
 * source plus translation. Fixed allowances cover UUIDs, wrappers and authored
 * content; 512 tokens stay unallocated for estimation error. Input-only passages
 * for grammar/exercises do not consume an echo allowance. Unknown topic-generated
 * content uses bounded planning estimates and still requires actual output validation.
 */
export function estimateLearningContentOutput(
    brief: LearningContentBrief,
): number {
    return brief.tasks.reduce((total, task) => {
        if (task.kind === 'vocabulary') {
            const count = task.words?.length ?? task.count ?? 10;
            const literalAllowance = task.words
                ? task.words.reduce(
                      (sum, word) => sum + 2 * encodedBytes(word),
                      0,
                  )
                : count * 32;

            return total + 100 + count * 80 + literalAllowance;
        }

        if (task.kind === 'bilingual-text') {
            return (
                total +
                (task.sourceText
                    ? 150 + 2 * encodedBytes(task.sourceText)
                    : 1_000)
            );
        }

        if (task.kind === 'grammar') {
            return total + 600;
        }

        // Exercise coverage requires each supplied word in learner-facing
        // questions/answers, even when the exercise count is only one.
        const requiredWords = (task.words ?? []).reduce(
            (sum, word) => sum + encodedBytes(word),
            0,
        );

        // Named keys, prepared variants, rubric criteria and evidence are part
        // of the provider output. Exact source snapshots are host-filled, not
        // echoed by the model for each exercise.
        const exerciseAllowance = task.activities?.length
            ? task.activities.reduce(
                  (sum, activity) =>
                      sum +
                      (activity.count ?? task.count ?? 5) *
                          (activity.activityId === 'R03'
                              ? 650
                              : getExerciseActivity(activity.activityId)
                                      .checkingPolicy === 'prepared-key'
                                ? 450
                                : 550),
                  0,
              )
            : (task.count ?? 5) * 550;

        return total + exerciseAllowance + requiredWords;
    }, 0);
}
