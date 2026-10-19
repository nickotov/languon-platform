import {
    KnowledgeBodySchema,
    KnowledgeNoteContentSchema,
    type KnowledgeCategory,
    type KnowledgeNoteContent,
} from '@languon/contracts';
import type { MessageKey } from '@/fsd/shared/i18n';

export const knowledgeCategoryKeys: Record<KnowledgeCategory, MessageKey> = {
    grammar: 'knowledge.category.grammar',
    vocabulary: 'knowledge.category.vocabulary',
    usage: 'knowledge.category.usage',
    pronunciation: 'knowledge.category.pronunciation',
    etymology: 'knowledge.category.etymology',
    culture: 'knowledge.category.culture',
    'learning-tips': 'knowledge.category.learningTips',
};

/** Remove note identity/version; drafts and publication carry content only. */
export function noteContent(value: KnowledgeNoteContent): KnowledgeNoteContent {
    return KnowledgeNoteContentSchema.parse({
        title: value.title,
        summary: value.summary,
        categories: [...value.categories],
        studiedLanguage: value.studiedLanguage,
        explanationLanguage: value.explanationLanguage,
        body: value.body,
    });
}

export const emptyKnowledgeBody = KnowledgeBodySchema.parse({
    schemaVersion: 1,
    document: { type: 'doc', content: [{ type: 'paragraph' }] },
});
