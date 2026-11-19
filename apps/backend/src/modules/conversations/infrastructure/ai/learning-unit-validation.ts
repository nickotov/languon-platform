import { randomUUID } from 'node:crypto';
import type { LearningBlock } from '@languon/contracts';
import { resolveExerciseActivityAllocations } from '../../application/exercise-activity-allocation';
import {
    compileGeneratedReading,
    type GeneratedReading,
} from '../../application/learning-content-prose';
import { learningContentOutputSchema } from '../../application/learning-content-output-contract';
import type { LearningContentBrief } from '../../application/learning-content-contract';
import {
    completeNamedExerciseSources,
    exerciseSourceKinds,
    type ExerciseAuthoringSource,
} from './exercise-authoring-context';
import { validateNamedExerciseActivity } from './exercise-activities';

export interface DecodedLearningUnit {
    tasks: { taskId: string; blocks?: unknown[]; prose?: GeneratedReading }[];
}

type ExerciseGroup = NonNullable<
    Extract<LearningBlock, { type: 'exercise' }>['group']
>;

/** Both authoring wire envelopes feed the same compiler and canonical validation. */
export function compileLearningUnit(input: {
    decoded: DecodedLearningUnit;
    brief: LearningContentBrief;
    lesson: LearningContentBrief;
    contexts: ReadonlyMap<string, ExerciseAuthoringSource>;
    exerciseGroups: Map<string, ExerciseGroup>;
    linkableBlocks: readonly LearningBlock[];
}) {
    const tasks = input.decoded.tasks.map((task) => {
        const requested = input.brief.tasks.find(
            (item) => item.id === task.taskId,
        );
        const result = {
            taskId: task.taskId,
            blocks: task.blocks ?? [],
            ...(task.prose
                ? { prose: compileGeneratedReading(task.prose) }
                : {}),
        };

        if (requested?.kind !== 'exercises') {
            return result;
        }

        const context = input.contexts.get(task.taskId);
        if (!context) {
            throw new Error('An exercise has no authorized task source.');
        }

        const group = input.exerciseGroups.get(task.taskId) ?? {
            id: randomUUID(),
        };

        input.exerciseGroups.set(task.taskId, group);

        result.blocks = result.blocks.map((value) => {
            const block = completeNamedExerciseSources(value, context, {
                language: requested.language!,
                explanationLanguage: requested.explanationLanguage!,
                group,
                linkableBlocks: input.linkableBlocks,
            });

            if (block.type === 'exercise') {
                validateNamedExerciseActivity(block, context.blocks);
            }

            return block;
        });

        return result;
    });

    const result = learningContentOutputSchema.parse({ tasks });
    for (const produced of result.tasks) {
        if (produced.prose) {
            continue;
        }

        const dependent = input.lesson.tasks.filter(
            (task) =>
                task.kind === 'exercises' &&
                task.source?.kind === 'task' &&
                task.source.taskId === produced.taskId,
        );

        if (
            dependent.some(
                (task) =>
                    resolveExerciseActivityAllocations(
                        task,
                        exerciseSourceKinds({ blocks: produced.blocks }),
                    ).status !== 'ready',
            )
        ) {
            throw new Error(
                'Generated material does not satisfy the dependent activity prerequisite.',
            );
        }
    }

    return result;
}
