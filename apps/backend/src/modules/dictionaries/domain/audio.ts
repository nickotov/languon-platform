import type {
    DictionaryAudioField,
    DictionaryCard,
    OwnedDictionary,
} from '@languon/contracts';

/** Owner interruption never proves an upstream request was not submitted. */
export function audioJobStateAfterOwnerInterruption(state: string): string {
    if (state === 'queued') return 'cancelled';
    if (['ready', 'failed', 'cancelled'].includes(state)) return state;
    return 'submission_unknown';
}

export function resolveDictionaryAudio(
    dictionary: OwnedDictionary,
    card: DictionaryCard,
    field: DictionaryAudioField,
): { text: string; language: string } | null {
    if (dictionary.lifecycle !== 'active' || card.lifecycle !== 'active')
        return null;
    if (field === 'example' && !card.effectiveSettings.exampleEnabled)
        return null;
    if (
        field === 'exampleTranslation' &&
        !card.effectiveSettings.exampleTranslationEnabled
    )
        return null;
    const text = card.values[field];
    if (!text?.trim() || [...text].length > 2000) return null;
    const role =
        field === 'source'
            ? 'source'
            : field === 'translation'
              ? 'target'
              : field === 'example'
                ? card.effectiveSettings.exampleLanguage
                : card.effectiveSettings.exampleTranslationLanguage;
    return {
        text,
        language:
            role === 'source'
                ? dictionary.sourceLanguage
                : dictionary.targetLanguage,
    };
}
