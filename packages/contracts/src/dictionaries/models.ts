import {
    INTERFACE_LOCALES,
    LANGUAGE_CATALOG_VERSION,
    SUPPORTED_LANGUAGE_TAGS,
} from '@languon/languages';
import { z } from 'zod';

import {
    DictionaryAuthorshipSchema,
    DictionaryCardOptionalValueSchema,
    DictionaryCardPrimaryValueSchema,
    DictionaryCustomNotationLabelSchema,
    DictionaryDescriptionSchema,
    DictionaryEnableOverrideSchema,
    DictionaryIdSchema,
    DictionaryLanguageRoleSchema,
    DictionaryLanguageTagSchema,
    DictionaryLifecycleSchema,
    DictionaryNameSchema,
    DictionaryNotationSchema,
    DictionaryShareIdSchema,
    DictionaryShareKeySchema,
    DictionaryTimestampSchema,
    DictionaryVersionSchema,
    DictionaryVisibilitySchema,
} from './primitives';

export const LanguageCatalogEntrySchema = z
    .object({
        tag: DictionaryLanguageTagSchema,
        direction: z.enum(['ltr', 'rtl']),
        displayNames: z
            .object(
                Object.fromEntries(
                    INTERFACE_LOCALES.map((locale) => [
                        locale,
                        z.string().min(1).max(100),
                    ]),
                ) as Record<(typeof INTERFACE_LOCALES)[number], z.ZodString>,
            )
            .strict(),
    })
    .strict();

export const LanguagesResponseSchema = z
    .object({
        catalogVersion: z.literal(LANGUAGE_CATALOG_VERSION),
        languages: z.array(LanguageCatalogEntrySchema).length(16),
    })
    .strict()
    .superRefine((response, context) => {
        response.languages.forEach((language, index) => {
            if (language.tag !== SUPPORTED_LANGUAGE_TAGS[index]) {
                context.addIssue({
                    code: 'custom',
                    path: ['languages', index, 'tag'],
                    message:
                        'Languages must match the catalog version canonical order',
                });
            }
        });
    });

export const DictionarySettingsValuesSchema = z
    .object({
        transcriptionEnabled: z.boolean(),
        transcriptionNotation: DictionaryNotationSchema,
        transcriptionCustomLabel:
            DictionaryCustomNotationLabelSchema.nullable(),
        definitionEnabled: z.boolean(),
        definitionLanguage: DictionaryLanguageRoleSchema,
        exampleEnabled: z.boolean(),
        exampleLanguage: DictionaryLanguageRoleSchema,
        exampleTranslationEnabled: z.boolean(),
    })
    .strict()
    .superRefine((settings, context) => {
        if (
            settings.transcriptionEnabled &&
            settings.transcriptionNotation === 'custom' &&
            settings.transcriptionCustomLabel === null
        ) {
            context.addIssue({
                code: 'custom',
                path: ['transcriptionCustomLabel'],
                message:
                    'A custom notation label is required when custom transcription is enabled',
            });
        }
    });

export const DictionarySettingsSchema = z
    .object({
        version: DictionaryVersionSchema,
        values: DictionarySettingsValuesSchema,
        updatedAt: DictionaryTimestampSchema,
    })
    .strict();

export const DictionaryCardValuesSchema = z
    .object({
        source: DictionaryCardPrimaryValueSchema,
        translation: DictionaryCardPrimaryValueSchema,
        transcription: DictionaryCardOptionalValueSchema.nullable(),
        definition: DictionaryCardOptionalValueSchema.nullable(),
        example: DictionaryCardOptionalValueSchema.nullable(),
        exampleTranslation: DictionaryCardOptionalValueSchema.nullable(),
    })
    .strict();

export const DictionaryCardOverridesSchema = z
    .object({
        transcriptionEnabled: DictionaryEnableOverrideSchema,
        transcriptionNotation: DictionaryNotationSchema.nullable(),
        transcriptionCustomLabel:
            DictionaryCustomNotationLabelSchema.nullable(),
        definitionEnabled: DictionaryEnableOverrideSchema,
        definitionLanguage: DictionaryLanguageRoleSchema.nullable(),
        exampleEnabled: DictionaryEnableOverrideSchema,
        exampleLanguage: DictionaryLanguageRoleSchema.nullable(),
        exampleTranslationEnabled: DictionaryEnableOverrideSchema,
    })
    .strict();

export const DictionaryCardEffectiveSettingsSchema = z
    .object({
        transcriptionEnabled: z.boolean(),
        transcriptionNotation: DictionaryNotationSchema,
        transcriptionCustomLabel:
            DictionaryCustomNotationLabelSchema.nullable(),
        definitionEnabled: z.boolean(),
        definitionLanguage: DictionaryLanguageRoleSchema,
        exampleEnabled: z.boolean(),
        exampleLanguage: DictionaryLanguageRoleSchema,
        exampleTranslationEnabled: z.boolean(),
        exampleTranslationLanguage: DictionaryLanguageRoleSchema,
    })
    .strict()
    .superRefine((settings, context) => {
        if (
            settings.transcriptionEnabled &&
            settings.transcriptionNotation === 'custom' &&
            settings.transcriptionCustomLabel === null
        ) {
            context.addIssue({
                code: 'custom',
                path: ['transcriptionCustomLabel'],
                message:
                    'A custom notation label is required when custom transcription is enabled',
            });
        }

        if (settings.exampleTranslationEnabled && !settings.exampleEnabled) {
            context.addIssue({
                code: 'custom',
                path: ['exampleTranslationEnabled'],
                message:
                    'Example translation cannot be effective while examples are disabled',
            });
        }

        const oppositeRole =
            settings.exampleLanguage === 'source' ? 'target' : 'source';
        if (settings.exampleTranslationLanguage !== oppositeRole) {
            context.addIssue({
                code: 'custom',
                path: ['exampleTranslationLanguage'],
                message:
                    'Example translation language must oppose the example language',
            });
        }
    });

