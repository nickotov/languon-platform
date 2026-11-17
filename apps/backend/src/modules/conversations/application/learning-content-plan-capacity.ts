import { generationTaskCapturedText } from './learning-content-plan-sources';
import type { GenerationSourceSnapshot } from './ports/generation-run';
import { generationFingerprint } from './generation-run-revisions';
import {
    estimateLearningContentOutput,
    learningContentAuthoringOutputTokenLimit,
    learningContentOutputEstimateLimit,
} from './learning-content-output-capacity';
import type { GenerationPlan } from '@languon/contracts';
import type { LearningContentBrief } from './learning-content-contract';
import { planLearningContentBatches } from './learning-content-batches';

/** Reject a plan with an unsplittable unit before creating or admitting a run action. */
export function generationPlanCapacity(
    plan: GenerationPlan,
    completedTaskIds: readonly string[] = [],
    completedBatchKeys: readonly string[] = [],
    sources: readonly GenerationSourceSnapshot[] = [],
):
    | { status: 'ready'; minimumOutputTokens: number }
    | { status: 'unsupported'; reason: string } {
    const brief: LearningContentBrief = {
        tasks: plan.tasks.map(({ inputs, ...task }) => {
            const dependencies = inputs.flatMap((input) =>
                input.kind === 'task' ? [input.taskId] : [],
            );

            const capturedText =
                task.kind === 'bilingual-text'
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

    const planned = planLearningContentBatches(brief);
    if (!planned) {
        return { status: 'unsupported', reason: 'single-unit-output-capacity' };
    }

    const completeTasks = new Set(completedTaskIds);
    const completeBatches = new Set(completedBatchKeys);
    const next = planned.batches
        .flatMap((batch) => {
            const tasks = batch.brief.tasks.filter(
                (task) => !completeTasks.has(task.id),
            );

            return tasks.length
                ? [{ ...batch, brief: { ...batch.brief, tasks } }]
                : [];
        })
        .find((batch) => !completeBatches.has(generationFingerprint(batch)));

    return {
        status: 'ready',
        minimumOutputTokens: next
            ? estimateLearningContentOutput(next.brief) +
              learningContentAuthoringOutputTokenLimit -
              learningContentOutputEstimateLimit
            : 0,
    };
}
