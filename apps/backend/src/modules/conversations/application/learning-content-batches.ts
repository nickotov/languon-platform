import { exerciseActivitySequence } from './exercise-activity-allocation';
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
    exercisePart?: { taskId: string; offset: number; total: number };
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

function exercisePart(
    task: LearningContentTask,
    offset: number,
    count: number,
): LearningContentTask {
    const sequence = exerciseActivitySequence(task).slice(
        offset,
        offset + count,
    );
    const activities: NonNullable<LearningContentTask['activities']> = [];
    for (const item of sequence) {
        const previous = activities.at(-1);
        if (previous?.activityId === item.activityId) {
            previous.count = (previous.count ?? 0) + 1;
        } else {
            activities.push({ activityId: item.activityId, count: 1 });
        }
    }

    return { ...task, count, ...(activities.length ? { activities } : {}) };
}

function splitExercises(
    task: LearningContentTask,
): LearningContentBatch[] | null {
    const total =
        task.count ??
        (task.activities ? exerciseActivitySequence(task).length : 5);
    const batches: LearningContentBatch[] = [];
    let offset = 0;
    while (offset < total) {
        let count = 0;
        while (
            offset + count < total &&
            estimateLearningContentOutput({
                tasks: [exercisePart(task, offset, count + 1)],
            }) <= learningContentOutputEstimateLimit
        ) {
            count += 1;
        }

        if (!count || batches.length === learningContentAuthoringCallLimit) {
            return null;
        }

        batches.push({
            brief: { tasks: [exercisePart(task, offset, count)] },
            exercisePart: { taskId: task.id, offset, total },
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
    const seen = new Set<string>();

    function flushPending() {
        if (pending.length > 0) {
            batches.push({ brief: { tasks: pending } });
            pending = [];
        }
    }

    for (const task of brief.tasks) {
        if (task.source?.kind === 'task') {
            const dependencyId = task.source.taskId;
            const dependency = brief.tasks.find(
                (candidate) => candidate.id === dependencyId,
            );

            if (
                !seen.has(task.source.taskId) ||
                dependency?.kind === 'exercises'
            ) {
                return null;
            }

            // Authoring must finish and validate the predecessor before resolving
            // its actual output. Never put a dependent in the same provider call.
            flushPending();
        }

        seen.add(task.id);
        const estimate = estimateLearningContentOutput({ tasks: [task] });
        if (estimate > learningContentOutputEstimateLimit) {
            const fragments =
                task.kind === 'vocabulary'
                    ? splitVocabulary(task)
                    : task.kind === 'exercises'
                      ? splitExercises(task)
                      : null;

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
        !batches.length ||
        batches.length > learningContentAuthoringCallLimit ||
        requiredOutputTokens > learningContentActionOutputLimit
    ) {
        return null;
    }

    return { batches, requiredOutputTokens };
}
