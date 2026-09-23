import type {
    DictionaryCardOverrides,
    DictionaryGenerationField,
    DictionarySingleCardGenerationJob,
    OwnedDictionary,
} from '@languon/contracts';
import { languageForRole } from '@/fsd/entities/dictionary';
import type { useI18n } from '@/fsd/shared/i18n';

export const FIELD_KEYS = [
    'source',
    'translation',
    'transcription',
    'definition',
    'example',
    'exampleTranslation',
] as const satisfies readonly DictionaryGenerationField[];

type Translate = ReturnType<typeof useI18n>['t'];

export function fieldLabel(
    field: DictionaryGenerationField,
    t: Translate,
): string {
    const keys = {
        definition: 'dictionary.field.definition',
        example: 'dictionary.field.example',
        exampleTranslation: 'dictionary.field.exampleTranslation',
        source: 'dictionary.field.source',
        transcription: 'dictionary.field.transcription',
        translation: 'dictionary.field.translation',
    } as const;
    return t(keys[field]);
}

export function terminalStateMessageKey(
    state: DictionarySingleCardGenerationJob['state'],
) {
    const keys = {
        accepted: 'dictionary.generation.state.accepted',
        cancelled: 'dictionary.generation.state.cancelled',
        discarded: 'dictionary.generation.state.discarded',
        expired: 'dictionary.generation.state.expired',
    } as const;
    return keys[state as keyof typeof keys];
}

export function fieldLanguage(
    field: DictionaryGenerationField,
    overrides: DictionaryCardOverrides,
    job: DictionarySingleCardGenerationJob,
) {
    if (field === 'source' || field === 'transcription')
        return job.sourceLanguage;
    if (field === 'translation') return job.targetLanguage;
    const original = job.originalSnapshot!;
    if (field === 'definition') {
        return languageForRole(
            overrides.definitionLanguage ??
                original.effectiveSettings.definitionLanguage,
            job.sourceLanguage,
            job.targetLanguage,
        );
    }
    const exampleRole =
        overrides.exampleLanguage ?? original.effectiveSettings.exampleLanguage;
    return languageForRole(
        field === 'example'
            ? exampleRole
            : exampleRole === 'source'
              ? 'target'
              : 'source',
        job.sourceLanguage,
        job.targetLanguage,
    );
}

export function originalFieldLanguage(
    field: DictionaryGenerationField,
    dictionary: Pick<OwnedDictionary, 'sourceLanguage' | 'targetLanguage'>,
    effectiveSettings: NonNullable<
        DictionarySingleCardGenerationJob['originalSnapshot']
    >['effectiveSettings'],
) {
    if (field === 'source' || field === 'transcription')
        return dictionary.sourceLanguage;
    if (field === 'translation') return dictionary.targetLanguage;
    if (field === 'definition') {
        return languageForRole(
            effectiveSettings.definitionLanguage,
            dictionary.sourceLanguage,
            dictionary.targetLanguage,
        );
    }
    return languageForRole(
        field === 'example'
            ? effectiveSettings.exampleLanguage
            : effectiveSettings.exampleTranslationLanguage,
        dictionary.sourceLanguage,
        dictionary.targetLanguage,
    );
}
