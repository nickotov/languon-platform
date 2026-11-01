import type {
    DictionaryGenerationCandidate,
    DictionaryGenerationField,
    OwnedDictionary,
} from '@languon/contracts';
import { languageForRole } from '@/fsd/entities/dictionary';

export const EDITABLE_FIELDS = [
    'source',
    'translation',
    'transcription',
    'definition',
    'example',
    'exampleTranslation',
] satisfies readonly DictionaryGenerationField[];

export type CandidateDraft = {
    candidate: DictionaryGenerationCandidate;
    input: string;
    rowIndex: number;
};

export function fieldLanguage(
    field: DictionaryGenerationField,
    dictionary: OwnedDictionary,
    candidate: DictionaryGenerationCandidate,
) {
    if (field === 'translation') {
        return dictionary.targetLanguage;
    }

    if (field === 'definition') {
        return languageForRole(
            candidate.overrides.definitionLanguage ??
                dictionary.settings.values.definitionLanguage,
            dictionary.sourceLanguage,
            dictionary.targetLanguage,
        );
    }

    if (field === 'example' || field === 'exampleTranslation') {
        const exampleRole =
            candidate.overrides.exampleLanguage ??
            dictionary.settings.values.exampleLanguage;

        const translationRole = exampleRole === 'source' ? 'target' : 'source';
        const role = field === 'example' ? exampleRole : translationRole;

        return languageForRole(
            role,
            dictionary.sourceLanguage,
            dictionary.targetLanguage,
        );
    }

    return dictionary.sourceLanguage;
}

export function fieldEnabled(
    field: DictionaryGenerationField,
    dictionary: OwnedDictionary,
    candidate: DictionaryGenerationCandidate,
) {
    const settings = dictionary.settings.values;

    const overrides = candidate.overrides;

    if (field === 'source' || field === 'translation') {
        return true;
    }

    if (field === 'transcription') {
        return overrides.transcriptionEnabled ?? settings.transcriptionEnabled;
    }

    if (field === 'definition') {
        return overrides.definitionEnabled ?? settings.definitionEnabled;
    }

    const exampleEnabled = overrides.exampleEnabled ?? settings.exampleEnabled;

    if (field === 'example') {
        return exampleEnabled;
    }

    return (
        exampleEnabled &&
        (overrides.exampleTranslationEnabled ??
            settings.exampleTranslationEnabled)
    );
}

export function candidateForCommit(
    dictionary: OwnedDictionary,
    candidate: DictionaryGenerationCandidate,
): DictionaryGenerationCandidate {
    return {
        ...candidate,
        values: {
            ...candidate.values,
            transcription: fieldEnabled('transcription', dictionary, candidate)
                ? candidate.values.transcription
                : null,
            definition: fieldEnabled('definition', dictionary, candidate)
                ? candidate.values.definition
                : null,
            example: fieldEnabled('example', dictionary, candidate)
                ? candidate.values.example
                : null,
            exampleTranslation: fieldEnabled(
                'exampleTranslation',
                dictionary,
                candidate,
            )
                ? candidate.values.exampleTranslation
                : null,
        },
    };
}
