import type {
    DictionarySettingsValues,
    OwnedDictionary,
} from '@languon/contracts';
import type { SaveDictionarySettings } from '../types';

export function changedSettings(
    original: DictionarySettingsValues,
    current: DictionarySettingsValues,
): NonNullable<SaveDictionarySettings['settings']> {
    const patch: Partial<DictionarySettingsValues> = {};
    for (const key of Object.keys(current) as Array<
        keyof DictionarySettingsValues
    >) {
        if (current[key] !== original[key]) {
            Object.assign(patch, { [key]: current[key] });
        }
    }
    return patch;
}

export function valuesFrom(dictionary: OwnedDictionary) {
    return {
        description: dictionary.description ?? '',
        name: dictionary.name,
        settings: { ...dictionary.settings.values },
        sourceLanguage: dictionary.sourceLanguage,
        targetLanguage: dictionary.targetLanguage,
        translationContext: dictionary.translationContext ?? '',
    };
}
