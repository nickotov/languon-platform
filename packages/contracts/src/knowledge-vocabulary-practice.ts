import { z } from 'zod';
import { WorkbookLearningShareAccessSchema } from './workbook-learning';
export const KnowledgeVocabularyPracticeParamsSchema = z
    .object({ noteId: z.uuid(), blockId: z.uuid() })
    .strict();
export const KnowledgeVocabularyPracticeSourceSchema =
    KnowledgeVocabularyPracticeParamsSchema.extend({
        kind: z.literal('knowledge-vocabulary'),
        access: WorkbookLearningShareAccessSchema.optional(),
    });
export type KnowledgeVocabularyPracticeSource = z.infer<
    typeof KnowledgeVocabularyPracticeSourceSchema
>;
