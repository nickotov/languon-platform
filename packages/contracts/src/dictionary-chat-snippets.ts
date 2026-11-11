import { z } from 'zod';
import {
    DictionaryCardValuesSchema,
    DictionarySettingsValuesSchema,
} from './dictionaries/models';
import {
    DictionaryLanguageTagSchema,
    DictionaryTranslationContextSchema,
    DictionaryVersionSchema,
} from './dictionaries/primitives';

export const dictionaryChatSnippetMaxCards = 100;
export const dictionaryChatSnippetDefaultCards = 10;

/** Frozen authoring context is provenance, not authority for a later write. */
export const DictionaryChatGenerationContextSchema = z
    .object({
        sourceLanguage: DictionaryLanguageTagSchema,
        targetLanguage: DictionaryLanguageTagSchema,
        translationContext: DictionaryTranslationContextSchema.nullable(),
        settings: DictionarySettingsValuesSchema,
        settingsVersion: DictionaryVersionSchema,
        dictionaryVersion: DictionaryVersionSchema,
    })
    .strict();

/** A generation brief is resolved before the author produces card values. */
export const DictionaryChatSnippetGenerationRequestSchema = z
    .object({
        request: z.string().trim().min(1).max(2_000),
        count: z
            .number()
            .int()
            .min(1)
            .max(dictionaryChatSnippetMaxCards)
            .optional(),
        sourceSnippetId: z.uuid().optional(),
    })
    .strict();

export const DictionaryChatSnippetInputSchema = z
    .object({
        title: z.string().trim().min(1).max(200),
        cards: z
            .array(DictionaryCardValuesSchema)
            .min(1)
            .max(dictionaryChatSnippetMaxCards),
    })
    .strict();

export const DictionaryChatSnippetSchema =
    DictionaryChatSnippetInputSchema.extend({
        id: z.uuid(),
        conversationId: z.uuid(),
        turnId: z.uuid(),
        dictionaryId: z.uuid(),
        generationContext: DictionaryChatGenerationContextSchema,
        createdAt: z.iso.datetime(),
    }).strict();

export const DictionaryChatSnippetsResponseSchema = z
    .object({ snippets: z.array(DictionaryChatSnippetSchema) })
    .strict();

export const DictionaryChatSnippetApplyModeSchema = z.enum([
    'append',
    'prepend',
    'replace',
]);

export const ApplyDictionaryChatSnippetRequestSchema = z
    .object({
        operationId: z.uuid(),
        mode: DictionaryChatSnippetApplyModeSchema,
        selectedIndices: z
            .array(
                z
                    .number()
                    .int()
                    .min(0)
                    .max(dictionaryChatSnippetMaxCards - 1),
            )
            .min(1)
            .max(dictionaryChatSnippetMaxCards)
            .refine((indices) => new Set(indices).size === indices.length, {
                message: 'Selected card indices must be unique.',
            }),
        expectedDictionaryVersion: DictionaryVersionSchema,
        expectedSettingsVersion: DictionaryVersionSchema,
    })
    .strict();

export const ApplyDictionaryChatSnippetResponseSchema = z
    .object({
        operationId: z.uuid(),
        dictionaryId: z.uuid(),
        cardIds: z.array(z.uuid()).min(1).max(dictionaryChatSnippetMaxCards),
        addedCount: z
            .number()
            .int()
            .positive()
            .max(dictionaryChatSnippetMaxCards),
        archivedCount: z.number().int().nonnegative(),
        duplicateCount: z
            .number()
            .int()
            .nonnegative()
            .max(dictionaryChatSnippetMaxCards),
        dictionaryVersion: DictionaryVersionSchema,
        settingsVersion: DictionaryVersionSchema,
    })
    .strict();

export type DictionaryChatGenerationContext = z.infer<
    typeof DictionaryChatGenerationContextSchema
>;
export type DictionaryChatSnippetInput = z.infer<
    typeof DictionaryChatSnippetInputSchema
>;
export type DictionaryChatSnippet = z.infer<typeof DictionaryChatSnippetSchema>;
export type DictionaryChatSnippetApplyMode = z.infer<
    typeof DictionaryChatSnippetApplyModeSchema
>;
export type ApplyDictionaryChatSnippetRequest = z.infer<
    typeof ApplyDictionaryChatSnippetRequestSchema
>;
export type ApplyDictionaryChatSnippetResponse = z.infer<
    typeof ApplyDictionaryChatSnippetResponseSchema
>;
