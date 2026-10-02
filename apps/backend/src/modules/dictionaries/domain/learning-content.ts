import type { DictionaryCardValues } from './limits';
import type { EffectiveCardSettings } from './settings';

export interface DictionaryLearningContent {
    values: DictionaryCardValues;
    settings: EffectiveCardSettings;
}

/** Inactive retained data is not learning content. Configuration epochs and
 * authored revisions deliberately do not participate in this representation. */
function canonicalContent({ values, settings }: DictionaryLearningContent) {
    return {
        source: values.source,
        translation: values.translation,
        definition: settings.definitionEnabled
            ? [values.definition, settings.definitionLanguageRole]
            : null,
        example: settings.exampleEnabled
            ? [values.example, settings.exampleLanguageRole]
            : null,
        exampleTranslation: settings.exampleTranslationEnabled
            ? [
                  values.exampleTranslation,
                  settings.exampleTranslationLanguageRole,
              ]
            : null,
        transcription: settings.transcriptionEnabled
            ? [
                  values.transcription,
                  settings.transcriptionNotation,
                  settings.transcriptionNotation === 'custom'
                      ? settings.customNotationLabel
                      : null,
              ]
            : null,
    };
}

export function hasLearningContentChanged(input: {
    previous: DictionaryLearningContent;
    next: DictionaryLearningContent;
}): boolean {
    return (
        JSON.stringify(canonicalContent(input.previous)) !==
        JSON.stringify(canonicalContent(input.next))
    );
}
