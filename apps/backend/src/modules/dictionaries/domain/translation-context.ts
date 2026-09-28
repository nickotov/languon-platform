import { dictionaryLimits, normalizeOptionalText } from './limits';

export function normalizeTranslationContext(
    input: string | null,
): string | null {
    return normalizeOptionalText(input, {
        field: 'translation_context',
        maximumCodePoints: dictionaryLimits.translationContextCodePoints,
    });
}

export function resolveTranslationContext(input: {
    card: string | null;
    dictionary: string | null;
}): string | null {
    return input.card ?? input.dictionary;
}
