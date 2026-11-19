import type { GenerationRunSummary } from '@languon/contracts';

export function lessonTaskStatus(
    run: GenerationRunSummary,
    task: GenerationRunSummary['tasks'][number],
): GenerationRunSummary['tasks'][number]['status'] {
    if (
        run.pauseReason === 'technical-failure' &&
        task.status !== 'completed' &&
        run.failure?.taskId === task.id
    ) {
        return 'failed';
    }

    return task.status;
}
