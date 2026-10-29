import { z } from 'zod';
import {
    VideoLearningBlockSchema,
    VocabularyLearningBlockSchema,
    BilingualTextLearningBlockSchema,
    AudioLearningBlockSchema,
    GrammarLearningBlockSchema,
    ExerciseLearningBlockSchema,
} from '@languon/contracts';
// Describe the already-public structured variants to the provider. The canonical
// bounded parser remains mandatory in execute: its unknown.pipe preflight would
// otherwise serialize as an empty JSON schema in Mastra's input-schema mode.
export const learningBlockToolInputSchema = z
    .object({
        targetBlockId: z.uuid().optional(),
        blocks: z
            .array(
                z.discriminatedUnion('type', [
                    VideoLearningBlockSchema,
                    VocabularyLearningBlockSchema,
                    BilingualTextLearningBlockSchema,
                    AudioLearningBlockSchema,
                    GrammarLearningBlockSchema,
                    ExerciseLearningBlockSchema,
                ]),
            )
            .min(1)
            .max(25),
    })
    .strict();

export const learningBlockToolDescription =
    'Propose typed learning blocks to append to the authorized owner working draft, or supply targetBlockId to replace exactly one existing block of the same type. Preserve existing item/segment/exercise identities when updating; never invent a target outside the supplied source. The learner must preview and explicitly Apply; this never saves or publishes the note. Use original content and available transcripts; do not invent owned audio asset IDs. For an unprepared audio block omit assetId. Give related exercise questions the same group.id and optional group.title, retaining each exercise ID independently. Ground questions using source block and segment IDs from the authorized context; never fabricate source passages or transcript IDs.';
