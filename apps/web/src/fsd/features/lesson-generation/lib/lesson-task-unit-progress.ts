import type { GenerationRunSummary } from '@languon/contracts';
import type { lessonRunCopy } from './lesson-run-copy';

export function lessonTaskUnitProgress(
    task: GenerationRunSummary['tasks'][number],
    copy: ReturnType<typeof lessonRunCopy>,
): string | undefined {
    if (
        task.totalUnitCount === undefined ||
        (task.kind !== 'exercises' && task.kind !== 'vocabulary')
    ) {
        return undefined;
    }

    const describe =
        task.kind === 'vocabulary' ? copy.entryProgress : copy.unitProgress;

    return describe(task.completedUnitCount ?? 0, task.totalUnitCount);
}
