import { z } from 'zod';

const enablement = z.enum(['enabled', 'disabled']).nullable();
const role = z.enum(['source', 'target']);
const notation = z.enum(['ipa', 'romanization', 'custom']);

const commonSnapshotFields = {
    authorship: z.enum(['human', 'ai-generated', 'mixed']),
    cardVersion: z.number().int().positive(),
    effectiveSettings: z
        .object({
            customNotationLabel: z.string().nullable(),
            definitionEnabled: z.boolean(),
            definitionLanguageRole: role,
            exampleEnabled: z.boolean(),
            exampleLanguageRole: role,
            exampleTranslationEnabled: z.boolean(),
            exampleTranslationLanguageRole: role,
            transcriptionEnabled: z.boolean(),
            transcriptionNotation: notation,
        })
        .strict(),
    rawOverrides: z
        .object({
            customNotationLabel: z.string().nullable(),
            definitionEnabled: enablement,
            definitionLanguageRole: role.nullable(),
            exampleEnabled: enablement,
            exampleLanguageRole: role.nullable(),
            exampleTranslationEnabled: enablement,
            transcriptionEnabled: enablement,
            transcriptionNotation: notation.nullable(),
        })
        .strict(),
    settingsVersion: z.number().int().positive(),
    values: z
        .object({
            definition: z.string().nullable(),
            example: z.string().nullable(),
            exampleTranslation: z.string().nullable(),
            source: z.string().min(1),
            transcription: z.string().nullable(),
            translation: z.string().min(1),
        })
        .strict(),
};

const DictionaryCardRevisionSnapshotV1Schema = z
    .object({
        ...commonSnapshotFields,
        schemaVersion: z.literal(1),
    })
    .strict();

const DictionaryCardRevisionSnapshotV2Schema = z
    .object({
        ...commonSnapshotFields,
        effectiveTranslationContext: z.string().nullable(),
        rawTranslationContext: z.string().nullable(),
        schemaVersion: z.literal(2),
    })
    .strict();

export const DictionaryCardRevisionSnapshotSchema = z.discriminatedUnion(
    'schemaVersion',
    [
        DictionaryCardRevisionSnapshotV1Schema,
        DictionaryCardRevisionSnapshotV2Schema,
    ],
);
