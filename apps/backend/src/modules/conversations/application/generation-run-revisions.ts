import { createHash } from 'node:crypto';
import type { GenerationPlan } from '@languon/contracts';
import type {
    GenerationArtifact,
    GenerationSourceSnapshot,
} from './ports/generation-run';

export function generationFingerprint(value: unknown): string {
    const canonical = (item: unknown): unknown => {
        if (Array.isArray(item)) {
            return item.map(canonical);
        }

        if (item && typeof item === 'object') {
            return Object.fromEntries(
                Object.entries(item)
                    .filter(([, field]) => field !== undefined)
                    .sort(([left], [right]) =>
                        left < right ? -1 : left > right ? 1 : 0,
                    )
                    .map(([key, field]) => [key, canonical(field)]),
            );
        }

        return item;
    };

    return createHash('sha256')
        .update(JSON.stringify(canonical(value)) ?? 'undefined')
        .digest('hex');
}

/** Output ordering does not change a task's meaning; dependencies do. */
export function compareGenerationPlans(
    previous: GenerationPlan,
    next: GenerationPlan,
) {
    const before = new Map(previous.tasks.map((task) => [task.id, task]));
    const after = new Map(next.tasks.map((task) => [task.id, task]));
    const changed = new Set(
        next.tasks
            .filter((task) => {
                const original = before.get(task.id);

                return (
                    original &&
                    generationFingerprint(original) !==
                        generationFingerprint(task)
                );
            })
            .map((task) => task.id),
    );
    const oldSources = new Map(
        previous.sources.map((source) => [source.id, source]),
    );
    const changedSources = new Set(
        next.sources
            .filter(
                (source) =>
                    generationFingerprint(oldSources.get(source.id)) !==
                    generationFingerprint(source),
            )
            .map((source) => source.id),
    );

    for (const task of next.tasks) {
        if (
            task.inputs.some(
                (input) =>
                    input.kind === 'source' &&
                    changedSources.has(input.sourceId),
            )
        ) {
            changed.add(task.id);
        }
    }

    invalidateGenerationDescendants(next, changed);

    return {
        keptTaskIds: next.tasks
            .filter((task) => before.has(task.id) && !changed.has(task.id))
            .map((task) => task.id),
        changedTaskIds: [...changed].filter((id) => before.has(id)),
        addedTaskIds: next.tasks
            .filter((task) => !before.has(task.id))
            .map((task) => task.id),
        removedTaskIds: previous.tasks
            .filter((task) => !after.has(task.id))
            .map((task) => task.id),
    };
}

export function invalidateGenerationDescendants(
    plan: GenerationPlan,
    invalidated: Set<string>,
) {
    let expanded = true;
    while (expanded) {
        expanded = false;
        for (const task of plan.tasks) {
            if (
                !invalidated.has(task.id) &&
                task.inputs.some(
                    (input) =>
                        input.kind === 'task' && invalidated.has(input.taskId),
                )
            ) {
                invalidated.add(task.id);
                expanded = true;
            }
        }
    }

    return invalidated;
}

export function generationTaskFingerprints(
    plan: GenerationPlan,
    taskId: string,
    sources: GenerationSourceSnapshot[],
    artifacts: GenerationArtifact[],
) {
    const task = plan.tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
        throw new Error('Unknown generation task.');
    }

    return {
        requirementsHash: generationFingerprint(task),
        sourceHash: generationFingerprint(
            task.inputs.map((input) =>
                input.kind === 'source'
                    ? sources.find(
                          (source) => source.sourceId === input.sourceId,
                      )
                    : artifacts
                          .filter(
                              (artifact) => artifact.taskId === input.taskId,
                          )
                          .map((artifact) => artifact.contentHash),
            ),
        ),
    };
}
