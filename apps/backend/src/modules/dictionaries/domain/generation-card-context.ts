import { z } from 'zod';

import { dictionaryLimits } from './limits';

const boundedText = (maximum: number) =>
    z
        .string()
        .trim()
        .min(1)
        .max(maximum * 2)
        .refine(
            (value) => [...value].length <= maximum,
            `Text exceeds the ${maximum} code point limit`,
        )
        .refine(
            (value) =>
                ![...value].some((character) => {
                    const code = character.codePointAt(0)!;
                    return (
                        code <= 8 ||
                        code === 11 ||
                        code === 12 ||
                        (code >= 14 && code <= 31) ||
                        (code >= 127 && code <= 159)
                    );
                }),
            'Control characters are not allowed',
        );

export const DictionaryGenerationCardValuesSchema = z
    .object({
        definition: boundedText(
            dictionaryLimits.optionalLongValueCodePoints,
        ).nullable(),
        example: boundedText(
            dictionaryLimits.optionalLongValueCodePoints,
        ).nullable(),
        exampleTranslation: boundedText(
            dictionaryLimits.optionalLongValueCodePoints,
        ).nullable(),
        source: boundedText(dictionaryLimits.requiredCardValueCodePoints),
        transcription: boundedText(
            dictionaryLimits.optionalShortValueCodePoints,
        ).nullable(),
        translation: boundedText(dictionaryLimits.requiredCardValueCodePoints),
    })
    .strict();

export const DictionaryGenerationCardOverridesSchema = z
    .object({
        transcriptionCustomLabel: boundedText(
            dictionaryLimits.customNotationLabelCodePoints,
        ).nullable(),
        definitionEnabled: z.enum(['enabled', 'disabled']).nullable(),
        definitionLanguage: z.enum(['source', 'target']).nullable(),
        exampleEnabled: z.enum(['enabled', 'disabled']).nullable(),
        exampleLanguage: z.enum(['source', 'target']).nullable(),
        exampleTranslationEnabled: z.enum(['enabled', 'disabled']).nullable(),
        transcriptionEnabled: z.enum(['enabled', 'disabled']).nullable(),
        transcriptionNotation: z
            .enum(['ipa', 'romanization', 'custom'])
            .nullable(),
    })
    .strict();

export const DictionaryGenerationEffectiveSettingsSchema = z
    .object({
        transcriptionCustomLabel: boundedText(
            dictionaryLimits.customNotationLabelCodePoints,
        ).nullable(),
        definitionEnabled: z.boolean(),
        definitionLanguage: z.enum(['source', 'target']),
        exampleEnabled: z.boolean(),
        exampleLanguage: z.enum(['source', 'target']),
        exampleTranslationEnabled: z.boolean(),
        exampleTranslationLanguage: z.enum(['source', 'target']),
        transcriptionEnabled: z.boolean(),
        transcriptionNotation: z.enum(['ipa', 'romanization', 'custom']),
    })
    .strict();
