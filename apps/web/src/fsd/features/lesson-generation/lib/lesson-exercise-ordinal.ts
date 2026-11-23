import type { GenerationRunSummary } from '@languon/contracts';
import type { lessonRunCopy } from './lesson-run-copy';
import { failedLessonExercise } from './failed-lesson-exercise';

export function lessonExerciseOrdinal(
    run: GenerationRunSummary,
    task: GenerationRunSummary['tasks'][number],
    copy: ReturnType<typeof lessonRunCopy>,
) {
    const failed = failedLessonExercise(run);
    if (failed?.taskId === task.id) {
        return run.failure?.recoveryExhausted
            ? copy.exerciseOrdinal(failed.index, failed.total)
            : copy.failedExercise(failed.index, failed.total);
    }

    const active =
        task.status === 'running' ||
        task.id === run.automation?.recoveringTaskId;
    const completed = task.completedUnitCount ?? 0;
    if (
        active &&
        task.kind === 'exercises' &&
        task.totalUnitCount &&
        completed < task.totalUnitCount
    ) {
        return copy.exerciseOrdinal(completed + 1, task.totalUnitCount);
    }

    return undefined;
}
