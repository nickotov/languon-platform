import type {
    LearningContentBrief,
    LearningContentTask,
} from './learning-content-contract';
import {
    estimateLearningContentOutput,
    learningContentAuthoringOutputTokenLimit,
    learningContentOutputEstimateLimit,
} from './learning-content-output-capacity';

export interface LearningContentBatch {
    brief: LearningContentBrief;
    vocabularyPart?: { taskId: string; offset: number; total: number };
}

export interface LearningContentBatchPlan {
    batches: LearningContentBatch[];
    requiredOutputTokens: number;
}

export interface LearningContentExecutionBudget {
    readonly remainingCalls: number;
    readonly remainingOutputTokens: number;
}

export const learningContentAuthoringCallLimit = 4;
export const learningContentActionOutputLimit = 10_000;
const estimationHeadroom =
    learningContentAuthoringOutputTokenLimit -
    learningContentOutputEstimateLimit;

function vocabularyPart(
    task: LearningContentTask,
    offset: number,
    count: number,
): LearningContentTask {
    return {
        ...task,
        count,
        ...(task.words
            ? { words: task.words.slice(offset, offset + count) }
            : {}),
    };
}

function splitVocabulary(
    task: LearningContentTask,
): LearningContentBatch[] | null {
    const total = task.words?.length ?? task.count ?? 10;
    const batches: LearningContentBatch[] = [];
    let offset = 0;

    while (offset < total) {
        let count = 0;
        while (offset + count < total) {
            const candidate = vocabularyPart(task, offset, count + 1);
            if (
                estimateLearningContentOutput({ tasks: [candidate] }) >
                learningContentOutputEstimateLimit
            ) {
                break;
            }

            count += 1;
        }

        if (
            count === 0 ||
            batches.length === learningContentAuthoringCallLimit
        ) {
            return null;
        }

        // A fragment's temporary block ID disappears during aggregation. Keeping
        // its call separate prevents other tasks from referencing that identity.
        batches.push({
            brief: { tasks: [vocabularyPart(task, offset, count)] },
            vocabularyPart: { taskId: task.id, offset, total },
        });

        offset += count;
    }

    return batches;
}

/** Plans within the existing per-call and total authoring budget, without truncation. */
export function planLearningContentBatches(
    brief: LearningContentBrief,
): LearningContentBatchPlan | null {
    const batches: LearningContentBatch[] = [];
    let pending: LearningContentTask[] = [];

    function flushPending() {
        if (pending.length > 0) {
            batches.push({ brief: { tasks: pending } });
            pending = [];
        }
    }

    for (const task of brief.tasks) {
        const estimate = estimateLearningContentOutput({ tasks: [task] });
        if (estimate > learningContentOutputEstimateLimit) {
            if (task.kind !== 'vocabulary') {
                return null;
            }

            const fragments = splitVocabulary(task);
            if (!fragments) {
                return null;
            }

            flushPending();
            batches.push(...fragments);
            continue;
        }

        if (
            estimateLearningContentOutput({ tasks: [...pending, task] }) >
            learningContentOutputEstimateLimit
        ) {
            flushPending();
        }

        pending.push(task);
    }

    flushPending();

    const requiredOutputTokens = batches.reduce(
        (total, batch) =>
            total +
            estimateLearningContentOutput(batch.brief) +
            estimationHeadroom,
        0,
    );

    if (
        batches.length === 0 ||
        batches.length > learningContentAuthoringCallLimit ||
        requiredOutputTokens > learningContentActionOutputLimit
    ) {
        return null;
    }

    return { batches, requiredOutputTokens };
}
