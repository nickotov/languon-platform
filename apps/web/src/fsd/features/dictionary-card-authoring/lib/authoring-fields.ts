import type {
    DictionaryCardEffectiveSettings,
    DictionaryLanguageRole,
} from '@languon/contracts';
import type { DictionaryCardAuthoringField } from '../types';

export function authoringFieldRole(
    field: DictionaryCardAuthoringField,
    effective: DictionaryCardEffectiveSettings,
): DictionaryLanguageRole {
    if (field === 'translation') {
        return 'target';
    }

    if (field === 'definition') {
        return effective.definitionLanguage;
    }

    if (field === 'example') {
        return effective.exampleLanguage;
    }

    if (field === 'exampleTranslation') {
        return effective.exampleTranslationLanguage;
    }

    return 'source';
}

export function optionalAuthoringFields(
    effective: DictionaryCardEffectiveSettings,
): DictionaryCardAuthoringField[] {
    const fields: DictionaryCardAuthoringField[] = [];
    if (effective.transcriptionEnabled) {
        fields.push('transcription');
    }

    if (effective.definitionEnabled) {
        fields.push('definition');
    }

    if (effective.exampleEnabled) {
        fields.push('example');
    }

    if (effective.exampleTranslationEnabled) {
        fields.push('exampleTranslation');
    }

    return fields;
}
