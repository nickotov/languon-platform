import type {
    FlashcardConfiguration,
    FlashcardField,
    FlashcardItem,
    FlashcardPresentationField,
} from '@languon/contracts';
import { getLanguage, type LanguageTag } from '@languon/languages';
import type { EffectiveCardSettings } from '../../dictionaries/domain/settings';

export const flashcardFieldOrder: readonly FlashcardField[] = [
    'source',
    'translation',
    'transcription',
    'definition',
    'sourceExample',
    'targetExample',
];
export const defaultFlashcardConfiguration: FlashcardConfiguration = {
    front: ['targetExample'],
    back: ['sourceExample'],
};
export interface FlashcardProjectionInput {
    entryId: string;
    learningVersion: number;
    sourceLanguage: LanguageTag;
    targetLanguage: LanguageTag;
    values: {
        source: string;
        translation: string;
        transcription: string | null;
        definition: string | null;
        example: string | null;
        exampleTranslation: string | null;
    };
    settings: EffectiveCardSettings;
    configuration: FlashcardConfiguration;
}

export function projectFlashcard(
    input: FlashcardProjectionInput,
): FlashcardItem | null {
    const languageFor = (role: 'source' | 'target') =>
        role === 'source' ? input.sourceLanguage : input.targetLanguage;
    const valueFor = (
        requested: FlashcardField,
    ): FlashcardPresentationField | null => {
        let text: string | null;
        let field = requested;
        let role: 'source' | 'target' = 'source';
        let fallback = false;
        switch (requested) {
            case 'source':
                text = input.values.source;
                break;
            case 'translation':
                text = input.values.translation;
                role = 'target';
                break;
            case 'transcription':
                text = input.settings.transcriptionEnabled
                    ? input.values.transcription
                    : null;
                break;
            case 'definition':
                text = input.settings.definitionEnabled
                    ? input.values.definition
                    : null;
                role = input.settings.definitionLanguageRole;
                break;
            case 'sourceExample':
            case 'targetExample': {
                role = requested === 'sourceExample' ? 'source' : 'target';
                text =
                    input.settings.exampleLanguageRole === role
                        ? input.settings.exampleEnabled
                            ? input.values.example
                            : null
                        : input.settings.exampleTranslationEnabled
                          ? input.values.exampleTranslation
                          : null;
                if (!text?.trim()) {
                    field = role === 'source' ? 'source' : 'translation';
                    text = input.values[field];
                    fallback = true;
                }
                break;
            }
        }
        if (!text?.trim()) return null;
        const language = languageFor(role);
        return {
            field,
            requestedFields: [requested],
            text,
            language,
            direction: getLanguage(language)?.direction ?? 'ltr',
            fallback,
        };
    };
    const side = (selected: FlashcardField[]): FlashcardPresentationField[] => {
        const result: FlashcardPresentationField[] = [];
        for (const field of flashcardFieldOrder) {
            if (!selected.includes(field)) continue;
            const projected = valueFor(field);
            if (!projected) continue;
            const previous = result.find(
                (candidate) => candidate.field === projected.field,
            );
            if (previous) {
                previous.requestedFields.push(field);
                previous.fallback ||= projected.fallback;
            } else result.push(projected);
        }
        return result;
    };
    const front = side(input.configuration.front);
    const back = side(input.configuration.back);
    return front.length && back.length
        ? {
              entryId: input.entryId,
              learningVersion: input.learningVersion,
              front,
              back,
          }
        : null;
}
