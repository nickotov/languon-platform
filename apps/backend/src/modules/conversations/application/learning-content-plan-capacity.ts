import { generationTaskCapturedText } from './learning-content-plan-sources';
import type { GenerationSourceSnapshot } from './ports/generation-run';
import { generationFingerprint } from './generation-run-revisions';
import { learningUnitMinimumOutput } from './learning-content-output-capacity';
import type { GenerationPlan } from '@languon/contracts';
import type { LearningContentBrief } from './learning-content-contract';
import {
    isLearningContentBatchCompleted,
    planLearningContentBatches,
} from './learning-content-batches';

/** Reject a plan with an unsplittable unit before creating or admitting a run action. */
export function generationPlanCapacity(
    plan: GenerationPlan,
    completedTaskIds: readonly string[] = [],
    completedBatchKeys: readonly string[] = [],
    sources: readonly GenerationSourceSnapshot[] = [],
    completedExerciseCounts: ReadonlyMap<string, number> = new Map(),
):
    | {
          status: 'ready';
          minimumOutputTokens: number;
      }
    | { status: 'unsupported'; reason: string } {
    const brief: LearningContentBrief = {
        tasks: plan.tasks.map(({ inputs, ...task }) => {
            const dependencies = inputs.flatMap((input) =>
                input.kind === 'task' ? [input.taskId] : [],
            );

            const capturedText =
                task.kind === 'bilingual-text' || task.kind === 'audio'
                    ? generationTaskCapturedText(inputs, sources)
                    : '';

            return {
                ...task,
                ...('sourceText' in task && inputs.length
                    ? { sourceText: undefined }
                    : {}),
                ...(capturedText ? { sourceText: capturedText } : {}),
                ...(task.kind === 'exercises'
                    ? {
                          source: { kind: 'editor' as const },
                          count: task.activities.reduce(
                              (sum, activity) => sum + activity.count,
                              0,
                          ),
                      }
                    : {}),
                ...(dependencies[0]
                    ? {
                          source: {
                              kind: 'task' as const,
                              taskId: dependencies[0],
                          },
                          dependencies,
                      }
                    : {}),
            };
        }),
        outputOrder: plan.outputOrder,
    };

    const planned = planLearningContentBatches(brief, { exerciseUnitSize: 1 });
    if (!planned) {
        return { status: 'unsupported', reason: 'single-unit-output-capacity' };
    }

    const completeTasks = new Set(completedTaskIds);
    const completeBatches = new Set(completedBatchKeys);
    const remaining = planned.batches
        .flatMap((batch) => {
            const tasks = batch.brief.tasks.filter(
                (task) => !completeTasks.has(task.id),
            );

            return tasks.length
                ? [{ ...batch, brief: { ...batch.brief, tasks } }]
                : [];
        })
        .filter(
            (batch) =>
                !isLearningContentBatchCompleted(
                    batch,
                    generationFingerprint(batch),
                    completeBatches,
                    completedExerciseCounts,
                ),
        );

    const next = remaining[0];

    return {
        status: 'ready',
        minimumOutputTokens: next ? learningUnitMinimumOutput(next.brief) : 0,
    };
}
