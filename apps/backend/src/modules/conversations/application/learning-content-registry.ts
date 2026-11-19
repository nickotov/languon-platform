import { z } from 'zod';
import { generatedReadingSchema } from './learning-content-prose';
import {
    ProseKnowledgeBodySchema,
    VocabularyLearningBlockSchema,
    GrammarLearningBlockSchema,
    BilingualTextLearningBlockSchema,
    ExerciseLearningBlockSchema,
} from '@languon/contracts';
import {
    learningContentCapabilities,
    LearningContentTaskSchema,
    type LearningContentBrief,
    type LearningContentTask,
} from './learning-content-contract';
import {
    validateVocabulary,
    validateExercises,
    validateSingleBlock,
} from './learning-content-task-validation';

const briefInput = LearningContentTaskSchema.omit({ id: true, kind: true });
const outputSchemas = {
    prose: ProseKnowledgeBodySchema,
    vocabulary: VocabularyLearningBlockSchema,
    grammar: GrammarLearningBlockSchema,
    'bilingual-text': BilingualTextLearningBlockSchema,
    exercises: ExerciseLearningBlockSchema,
};

/** Static application capabilities; SDK execution and UI implementations bind at composition. */
export const learningContentRegistry = learningContentCapabilities.map(
    (capability) => ({
        ...capability,
        inputSchema:
            capability.kind === 'exercises'
                ? briefInput
                : briefInput.omit({ formats: true, activities: true }),
        outputSchema: outputSchemas[capability.kind],
        sourcePolicy: 'authorized-frozen-source' as const,
        authority: 'owned-knowledge-proposal' as const,
        contextPolicy: 'canonical-artifact-with-compact-receipt' as const,
        generator: 'structured-authoring' as const,
        validate:
            capability.kind === 'vocabulary'
                ? validateVocabulary
                : capability.kind === 'exercises'
                  ? validateExercises
                  : validateSingleBlock,
    }),
);

export function learningContentCapability(kind: LearningContentTask['kind']) {
    return learningContentRegistry.find(
        (capability) => capability.kind === kind,
    )!;
}

/** Only requested block families join a provider response schema. */
export function learningContentSchemaForBrief(
    brief: LearningContentBrief,
    exerciseSchema?: z.ZodType,
) {
    const taskSchemas = brief.tasks.map((task) => {
        const common = { taskId: z.literal(task.id) };
        if (task.kind === 'prose') {
            return z
                .object({
                    ...common,
                    prose: generatedReadingSchema,
                })
                .strict();
        }

        const block =
            task.kind === 'exercises' && exerciseSchema
                ? exerciseSchema
                : learningContentCapability(task.kind).outputSchema;

        return z
            .object({ ...common, blocks: z.array(block).min(1).max(25) })
            .strict();
    });
    const [first, second, ...rest] = taskSchemas;

    return z
        .object({
            tasks: z
                .array(second ? z.union([first!, second, ...rest]) : first!)
                .min(1)
                .max(8),
        })
        .strict();
}
