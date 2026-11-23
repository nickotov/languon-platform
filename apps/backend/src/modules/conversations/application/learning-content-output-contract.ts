import { z } from 'zod';
import {
    AudioLearningBlockSchema,
    GeneratedProseBodySchema,
    VocabularyLearningBlockSchema,
    GrammarLearningBlockSchema,
    BilingualTextLearningBlockSchema,
    ExerciseLearningBlockSchema,
} from '@languon/contracts';

const generatedBlockSchema = z.discriminatedUnion('type', [
    AudioLearningBlockSchema,
    VocabularyLearningBlockSchema,
    GrammarLearningBlockSchema,
    BilingualTextLearningBlockSchema,
    ExerciseLearningBlockSchema,
]);

export const learningContentOutputSchema = z
    .object({
        tasks: z
            .array(
                z
                    .object({
                        taskId: z.string().min(1).max(80),
                        blocks: z.array(generatedBlockSchema).max(25),
                        prose: GeneratedProseBodySchema.optional(),
                    })
                    .strict(),
            )
            .min(1)
            .max(8),
    })
    .strict();
