import type { DictionaryCard, OwnedDictionary } from '@languon/contracts';

export function generatedStoryCard(
    dictionary: OwnedDictionary,
): DictionaryCard {
    return {
        archivedAt: null,
        authorship: 'mixed',
        createdAt: dictionary.createdAt,
        dictionaryId: dictionary.id,
        effectiveSettings: {
            ...dictionary.settings.values,
            exampleTranslationLanguage: 'target',
        },
        id: '20000000-0000-4000-8000-000000000001',
        lifecycle: 'active',
        overrides: {
            definitionEnabled: null,
            definitionLanguage: null,
            exampleEnabled: null,
            exampleLanguage: null,
            exampleTranslationEnabled: null,
            transcriptionCustomLabel: null,
            transcriptionEnabled: null,
            transcriptionNotation: null,
        },
        position: '1000',
        settingsVersion: dictionary.settingsVersion,
        translationContext: null,
        updatedAt: dictionary.updatedAt,
        values: {
            definition: null,
            example: 'The artist chose video as a curatorial medium.',
            exampleTranslation:
                'La artista eligió el vídeo como medio curatorial.',
            source: 'curatorial medium',
            transcription: null,
            translation:
                'medio curatorial con una traducción deliberadamente larga que debe ajustarse sin desbordamiento',
        },
        version: 2,
    };
}
