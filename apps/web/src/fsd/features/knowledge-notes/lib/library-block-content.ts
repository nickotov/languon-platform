import {
    LearningBlockSchema,
    type DictionaryCard,
    type DictionarySummary,
    type LearningBlock,
    type TextDocument,
} from '@languon/contracts';
export function vocabularyLibraryBlock(
    dictionary: Pick<
        DictionarySummary,
        'name' | 'sourceLanguage' | 'targetLanguage'
    >,
    cards: Pick<DictionaryCard, 'values'>[],
): LearningBlock {
    return LearningBlockSchema.parse({
        id: crypto.randomUUID(),
        type: 'vocabulary',
        title: dictionary.name,
        language: dictionary.sourceLanguage,
        translationLanguage: dictionary.targetLanguage,
        entries: cards.map((card) => ({
            id: crypto.randomUUID(),
            term: card.values.source,
            translation: card.values.translation,
            ...(card.values.transcription
                ? { pronunciation: card.values.transcription }
                : {}),
            ...(card.values.definition
                ? { definition: card.values.definition }
                : {}),
            ...(card.values.example ? { example: card.values.example } : {}),
            ...(card.values.exampleTranslation
                ? { exampleTranslation: card.values.exampleTranslation }
                : {}),
        })),
    });
}
function originalPassages(source: string) {
    const chunks: string[] = [];
    let current = '';
    for (const character of source) {
        if (current.length + character.length > 8_000) {
            chunks.push(current);
            current = '';
        }
        current += character;
    }
    if (current) chunks.push(current);
    return chunks.map((text) => ({ id: crypto.randomUUID(), text }));
}

export function textLibraryBlock(
    text: Pick<
        TextDocument,
        | 'title'
        | 'sourceLanguage'
        | 'targetLanguage'
        | 'sourceText'
        | 'alignment'
    >,
): LearningBlock {
    if (!text.alignment)
        return LearningBlockSchema.parse({
            id: crypto.randomUUID(),
            type: 'bilingual-text',
            title: text.title,
            language: text.sourceLanguage,
            segments: originalPassages(text.sourceText),
            translations: [],
        });
    const segments = text.alignment.source.map((segment) => ({
        id: crypto.randomUUID(),
        text: segment.text,
    }));
    return LearningBlockSchema.parse({
        id: crypto.randomUUID(),
        type: 'bilingual-text',
        title: text.title,
        language: text.sourceLanguage,
        segments,
        translations: [
            {
                language: text.targetLanguage,
                segments: segments.map((segment, index) => ({
                    sourceSegmentId: segment.id,
                    text: text.alignment!.translation[index]!.text,
                })),
            },
        ],
    });
}
