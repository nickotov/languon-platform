import type { GenerationRunSummary } from '@languon/contracts';

/** Durable exercise checkpoints are a validated prefix, so only its next unit can fail. */
export function failedLessonExercise(run: GenerationRunSummary) {
    if (run.pauseReason !== 'technical-failure' || !run.failure?.taskId) {
        return undefined;
    }

    const task = run.tasks.find((item) => item.id === run.failure?.taskId);
    if (
        !task ||
        task.kind !== 'exercises' ||
        task.status === 'completed' ||
        task.completedUnitCount === undefined ||
        task.totalUnitCount === undefined ||
        task.completedUnitCount >= task.totalUnitCount
    ) {
        return undefined;
    }

    return {
        taskId: task.id,
        index: task.completedUnitCount + 1,
        total: task.totalUnitCount,
    };
}
