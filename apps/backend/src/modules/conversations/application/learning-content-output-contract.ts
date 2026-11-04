import { z } from 'zod';
import {
    VocabularyLearningBlockSchema,
    GrammarLearningBlockSchema,
    BilingualTextLearningBlockSchema,
    ExerciseLearningBlockSchema,
} from '@languon/contracts';

const generatedBlockSchema = z.discriminatedUnion('type', [
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
                        blocks: z.array(generatedBlockSchema).min(1).max(25),
                    })
                    .strict(),
            )
            .min(1)
            .max(8),
    })
    .strict();
