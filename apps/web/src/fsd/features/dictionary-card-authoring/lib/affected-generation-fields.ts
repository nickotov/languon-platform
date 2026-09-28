import type { DictionaryCardEffectiveSettings } from '@languon/contracts';
import type { DictionaryCardAuthoringField } from '../types';

type GenerationScope =
    { kind: 'all' } | { kind: 'field'; field: DictionaryCardAuthoringField };

function isEnabled(
    field: DictionaryCardAuthoringField,
    settings: DictionaryCardEffectiveSettings,
) {
    if (field === 'source' || field === 'translation') return true;
    if (field === 'transcription') return settings.transcriptionEnabled;
    if (field === 'definition') return settings.definitionEnabled;
    if (field === 'example') return settings.exampleEnabled;
    return settings.exampleTranslationEnabled;
}

export function isFieldAffectedByGeneration(
    field: DictionaryCardAuthoringField,
    scope: GenerationScope | null,
    settings: DictionaryCardEffectiveSettings,
    format: 'card-authoring:v1' | 'card-authoring:v2' | undefined,
) {
    if (!scope || !isEnabled(field, settings)) return false;
    if (scope.kind === 'all') return true;
    if (format !== 'card-authoring:v2') return field === scope.field;
    if (scope.field === 'translation') return field !== 'source';
    if (scope.field === 'example')
        return field === 'example' || field === 'exampleTranslation';
    return field === scope.field;
}
