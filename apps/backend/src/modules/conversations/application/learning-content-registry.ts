import { z } from 'zod';
import {
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
                : briefInput.omit({ formats: true }),
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
export function learningContentSchemaForBrief(brief: LearningContentBrief) {
    const schemas = [...new Set(brief.tasks.map((task) => task.kind))].map(
        (kind) => learningContentCapability(kind).outputSchema,
    );
    const [first, second, ...remaining] = schemas;
    const blockSchema = second
        ? z.union([first!, second, ...remaining])
        : first!;

    return z
        .object({
            tasks: z
                .array(
                    z
                        .object({
                            taskId: z.string().min(1).max(80),
                            blocks: z.array(blockSchema).min(1).max(25),
                        })
                        .strict(),
                )
                .min(1)
                .max(8),
        })
        .strict();
}
