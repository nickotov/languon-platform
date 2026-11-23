import { generationFingerprint } from './generation-run-revisions';
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

// Reserve half the existing two-minute stage for a durable call; a slow model
// must not receive a new unit with only the tail of a previous call's deadline.
export const learningContentMinimumCallTimeMs = 60_000;

export interface LearningContentExecutionBudget {
    readonly remainingTimeMs?: number;
    readonly perCallInputLimit?: number;
    readonly remainingCalls: number;
    readonly remainingOutputTokens: number;
}

/** Prefix counts also recognize validated checkpoints made before unit splitting. */
export function isLearningContentBatchCompleted(
    batch: LearningContentBatch,
    batchKey: string,
    completedKeys: ReadonlySet<string>,
    completedExerciseCounts: ReadonlyMap<string, number>,
): boolean {
    if (completedKeys.has(batchKey)) {
        return true;
    }

    const part = batch.exercisePart;
    if (!part) {
        return false;
    }

    const count = batch.brief.tasks.find(
        (task) => task.id === part.taskId,
    )?.count;

    return (
        count !== undefined &&
        part.offset + count <= (completedExerciseCounts.get(part.taskId) ?? 0)
    );
}

export const learningContentAuthoringCallLimit = 5;
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

        if (count === 0) {
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

    const total =
        task.count ??
        (task.activities ? exerciseActivitySequence(task).length : 5);
    const words = task.words?.slice(
        Math.floor((offset * task.words.length) / total),
        Math.floor(((offset + count) * task.words.length) / total),
    );

    return {
        ...task,
        count,
        ...(task.words ? { words: words?.length ? words : undefined } : {}),
        ...(activities.length ? { activities } : {}),
    };
}

function splitExercises(
    task: LearningContentTask,
    unitSize?: number,
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
            (unitSize === undefined || count < unitSize) &&
            estimateLearningContentOutput({
                tasks: [exercisePart(task, offset, count + 1)],
            }) <= learningContentOutputEstimateLimit
        ) {
            count += 1;
        }

        if (!count) {
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

/** Plan bounded homogeneous units; an action may execute only a prefix of the run. */
export function planLearningContentBatches(
    brief: LearningContentBrief,
    options: { exerciseUnitSize?: 1 } = {},
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

    const ordered: LearningContentTask[] = [];
    const remaining = [...brief.tasks];
    while (remaining.length) {
        const index = remaining.findIndex((task) => {
            const dependencies = [
                ...(task.dependencies ?? []),
                ...(task.source?.kind === 'task' ? [task.source.taskId] : []),
            ];

            return dependencies.every((id) =>
                ordered.some((item) => item.id === id),
            );
        });

        if (index < 0) {
            return null;
        }

        ordered.push(remaining.splice(index, 1)[0]!);
    }

    for (const task of ordered) {
        if (options.exerciseUnitSize === 1 || task.dependencies?.length) {
            flushPending();
        }

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
        // Durable runs checkpoint each exercise independently. A failed sibling
        // must never force another already validated exercise through the model.
        if (task.kind === 'exercises' && options.exerciseUnitSize === 1) {
            const fragments = splitExercises(task, 1);
            if (!fragments) {
                return null;
            }

            flushPending();
            batches.push(...fragments);
            continue;
        }

        if (task.kind === 'audio') {
            flushPending();
            batches.push({ brief: { tasks: [task] } });
            continue;
        }

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

        // Different output families never compete for the same structured response.
        if (pending.length && pending[0]!.kind !== task.kind) {
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

    if (!batches.length) {
        return null;
    }

    return { batches, requiredOutputTokens };
}

/** Canonical ordering and missing-unit selection for both admission and the durable worker. */
export function remainingLearningBatches(
    brief: LearningContentBrief,
    durable: boolean,
    completed: {
        completedTaskIds?: readonly string[];
        completedBatchKeys?: readonly string[];
        completed?: readonly { taskId: string; blocks: readonly unknown[] }[];
    },
) {
    const plan = planLearningContentBatches(
        brief,
        durable ? { exerciseUnitSize: 1 } : {},
    );

    if (!plan) {
        return null;
    }

    const completeTasks = new Set(completed.completedTaskIds);
    const completeBatches = new Set(completed.completedBatchKeys);
    const counts = new Map(
        completed.completed?.map((result) => [
            result.taskId,
            result.blocks.length,
        ]),
    );
    const batches = plan.batches.flatMap((original) => {
        const tasks = original.brief.tasks.filter(
            (task) => !completeTasks.has(task.id),
        );

        if (!tasks.length) {
            return [];
        }

        const batch = { ...original, brief: { ...original.brief, tasks } };

        return isLearningContentBatchCompleted(
            batch,
            generationFingerprint(batch),
            completeBatches,
            counts,
        )
            ? []
            : [batch];
    });

    return { ...plan, batches };
}
