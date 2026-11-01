import type { BlockFormReadContext } from './block-form-read-context';

export function readGrammarBlock(context: BlockFormReadContext): unknown {
    const { value, optional, rows, common } = context;
    const kind = 'grammar';

    const examples = rows('examples', ['text', 'translation']).map((row) => ({
        text: row.text,
        ...(row.translation ? { translation: row.translation } : {}),
    }));
    const mistakes = rows('mistakes', [
        'incorrect',
        'correct',
        'explanation',
    ]).map((row) => ({
        incorrect: row.incorrect,
        correct: row.correct,
        ...(row.explanation ? { explanation: row.explanation } : {}),
    }));

    const candidate = {
        ...common,
        type: kind,
        language: value('language'),
        ...(optional('rule') ? { rule: value('rule') } : {}),
        ...(optional('pattern') ? { pattern: value('pattern') } : {}),
        ...(examples.length ? { examples } : {}),
        ...(mistakes.length ? { commonMistakes: mistakes } : {}),
    };

    return candidate;
}

export function readVocabularyBlock(context: BlockFormReadContext): unknown {
    const { value, rows, common, previous } = context;
    const kind = 'vocabulary';

    const old = previous?.type === kind ? previous : undefined;
    const candidate = {
        ...common,
        type: kind,
        language: value('language'),
        translationLanguage: value('translationLanguage'),
        entries: rows('entries', [
            'id',
            'term',
            'translation',
            'pronunciation',
            'definition',
            'example',
            'exampleTranslation',
        ]).map((row, index) => ({
            id: row.id || old?.entries[index]?.id || crypto.randomUUID(),
            term: row.term,
            translation: row.translation,
            ...(row.definition ? { definition: row.definition } : {}),
            ...(row.pronunciation ? { pronunciation: row.pronunciation } : {}),
            ...(row.example ? { example: row.example } : {}),
            ...(row.exampleTranslation
                ? { exampleTranslation: row.exampleTranslation }
                : {}),
        })),
    };

    return candidate;
}

export function readBilingualBlock(context: BlockFormReadContext): unknown {
    const { value, rows, common, previous, preparedDrafts } = context;
    const kind = 'bilingual-text';

    const old = previous?.type === kind ? previous : undefined;
    const passages = rows('segments', ['id', 'text', 'translation']);
    const segments = passages.map((row, index) => ({
        id: row.id || old?.segments[index]?.id || crypto.randomUUID(),
        text: row.text,
    }));
    const translated = passages.some((row) => row.translation?.trim());
    const editedLanguage = value('translationLanguage');
    const prior = preparedDrafts ?? old?.translations ?? [];
    const translations = prior.map((translation) => ({
        language: translation.language,
        segments: segments.map((segment) => ({
            sourceSegmentId: segment.id,
            text:
                translation.segments.find(
                    (item) => item.sourceSegmentId === segment.id,
                )?.text ?? '',
        })),
    }));
    const index = translations.findIndex(
        (translation) =>
            translation.language.toLowerCase() === editedLanguage.toLowerCase(),
    );
    const replacement = {
        language: index >= 0 ? translations[index]!.language : editedLanguage,
        segments: passages.map((row, index) => ({
            sourceSegmentId: segments[index]!.id,
            text: row.translation ?? '',
        })),
    };

    if (index >= 0) {
        translations[index] = replacement;
    } else if (translated) {
        translations.push(replacement);
    }

    const candidate = {
        ...common,
        type: kind,
        language: value('language'),
        segments,
        translations,
    };

    return candidate;
}
