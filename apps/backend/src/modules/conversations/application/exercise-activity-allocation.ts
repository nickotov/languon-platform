import {
    exerciseActivityCatalog,
    getExerciseActivity,
    type ExerciseActivityId,
    type ExerciseActivitySourceKind,
} from '@languon/contracts';
import type { LearningContentTask } from './learning-content-contract';

export interface ExerciseActivityAllocation {
    activityId: ExerciseActivityId;
    count: number;
}

export type ExerciseActivityAllocationResult =
    | { status: 'ready'; allocations: ExerciseActivityAllocation[] }
    | { status: 'needs-clarification'; fields: string[] };

const defaultPatterns: Record<
    ExerciseActivitySourceKind,
    ExerciseActivityId[]
> = {
    vocabulary: ['V02', 'V03', 'V01', 'V02', 'V03'],
    grammar: ['G06', 'G02', 'G02', 'G03', 'G07'],
    text: ['R01', 'R02', 'R02', 'R04', 'R09'],
};

/** Host-derived source kinds determine eligibility; catalog metadata grants no source access. */
export function resolveExerciseActivityAllocations(
    task: LearningContentTask,
    sourceKinds: readonly ExerciseActivitySourceKind[],
): ExerciseActivityAllocationResult {
    const missing = (fields: string[]): ExerciseActivityAllocationResult => ({
        status: 'needs-clarification',
        fields,
    });

    if (task.kind !== 'exercises') {
        return missing(['activities']);
    }

    const eligible = exerciseActivityCatalog.filter(
        (activity) =>
            activity.supportedSourceKinds.some((kind) =>
                sourceKinds.includes(kind),
            ) &&
            (!task.formats || task.formats.includes(activity.format)),
    );

    if (!eligible.length) {
        return missing(['source']);
    }

    const selections = task.activities;
    if (selections) {
        if (
            new Set(selections.map((selection) => selection.activityId))
                .size !== selections.length
        ) {
            return missing(['activities']);
        }

        if (
            selections.some(
                (selection) =>
                    !eligible.some(
                        (activity) => activity.id === selection.activityId,
                    ),
            )
        ) {
            return missing(['source', 'activities']);
        }

        if (
            selections.length > 1 &&
            selections.some((selection) => selection.count === undefined)
        ) {
            return missing(['activities', 'count']);
        }

        const allocations = selections.map((selection) => ({
            activityId: selection.activityId,
            count: selection.count ?? task.count ?? 5,
        }));
        const total = allocations.reduce(
            (sum, allocation) => sum + allocation.count,
            0,
        );

        if (total > 25 || (task.count !== undefined && total !== task.count)) {
            return missing(['activities', 'count']);
        }

        return { status: 'ready', allocations };
    }

    const count = task.count ?? 5;
    if (count > 25) {
        return missing(['count']);
    }

    const preferred = sourceKinds
        .flatMap((kind) => defaultPatterns[kind])
        .filter((id) => eligible.some((activity) => activity.id === id));
    const pattern = preferred.length
        ? preferred
        : eligible.map((activity) => activity.id);
    const allocations: ExerciseActivityAllocation[] = [];
    for (let index = 0; index < count; index += 1) {
        const activityId = pattern[index % pattern.length]!;
        const previous = allocations.find(
            (allocation) => allocation.activityId === activityId,
        );

        if (previous) {
            previous.count += 1;
        } else {
            allocations.push({ activityId, count: 1 });
        }
    }

    return { status: 'ready', allocations };
}

/** Ordered, exact activity sequence used by authoring and post-generation validation. */
export function exerciseActivitySequence(task: LearningContentTask) {
    return (task.activities ?? []).flatMap((activity) =>
        Array.from({ length: activity.count ?? task.count ?? 5 }, () => ({
            activityId: activity.activityId,
            format: getExerciseActivity(activity.activityId).format,
        })),
    );
}