const DictionarySummaryFieldsSchema = z
    .object({
        id: DictionaryIdSchema,
        name: DictionaryNameSchema,
        description: DictionaryDescriptionSchema.nullable(),
        sourceLanguage: DictionaryLanguageTagSchema,
        targetLanguage: DictionaryLanguageTagSchema,
        visibility: DictionaryVisibilitySchema,
        lifecycle: DictionaryLifecycleSchema,
        activeCardCount: z.number().int().min(0).max(10_000),
        languagePairLocked: z.boolean(),
        version: DictionaryVersionSchema,
        settingsVersion: DictionaryVersionSchema,
        createdAt: DictionaryTimestampSchema,
        updatedAt: DictionaryTimestampSchema,
        archivedAt: DictionaryTimestampSchema.nullable(),
    })
    .strict();

export const DictionarySummarySchema =
    DictionarySummaryFieldsSchema.superRefine((dictionary, context) => {
        if (dictionary.sourceLanguage === dictionary.targetLanguage) {
            context.addIssue({
                code: 'custom',
                path: ['targetLanguage'],
                message: 'Source and target languages must be distinct',
            });
        }
    });

export const OwnedDictionarySchema = DictionarySummaryFieldsSchema.extend({
    settings: DictionarySettingsSchema,
    sourceDictionaryId: DictionaryIdSchema.nullable(),
})
    .strict()
    .superRefine((dictionary, context) => {
        if (dictionary.sourceLanguage === dictionary.targetLanguage) {
            context.addIssue({
                code: 'custom',
                path: ['targetLanguage'],
                message: 'Source and target languages must be distinct',
            });
        }
    });

export const DictionaryCardSchema = z
    .object({
        id: DictionaryIdSchema,
        dictionaryId: DictionaryIdSchema,
        values: DictionaryCardValuesSchema,
        overrides: DictionaryCardOverridesSchema,
        effectiveSettings: DictionaryCardEffectiveSettingsSchema,
        authorship: DictionaryAuthorshipSchema,
        lifecycle: DictionaryLifecycleSchema,
        position: z.string().min(1).max(128),
        version: DictionaryVersionSchema,
        settingsVersion: DictionaryVersionSchema,
        createdAt: DictionaryTimestampSchema,
        updatedAt: DictionaryTimestampSchema,
        archivedAt: DictionaryTimestampSchema.nullable(),
    })
    .strict();

export const PublicDictionarySchema = DictionarySummaryFieldsSchema.omit({
    lifecycle: true,
    settingsVersion: true,
})
    .extend({
        visibility: z.literal('unlisted'),
        settings: DictionarySettingsValuesSchema,
        cards: z
            .array(
                DictionaryCardSchema.omit({
                    dictionaryId: true,
                    overrides: true,
                    lifecycle: true,
                    settingsVersion: true,
                    archivedAt: true,
                }),
            )
            .max(25),
    })
    .strict()
    .superRefine((dictionary, context) => {
        if (dictionary.sourceLanguage === dictionary.targetLanguage) {
            context.addIssue({
                code: 'custom',
                path: ['targetLanguage'],
                message: 'Source and target languages must be distinct',
            });
        }
    });

export const DictionaryShareCapabilitySchema = z
    .object({
        shareId: DictionaryShareIdSchema,
        shareKey: DictionaryShareKeySchema,
    })
    .strict();

export type LanguageCatalogEntry = z.infer<typeof LanguageCatalogEntrySchema>;
export type LanguagesResponse = z.infer<typeof LanguagesResponseSchema>;
export type DictionarySettingsValues = z.infer<
    typeof DictionarySettingsValuesSchema
>;
export type DictionarySettings = z.infer<typeof DictionarySettingsSchema>;
export type DictionaryCardValues = z.infer<typeof DictionaryCardValuesSchema>;
export type DictionaryCardOverrides = z.infer<
    typeof DictionaryCardOverridesSchema
>;
export type DictionaryCardEffectiveSettings = z.infer<
    typeof DictionaryCardEffectiveSettingsSchema
>;
export type DictionarySummary = z.infer<typeof DictionarySummarySchema>;
export type OwnedDictionary = z.infer<typeof OwnedDictionarySchema>;
export type DictionaryCard = z.infer<typeof DictionaryCardSchema>;
export type PublicDictionary = z.infer<typeof PublicDictionarySchema>;
export type DictionaryShareCapability = z.infer<
    typeof DictionaryShareCapabilitySchema
>;
