import { z } from 'zod';

import { DictionaryErrorResponseSchema } from './errors';
import {
    AcceptDictionaryCardAuthoringGenerationJobRequestSchema,
    EnqueueDictionaryCardAuthoringGenerationRequestSchema,
    EnqueueDictionaryCardAuthoringGenerationResponseSchema,
    RegenerateDictionaryCardAuthoringGenerationRequestSchema,
    RegenerateDictionaryCardAuthoringGenerationResponseSchema,
} from './card-authoring';
import {
    AcceptDictionaryGenerationJobResponseSchema,
    DictionaryGenerationCandidateSchema,
    DictionaryGenerationJobResponseSchema,
    DictionaryDocumentTermsGenerationJobSchema,
    DictionaryImportPairsGenerationJobSchema,
    DictionaryPastedTermsGenerationJobSchema,
    DictionarySingleCardGenerationJobSchema,
    DICTIONARY_PASTED_TERMS_GENERATION_FORMAT,
    DICTIONARY_DOCUMENT_TERMS_GENERATION_FORMAT,
    DICTIONARY_IMPORT_PAIRS_GENERATION_FORMAT,
} from './generation';
import {
    DictionaryDocumentMediaTypeSchema,
    documentIngestionLimitsV1,
} from './document-ingestion';
import {
    ExportDictionaryQuerySchema,
    ExportDictionaryResponseHeadersSchema,
    ImportDictionaryRequestSchema,
    ImportDictionaryResponseSchema,
    PreviewDictionaryImportRequestSchema,
    PreviewDictionaryImportResponseSchema,
} from './interchange';
import {
    DictionaryCardOverridesSchema,
    DictionaryCardSchema,
    DictionarySettingsValuesSchema,
    DictionaryShareCapabilitySchema,
    DictionarySummarySchema,
    LanguagesResponseSchema,
    OwnedDictionarySchema,
    PublicDictionarySchema,
} from './models';
import {
    DictionaryCardIdParamsSchema,
    DictionaryCardOptionalValueSchema,
    DictionaryCardPrimaryValueSchema,
    DictionaryCursorSchema,
    DictionaryCustomNotationLabelSchema,
    DictionaryDescriptionSchema,
    DictionaryEnableOverrideSchema,
    DictionaryGenerationInstructionSchema,
    DictionaryGenerationJobIdParamsSchema,
    DictionaryIdempotencyHeadersSchema,
    DictionaryIdParamsSchema,
    DictionaryIdSchema,
    DictionaryLanguageRoleSchema,
    DictionaryLanguageTagSchema,
    DictionaryLifecycleSchema,
    DictionaryNameSchema,
    DictionaryNotationSchema,
    DictionaryPageSizeSchema,
    DictionaryPublicPageSizeSchema,
    DictionarySearchSchema,
    DictionaryShareKeyHeadersSchema,
    DictionaryVersionSchema,
    EmptyDictionaryBodySchema,
    SharedDictionaryParamsSchema,
} from './primitives';

const DictionarySettingsPatchSchema = z
    .object({
        transcriptionEnabled: z.boolean().optional(),
        transcriptionNotation: DictionaryNotationSchema.optional(),
        transcriptionCustomLabel:
            DictionaryCustomNotationLabelSchema.nullable().optional(),
        definitionEnabled: z.boolean().optional(),
        definitionLanguage: DictionaryLanguageRoleSchema.optional(),
        exampleEnabled: z.boolean().optional(),
        exampleLanguage: DictionaryLanguageRoleSchema.optional(),
        exampleTranslationEnabled: z.boolean().optional(),
    })
    .strict()
    .superRefine((settings, context) => {
        if (Object.keys(settings).length === 0) {
            context.addIssue({
                code: 'custom',
                message: 'Settings patch must contain at least one change',
            });
        }

        if (
            settings.exampleEnabled === false &&
            settings.exampleTranslationEnabled === true
        ) {
            context.addIssue({
                code: 'custom',
                path: ['exampleTranslationEnabled'],
                message:
                    'Example translation cannot be enabled while examples are disabled',
            });
        }

        if (
            settings.transcriptionEnabled === true &&
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

const DictionarySettingsInputValuesSchema =
    DictionarySettingsValuesSchema.superRefine((settings, context) => {
        if (settings.exampleTranslationEnabled && !settings.exampleEnabled) {
            context.addIssue({
                code: 'custom',
                path: ['exampleTranslationEnabled'],
                message:
                    'Example translation cannot be enabled while examples are disabled',
            });
        }
    });

export const ListDictionariesQuerySchema = z
    .object({
        cursor: DictionaryCursorSchema.optional(),
        limit: DictionaryPageSizeSchema.default(25),
        lifecycle: DictionaryLifecycleSchema.default('active'),
        search: DictionarySearchSchema.optional(),
    })
    .strict();

export const ListDictionariesResponseSchema = z
    .object({
        data: z.array(DictionarySummarySchema).max(100),
        nextCursor: DictionaryCursorSchema.nullable(),
    })
    .strict();

export const CreateDictionaryRequestSchema = z
    .object({
        name: DictionaryNameSchema,
        description: DictionaryDescriptionSchema.nullable().default(null),
        sourceLanguage: DictionaryLanguageTagSchema,
        targetLanguage: DictionaryLanguageTagSchema,
        settings: DictionarySettingsInputValuesSchema.optional(),
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

export const DictionaryResponseSchema = z
    .object({ dictionary: OwnedDictionarySchema })
    .strict();

export const UpdateDictionaryRequestSchema = z
    .object({
        expectedDictionaryVersion: DictionaryVersionSchema,
        expectedSettingsVersion: DictionaryVersionSchema.optional(),
        name: DictionaryNameSchema.optional(),
        description: DictionaryDescriptionSchema.nullable().optional(),
        sourceLanguage: DictionaryLanguageTagSchema.optional(),
        targetLanguage: DictionaryLanguageTagSchema.optional(),
        visibility: z.literal('private').optional(),
        settings: DictionarySettingsPatchSchema.optional(),
    })
    .strict()
    .superRefine((request, context) => {
        const hasDictionaryChange =
            request.name !== undefined ||
            request.description !== undefined ||
            request.sourceLanguage !== undefined ||
            request.targetLanguage !== undefined ||
            request.visibility !== undefined;

        if (!hasDictionaryChange && request.settings === undefined) {
            context.addIssue({
                code: 'custom',
                message: 'Dictionary update must contain at least one change',
            });
        }

        if (
            request.settings !== undefined &&
            request.expectedSettingsVersion === undefined
        ) {
            context.addIssue({
                code: 'custom',
                path: ['expectedSettingsVersion'],
                message:
                    'Settings updates require the expected settings version',
            });
        }

        if (
            request.sourceLanguage !== undefined &&
            request.sourceLanguage === request.targetLanguage
        ) {
            context.addIssue({
                code: 'custom',
                path: ['targetLanguage'],
                message: 'Source and target languages must be distinct',
            });
        }
    });

export const DictionaryLifecycleMutationRequestSchema = z
    .object({ expectedDictionaryVersion: DictionaryVersionSchema })
    .strict();

export const ListDictionaryCardsQuerySchema = z
    .object({
        cursor: DictionaryCursorSchema.optional(),
        limit: DictionaryPageSizeSchema.default(50),
        lifecycle: DictionaryLifecycleSchema.default('active'),
        search: DictionarySearchSchema.optional(),
    })
    .strict();

export const ListDictionaryCardsResponseSchema = z
    .object({
        data: z.array(DictionaryCardSchema).max(100),
        nextCursor: DictionaryCursorSchema.nullable(),
        dictionaryVersion: DictionaryVersionSchema,
        settingsVersion: DictionaryVersionSchema,
    })
    .strict();

export const ListSharedDictionaryQuerySchema = z
    .object({
        cursor: DictionaryCursorSchema.optional(),
        limit: DictionaryPublicPageSizeSchema.default(25),
    })
    .strict();

const DictionaryCardInputValuesSchema = z
    .object({
        source: DictionaryCardPrimaryValueSchema,
        translation: DictionaryCardPrimaryValueSchema,
        transcription:
            DictionaryCardOptionalValueSchema.nullable().default(null),
        definition: DictionaryCardOptionalValueSchema.nullable().default(null),
        example: DictionaryCardOptionalValueSchema.nullable().default(null),
        exampleTranslation:
            DictionaryCardOptionalValueSchema.nullable().default(null),
    })
    .strict();

const EMPTY_DICTIONARY_CARD_OVERRIDES = {
    transcriptionEnabled: null,
    transcriptionNotation: null,
    transcriptionCustomLabel: null,
    definitionEnabled: null,
    definitionLanguage: null,
    exampleEnabled: null,
    exampleLanguage: null,
    exampleTranslationEnabled: null,
} as const;

const DictionaryCardInputOverridesSchema =
    DictionaryCardOverridesSchema.default(EMPTY_DICTIONARY_CARD_OVERRIDES);

export const CreateDictionaryCardRequestSchema = z
    .object({
        expectedDictionaryVersion: DictionaryVersionSchema,
        expectedSettingsVersion: DictionaryVersionSchema,
        values: DictionaryCardInputValuesSchema,
        overrides: DictionaryCardInputOverridesSchema,
    })
    .strict();

export const DictionaryCardResponseSchema = z
    .object({
        card: DictionaryCardSchema,
        dictionaryVersion: DictionaryVersionSchema,
        duplicateSource: z.boolean().optional(),
    })
    .strict();

const DictionaryCardValuesPatchSchema = z
    .object({
        source: DictionaryCardPrimaryValueSchema.optional(),
        translation: DictionaryCardPrimaryValueSchema.optional(),
        transcription: DictionaryCardOptionalValueSchema.nullable().optional(),
        definition: DictionaryCardOptionalValueSchema.nullable().optional(),
        example: DictionaryCardOptionalValueSchema.nullable().optional(),
        exampleTranslation:
            DictionaryCardOptionalValueSchema.nullable().optional(),
    })
    .strict();

const DictionaryCardOverridesPatchSchema = z
    .object({
        transcriptionEnabled: DictionaryEnableOverrideSchema.optional(),
        transcriptionNotation: DictionaryNotationSchema.nullable().optional(),
        transcriptionCustomLabel:
            DictionaryCustomNotationLabelSchema.nullable().optional(),
        definitionEnabled: DictionaryEnableOverrideSchema.optional(),
        definitionLanguage: DictionaryLanguageRoleSchema.nullable().optional(),
        exampleEnabled: DictionaryEnableOverrideSchema.optional(),
        exampleLanguage: DictionaryLanguageRoleSchema.nullable().optional(),
        exampleTranslationEnabled: DictionaryEnableOverrideSchema.optional(),
    })
    .strict();

export const UpdateDictionaryCardRequestSchema = z
    .object({
        expectedDictionaryVersion: DictionaryVersionSchema,
        expectedSettingsVersion: DictionaryVersionSchema,
        expectedCardVersion: DictionaryVersionSchema,
        values: DictionaryCardValuesPatchSchema.optional(),
        overrides: DictionaryCardOverridesPatchSchema.optional(),
    })
    .strict()
    .superRefine((request, context) => {
        if (
            (request.values === undefined ||
                Object.keys(request.values).length === 0) &&
            (request.overrides === undefined ||
                Object.keys(request.overrides).length === 0)
        ) {
            context.addIssue({
                code: 'custom',
                message: 'Card update must contain at least one change',
            });
        }
    });

export const DictionaryCardLifecycleMutationRequestSchema = z
    .object({
        expectedDictionaryVersion: DictionaryVersionSchema,
        expectedCardVersion: DictionaryVersionSchema,
    })
    .strict();

export const ReorderDictionaryCardsRequestSchema = z
    .object({
        expectedDictionaryVersion: DictionaryVersionSchema,
        orderedCardIds: z
            .array(DictionaryIdSchema)
            .min(1)
            .max(10_000)
            .superRefine((cardIds, context) => {
                if (new Set(cardIds).size !== cardIds.length) {
                    context.addIssue({
                        code: 'custom',
                        message: 'Ordered card IDs must be unique',
                    });
                }
            })
            .describe(
                'The complete desired order for one contiguous window of active cards.',
            ),
    })
    .strict();

export const ReorderDictionaryCardsResponseSchema = z
    .object({ dictionaryVersion: DictionaryVersionSchema })
    .strict();

export const RotateDictionaryShareKeyRequestSchema = z
    .object({ expectedDictionaryVersion: DictionaryVersionSchema })
    .strict();

export const RotateDictionaryShareKeyResponseSchema = z
    .object({
        dictionary: OwnedDictionarySchema,
        capability: DictionaryShareCapabilitySchema,
    })
    .strict();

export const SharedDictionaryResponseSchema = z
    .object({
        dictionary: PublicDictionarySchema,
        nextCursor: DictionaryCursorSchema.nullable(),
    })
    .strict();

export const ForkSharedDictionaryRequestSchema = z
    .object({ name: DictionaryNameSchema.optional() })
    .strict();

export const ForkSharedDictionaryResponseSchema = z
    .object({ dictionary: OwnedDictionarySchema })
    .strict();

export const ReadDictionaryGenerationCapabilitiesResponseSchema = z
    .object({
        singleCardGeneration: z.object({ available: z.boolean() }).strict(),
        cardAuthoringGeneration: z.object({ available: z.boolean() }).strict(),
        pastedTermsGeneration: z.object({ available: z.boolean() }).strict(),
        importPairsGeneration: z.object({ available: z.boolean() }).strict(),
        documentTermsGeneration: z.object({ available: z.boolean() }).strict(),
        documentOcr: z.object({ available: z.boolean() }).strict(),
    })
    .strict();

export const EnqueueDictionaryCardGenerationRequestSchema = z
    .object({
        expectedDictionaryVersion: DictionaryVersionSchema,
        expectedSettingsVersion: DictionaryVersionSchema,
        expectedCardVersion: DictionaryVersionSchema,
        instruction:
            DictionaryGenerationInstructionSchema.nullable().default(null),
    })
    .strict();

export const EnqueueDictionaryCardGenerationResponseSchema = z
    .object({ job: DictionarySingleCardGenerationJobSchema })
    .strict();

const DictionaryPastedTermsTextSchema = z
    .string()
    .trim()
    .superRefine((value, context) => {
        const codePoints = Array.from(value);
        if (codePoints.length < 1 || codePoints.length > 20_200) {
            context.addIssue({
                code: 'custom',
                message:
                    'Pasted terms must contain between 1 and 20,200 Unicode code points',
            });
        }
        if (
            codePoints.some((character) => {
                const codePoint = character.codePointAt(0);
                return (
                    codePoint !== undefined &&
                    (codePoint <= 9 ||
                        codePoint === 11 ||
                        codePoint === 12 ||
                        (codePoint >= 14 && codePoint <= 31) ||
                        (codePoint >= 127 && codePoint <= 159))
                );
            })
        ) {
            context.addIssue({
                code: 'custom',
                message:
                    'Pasted terms contain an unsupported control character',
            });
        }
    });

export const EnqueueDictionaryPastedTermsGenerationRequestSchema = z
    .object({
        expectedDictionaryVersion: DictionaryVersionSchema,
        expectedSettingsVersion: DictionaryVersionSchema,
        text: DictionaryPastedTermsTextSchema,
        context: DictionaryGenerationInstructionSchema.nullable().default(null),
    })
    .strict();

export const EnqueueDictionaryPastedTermsGenerationResponseSchema = z
    .object({ job: DictionaryPastedTermsGenerationJobSchema })
    .strict();

export const RetryDictionaryPastedTermsGenerationRequestSchema = z
    .object({
        expectedDictionaryVersion: DictionaryVersionSchema,
        expectedSettingsVersion: DictionaryVersionSchema,
        rowIndexes: z
            .array(z.number().int().min(0).max(99))
            .min(1)
            .max(100)
            .superRefine((rowIndexes, context) => {
                if (new Set(rowIndexes).size !== rowIndexes.length) {
                    context.addIssue({
                        code: 'custom',
                        message: 'Retry row indexes must be unique',
                    });
                }
            }),
    })
    .strict();

export const RetryDictionaryPastedTermsGenerationResponseSchema = z
    .object({ job: DictionaryPastedTermsGenerationJobSchema })
    .strict();

export const RetryDictionaryImportPairsGenerationRequestSchema = z
    .object({
        expectedDictionaryVersion: DictionaryVersionSchema,
        expectedSettingsVersion: DictionaryVersionSchema,
        rowIndexes: z
            .array(z.number().int().min(0).max(9_999))
            .min(1)
            .max(100)
            .superRefine((rowIndexes, context) => {
                if (new Set(rowIndexes).size !== rowIndexes.length)
                    context.addIssue({
                        code: 'custom',
                        message: 'Retry row indexes must be unique',
                    });
            }),
    })
    .strict();

export const RetryDictionaryImportPairsGenerationResponseSchema = z
    .object({ job: DictionaryImportPairsGenerationJobSchema })
    .strict();

export const RetryDictionaryDocumentTermsGenerationRequestSchema =
    RetryDictionaryPastedTermsGenerationRequestSchema;

export const RetryDictionaryDocumentTermsGenerationResponseSchema = z
    .object({ job: DictionaryPastedTermsGenerationJobSchema })
    .strict();

export const DictionaryDocumentUploadIdParamsSchema = z
    .object({ uploadId: DictionaryIdSchema })
    .strict();

export const CreateDictionaryDocumentUploadRequestSchema = z
    .object({
        expectedDictionaryVersion: DictionaryVersionSchema,
        expectedSettingsVersion: DictionaryVersionSchema,
        instruction:
            DictionaryGenerationInstructionSchema.nullable().default(null),
        mediaType: DictionaryDocumentMediaTypeSchema,
        sizeBytes: z
            .number()
            .int()
            .min(1)
            .max(documentIngestionLimitsV1.upload.maximumFileBytes),
        sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    })
    .strict();

const DictionaryDocumentRequiredHeadersSchema = z
    .record(
        z
            .string()
            .regex(/^[a-z0-9-]+$/u)
            .max(128),
        z
            .string()
            .max(1_024)
            .refine(
                (value) =>
                    ![...value].some((character) => {
                        const codePoint = character.codePointAt(0)!;
                        return (
                            codePoint <= 31 ||
                            (codePoint >= 127 && codePoint <= 159)
                        );
                    }),
                'Upload capability header values cannot contain control characters',
            ),
    )
    .superRefine((headers, context) => {
        if (Object.keys(headers).length > 16) {
            context.addIssue({
                code: 'custom',
                message: 'Upload capability headers exceed the bounded limit',
            });
        }
    });

export const DictionaryDocumentUploadCapabilitySchema = z
    .object({
        id: DictionaryIdSchema,
        method: z.literal('PUT'),
        url: z.string().url().max(4_096),
        expiresAt: z.string().datetime({ offset: true }),
        requiredHeaders: DictionaryDocumentRequiredHeadersSchema,
    })
    .strict();

export const CreateDictionaryDocumentUploadResponseSchema = z
    .object({
        job: DictionaryDocumentTermsGenerationJobSchema,
        upload: DictionaryDocumentUploadCapabilitySchema,
    })
    .strict();

export const CompleteDictionaryDocumentUploadRequestSchema = z
    .object({
        versionId: z.string().trim().min(1).max(1_024).optional(),
    })
    .strict();

export const CompleteDictionaryDocumentUploadResponseSchema = z
    .object({ job: DictionaryDocumentTermsGenerationJobSchema })
    .strict();

export const ReadLatestDictionaryCardGenerationResponseSchema = z
    .object({
        job: DictionarySingleCardGenerationJobSchema.nullable(),
    })
    .strict();

export const CancelDictionaryGenerationJobRequestSchema =
    EmptyDictionaryBodySchema;
export const CancelDictionaryGenerationJobResponseSchema =
    DictionaryGenerationJobResponseSchema;

export const DiscardDictionaryGenerationJobRequestSchema =
    EmptyDictionaryBodySchema;
export const DiscardDictionaryGenerationJobResponseSchema =
    DictionaryGenerationJobResponseSchema;

export const AcceptDictionarySingleCardGenerationJobRequestSchema = z
    .object({ candidate: DictionaryGenerationCandidateSchema })
    .strict();

const DictionaryPastedTermsGenerationSelectionSchema = z
    .object({
        rowIndex: z.number().int().min(0).max(99),
        candidate: DictionaryGenerationCandidateSchema,
    })
    .strict();

export const AcceptDictionaryPastedTermsGenerationJobRequestSchema = z
    .object({
        format: z.literal(DICTIONARY_PASTED_TERMS_GENERATION_FORMAT),
        selected: z
            .array(DictionaryPastedTermsGenerationSelectionSchema)
            .min(1)
            .max(100)
            .superRefine((selected, context) => {
                if (
                    new Set(selected.map((row) => row.rowIndex)).size !==
                    selected.length
                ) {
                    context.addIssue({
                        code: 'custom',
                        message: 'Selected row indexes must be unique',
                    });
                }
            }),
    })
    .strict();

export const AcceptDictionaryDocumentTermsGenerationJobRequestSchema = z
    .object({
        format: z.literal(DICTIONARY_DOCUMENT_TERMS_GENERATION_FORMAT),
        selected: z
            .array(DictionaryPastedTermsGenerationSelectionSchema)
            .min(1)
            .max(100)
            .superRefine((selected, context) => {
                if (
                    new Set(selected.map((row) => row.rowIndex)).size !==
                    selected.length
                ) {
                    context.addIssue({
                        code: 'custom',
                        message: 'Selected row indexes must be unique',
                    });
                }
            }),
    })
    .strict();

export const AcceptDictionaryImportPairsGenerationJobRequestSchema = z
    .object({
        format: z.literal(DICTIONARY_IMPORT_PAIRS_GENERATION_FORMAT),
        selected: z
            .array(
                DictionaryPastedTermsGenerationSelectionSchema.extend({
                    rowIndex: z.number().int().min(0).max(9_999),
                }),
            )
            .min(1)
            .max(100)
            .superRefine((selected, context) => {
                if (
                    new Set(selected.map((row) => row.rowIndex)).size !==
                    selected.length
                )
                    context.addIssue({
                        code: 'custom',
                        message: 'Selected row indexes must be unique',
                    });
            }),
    })
    .strict();

export const AcceptDictionaryGenerationJobRequestSchema = z.union([
    AcceptDictionarySingleCardGenerationJobRequestSchema,
    AcceptDictionaryCardAuthoringGenerationJobRequestSchema,
    AcceptDictionaryPastedTermsGenerationJobRequestSchema,
    AcceptDictionaryImportPairsGenerationJobRequestSchema,
    AcceptDictionaryDocumentTermsGenerationJobRequestSchema,
]);

export const RegenerateDictionaryGenerationJobRequestSchema =
    EnqueueDictionaryCardGenerationRequestSchema;
export const RegenerateDictionaryGenerationJobResponseSchema =
    DictionaryGenerationJobResponseSchema;

export const DictionaryEndpointSchemas = {
    listLanguages: {
        response: LanguagesResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    readDictionaryGenerationCapabilities: {
        response: ReadDictionaryGenerationCapabilitiesResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    listDictionaries: {
        query: ListDictionariesQuerySchema,
        response: ListDictionariesResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    createDictionary: {
        headers: DictionaryIdempotencyHeadersSchema,
        body: CreateDictionaryRequestSchema,
        response: DictionaryResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    readDictionary: {
        params: DictionaryIdParamsSchema,
        response: DictionaryResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    updateDictionary: {
        params: DictionaryIdParamsSchema,
        body: UpdateDictionaryRequestSchema,
        response: DictionaryResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    archiveDictionary: {
        params: DictionaryIdParamsSchema,
        body: DictionaryLifecycleMutationRequestSchema,
        response: DictionaryResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    restoreDictionary: {
        params: DictionaryIdParamsSchema,
        body: DictionaryLifecycleMutationRequestSchema,
        response: DictionaryResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    previewDictionaryImport: {
        body: PreviewDictionaryImportRequestSchema,
        response: PreviewDictionaryImportResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    importDictionary: {
        headers: DictionaryIdempotencyHeadersSchema,
        body: ImportDictionaryRequestSchema,
        response: ImportDictionaryResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    exportDictionary: {
        params: DictionaryIdParamsSchema,
        query: ExportDictionaryQuerySchema,
        responseHeaders: ExportDictionaryResponseHeadersSchema,
        error: DictionaryErrorResponseSchema,
    },
    listDictionaryCards: {
        params: DictionaryIdParamsSchema,
        query: ListDictionaryCardsQuerySchema,
        response: ListDictionaryCardsResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    createDictionaryCard: {
        params: DictionaryIdParamsSchema,
        body: CreateDictionaryCardRequestSchema,
        response: DictionaryCardResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    readDictionaryCard: {
        params: DictionaryCardIdParamsSchema,
        response: DictionaryCardResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    updateDictionaryCard: {
        params: DictionaryCardIdParamsSchema,
        body: UpdateDictionaryCardRequestSchema,
        response: DictionaryCardResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    archiveDictionaryCard: {
        params: DictionaryCardIdParamsSchema,
        body: DictionaryCardLifecycleMutationRequestSchema,
        response: DictionaryCardResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    restoreDictionaryCard: {
        params: DictionaryCardIdParamsSchema,
        body: DictionaryCardLifecycleMutationRequestSchema,
        response: DictionaryCardResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    reorderDictionaryCards: {
        params: DictionaryIdParamsSchema,
        body: ReorderDictionaryCardsRequestSchema,
        response: ReorderDictionaryCardsResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    rotateDictionaryShareKey: {
        params: DictionaryIdParamsSchema,
        body: RotateDictionaryShareKeyRequestSchema,
        response: RotateDictionaryShareKeyResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    readSharedDictionary: {
        params: SharedDictionaryParamsSchema,
        headers: DictionaryShareKeyHeadersSchema,
        query: ListSharedDictionaryQuerySchema,
        response: SharedDictionaryResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    forkSharedDictionary: {
        params: SharedDictionaryParamsSchema,
        headers: DictionaryShareKeyHeadersSchema.merge(
            DictionaryIdempotencyHeadersSchema,
        ),
        body: ForkSharedDictionaryRequestSchema,
        response: ForkSharedDictionaryResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    enqueueDictionaryCardGeneration: {
        params: DictionaryCardIdParamsSchema,
        headers: DictionaryIdempotencyHeadersSchema,
        body: EnqueueDictionaryCardGenerationRequestSchema,
        response: EnqueueDictionaryCardGenerationResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    enqueueDictionaryCardAuthoringGeneration: {
        params: DictionaryIdParamsSchema,
        headers: DictionaryIdempotencyHeadersSchema,
        body: EnqueueDictionaryCardAuthoringGenerationRequestSchema,
        response: EnqueueDictionaryCardAuthoringGenerationResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    enqueueDictionaryPastedTermsGeneration: {
        params: DictionaryIdParamsSchema,
        headers: DictionaryIdempotencyHeadersSchema,
        body: EnqueueDictionaryPastedTermsGenerationRequestSchema,
        response: EnqueueDictionaryPastedTermsGenerationResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    retryDictionaryPastedTermsGeneration: {
        params: DictionaryGenerationJobIdParamsSchema,
        headers: DictionaryIdempotencyHeadersSchema,
        body: RetryDictionaryPastedTermsGenerationRequestSchema,
        response: RetryDictionaryPastedTermsGenerationResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    retryDictionaryImportPairsGeneration: {
        params: DictionaryGenerationJobIdParamsSchema,
        headers: DictionaryIdempotencyHeadersSchema,
        body: RetryDictionaryImportPairsGenerationRequestSchema,
        response: RetryDictionaryImportPairsGenerationResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    retryDictionaryDocumentTermsGeneration: {
        params: DictionaryGenerationJobIdParamsSchema,
        headers: DictionaryIdempotencyHeadersSchema,
        body: RetryDictionaryDocumentTermsGenerationRequestSchema,
        response: RetryDictionaryDocumentTermsGenerationResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    createDictionaryDocumentUpload: {
        params: DictionaryIdParamsSchema,
        headers: DictionaryIdempotencyHeadersSchema,
        body: CreateDictionaryDocumentUploadRequestSchema,
        response: CreateDictionaryDocumentUploadResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    completeDictionaryDocumentUpload: {
        params: DictionaryDocumentUploadIdParamsSchema,
        body: CompleteDictionaryDocumentUploadRequestSchema,
        response: CompleteDictionaryDocumentUploadResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    readLatestDictionaryCardGeneration: {
        params: DictionaryCardIdParamsSchema,
        response: ReadLatestDictionaryCardGenerationResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    readDictionaryGenerationJob: {
        params: DictionaryGenerationJobIdParamsSchema,
        response: DictionaryGenerationJobResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    cancelDictionaryGenerationJob: {
        params: DictionaryGenerationJobIdParamsSchema,
        body: CancelDictionaryGenerationJobRequestSchema,
        response: CancelDictionaryGenerationJobResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    discardDictionaryGenerationJob: {
        params: DictionaryGenerationJobIdParamsSchema,
        body: DiscardDictionaryGenerationJobRequestSchema,
        response: DiscardDictionaryGenerationJobResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    acceptDictionaryGenerationJob: {
        params: DictionaryGenerationJobIdParamsSchema,
        body: AcceptDictionaryGenerationJobRequestSchema,
        response: AcceptDictionaryGenerationJobResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    regenerateDictionaryGenerationJob: {
        params: DictionaryGenerationJobIdParamsSchema,
        headers: DictionaryIdempotencyHeadersSchema,
        body: RegenerateDictionaryGenerationJobRequestSchema,
        response: RegenerateDictionaryGenerationJobResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
    regenerateDictionaryCardAuthoringGeneration: {
        params: DictionaryGenerationJobIdParamsSchema,
        headers: DictionaryIdempotencyHeadersSchema,
        body: RegenerateDictionaryCardAuthoringGenerationRequestSchema,
        response: RegenerateDictionaryCardAuthoringGenerationResponseSchema,
        error: DictionaryErrorResponseSchema,
    },
} as const;

export const DictionaryEndpointInventory = [
    {
        name: 'listLanguages',
        method: 'GET',
        path: '/languages',
        access: 'public',
    },
    {
        name: 'readDictionaryGenerationCapabilities',
        method: 'GET',
        path: '/dictionary-generation-capabilities',
        access: 'owner',
    },
    {
        name: 'listDictionaries',
        method: 'GET',
        path: '/dictionaries',
        access: 'owner',
    },
    {
        name: 'createDictionary',
        method: 'POST',
        path: '/dictionaries',
        access: 'owner',
    },
    {
        name: 'readDictionary',
        method: 'GET',
        path: '/dictionaries/:dictionaryId',
        access: 'owner',
    },
    {
        name: 'updateDictionary',
        method: 'PATCH',
        path: '/dictionaries/:dictionaryId',
        access: 'owner',
    },
    {
        name: 'archiveDictionary',
        method: 'POST',
        path: '/dictionaries/:dictionaryId/archive',
        access: 'owner',
    },
    {
        name: 'restoreDictionary',
        method: 'POST',
        path: '/dictionaries/:dictionaryId/restore',
        access: 'owner',
    },
    {
        name: 'previewDictionaryImport',
        method: 'POST',
        path: '/dictionary-imports/preview',
        access: 'owner',
    },
    {
        name: 'importDictionary',
        method: 'POST',
        path: '/dictionary-imports',
        access: 'owner',
    },
    {
        name: 'exportDictionary',
        method: 'GET',
        path: '/dictionaries/:dictionaryId/export',
        access: 'owner',
    },
    {
        name: 'listDictionaryCards',
        method: 'GET',
        path: '/dictionaries/:dictionaryId/cards',
        access: 'owner',
    },
    {
        name: 'createDictionaryCard',
        method: 'POST',
        path: '/dictionaries/:dictionaryId/cards',
        access: 'owner',
    },
    {
        name: 'readDictionaryCard',
        method: 'GET',
        path: '/dictionaries/:dictionaryId/cards/:cardId',
        access: 'owner',
    },
    {
        name: 'updateDictionaryCard',
        method: 'PATCH',
        path: '/dictionaries/:dictionaryId/cards/:cardId',
        access: 'owner',
    },
    {
        name: 'archiveDictionaryCard',
        method: 'POST',
        path: '/dictionaries/:dictionaryId/cards/:cardId/archive',
        access: 'owner',
    },
    {
        name: 'restoreDictionaryCard',
        method: 'POST',
        path: '/dictionaries/:dictionaryId/cards/:cardId/restore',
        access: 'owner',
    },
    {
        name: 'reorderDictionaryCards',
        method: 'POST',
        path: '/dictionaries/:dictionaryId/cards/reorder',
        access: 'owner',
    },
    {
        name: 'rotateDictionaryShareKey',
        method: 'POST',
        path: '/dictionaries/:dictionaryId/share-key/rotate',
        access: 'owner',
    },
    {
        name: 'readSharedDictionary',
        method: 'GET',
        path: '/shared/dictionaries/:shareId',
        access: 'capability',
    },
    {
        name: 'forkSharedDictionary',
        method: 'POST',
        path: '/shared/dictionaries/:shareId/fork',
        access: 'owner+capability',
    },
    {
        name: 'enqueueDictionaryCardGeneration',
        method: 'POST',
        path: '/dictionaries/:dictionaryId/cards/:cardId/generations',
        access: 'owner',
    },
    {
        name: 'enqueueDictionaryCardAuthoringGeneration',
        method: 'POST',
        path: '/dictionaries/:dictionaryId/card-authoring-generations',
        access: 'owner',
    },
    {
        name: 'enqueueDictionaryPastedTermsGeneration',
        method: 'POST',
        path: '/dictionaries/:dictionaryId/batch-generations',
        access: 'owner',
    },
    {
        name: 'retryDictionaryPastedTermsGeneration',
        method: 'POST',
        path: '/dictionary-generation-jobs/:jobId/retry-pasted-terms',
        access: 'owner',
    },
    {
        name: 'retryDictionaryImportPairsGeneration',
        method: 'POST',
        path: '/dictionary-generation-jobs/:jobId/retry-import-pairs',
        access: 'owner',
    },
    {
        name: 'retryDictionaryDocumentTermsGeneration',
        method: 'POST',
        path: '/dictionary-generation-jobs/:jobId/retry-document-terms',
        access: 'owner',
    },
    {
        name: 'createDictionaryDocumentUpload',
        method: 'POST',
        path: '/dictionaries/:dictionaryId/document-uploads',
        access: 'owner',
    },
    {
        name: 'completeDictionaryDocumentUpload',
        method: 'POST',
        path: '/dictionary-document-uploads/:uploadId/complete',
        access: 'owner',
    },
    {
        name: 'readLatestDictionaryCardGeneration',
        method: 'GET',
        path: '/dictionaries/:dictionaryId/cards/:cardId/generations/latest',
        access: 'owner',
    },
    {
        name: 'readDictionaryGenerationJob',
        method: 'GET',
        path: '/dictionary-generation-jobs/:jobId',
        access: 'owner',
    },
    {
        name: 'cancelDictionaryGenerationJob',
        method: 'POST',
        path: '/dictionary-generation-jobs/:jobId/cancel',
        access: 'owner',
    },
    {
        name: 'discardDictionaryGenerationJob',
        method: 'POST',
        path: '/dictionary-generation-jobs/:jobId/discard',
        access: 'owner',
    },
    {
        name: 'acceptDictionaryGenerationJob',
        method: 'POST',
        path: '/dictionary-generation-jobs/:jobId/accept',
        access: 'owner',
    },
    {
        name: 'regenerateDictionaryGenerationJob',
        method: 'POST',
        path: '/dictionary-generation-jobs/:jobId/regenerate',
        access: 'owner',
    },
    {
        name: 'regenerateDictionaryCardAuthoringGeneration',
        method: 'POST',
        path: '/dictionary-generation-jobs/:jobId/regenerate-card-authoring',
        access: 'owner',
    },
] as const;

export type ListDictionariesQuery = z.infer<typeof ListDictionariesQuerySchema>;
export type ReadDictionaryGenerationCapabilitiesResponse = z.infer<
    typeof ReadDictionaryGenerationCapabilitiesResponseSchema
>;
export type ListDictionariesResponse = z.infer<
    typeof ListDictionariesResponseSchema
>;
export type CreateDictionaryRequest = z.infer<
    typeof CreateDictionaryRequestSchema
>;
export type DictionaryResponse = z.infer<typeof DictionaryResponseSchema>;
export type UpdateDictionaryRequest = z.infer<
    typeof UpdateDictionaryRequestSchema
>;
export type DictionaryLifecycleMutationRequest = z.infer<
    typeof DictionaryLifecycleMutationRequestSchema
>;
export type ListDictionaryCardsQuery = z.infer<
    typeof ListDictionaryCardsQuerySchema
>;
export type ListSharedDictionaryQuery = z.infer<
    typeof ListSharedDictionaryQuerySchema
>;
export type ListDictionaryCardsResponse = z.infer<
    typeof ListDictionaryCardsResponseSchema
>;
export type CreateDictionaryCardRequest = z.infer<
    typeof CreateDictionaryCardRequestSchema
>;
export type DictionaryCardResponse = z.infer<
    typeof DictionaryCardResponseSchema
>;
export type UpdateDictionaryCardRequest = z.infer<
    typeof UpdateDictionaryCardRequestSchema
>;
export type DictionaryCardLifecycleMutationRequest = z.infer<
    typeof DictionaryCardLifecycleMutationRequestSchema
>;
export type ReorderDictionaryCardsRequest = z.infer<
    typeof ReorderDictionaryCardsRequestSchema
>;
export type ReorderDictionaryCardsResponse = z.infer<
    typeof ReorderDictionaryCardsResponseSchema
>;
export type RotateDictionaryShareKeyRequest = z.infer<
    typeof RotateDictionaryShareKeyRequestSchema
>;
export type RotateDictionaryShareKeyResponse = z.infer<
    typeof RotateDictionaryShareKeyResponseSchema
>;
export type SharedDictionaryResponse = z.infer<
    typeof SharedDictionaryResponseSchema
>;
export type ForkSharedDictionaryRequest = z.infer<
    typeof ForkSharedDictionaryRequestSchema
>;
export type ForkSharedDictionaryResponse = z.infer<
    typeof ForkSharedDictionaryResponseSchema
>;
export type EnqueueDictionaryCardGenerationRequest = z.infer<
    typeof EnqueueDictionaryCardGenerationRequestSchema
>;
export type EnqueueDictionaryCardGenerationResponse = z.infer<
    typeof EnqueueDictionaryCardGenerationResponseSchema
>;
export type EnqueueDictionaryCardAuthoringGenerationRequest = z.infer<
    typeof EnqueueDictionaryCardAuthoringGenerationRequestSchema
>;
export type EnqueueDictionaryCardAuthoringGenerationResponse = z.infer<
    typeof EnqueueDictionaryCardAuthoringGenerationResponseSchema
>;
export type RegenerateDictionaryCardAuthoringGenerationRequest = z.infer<
    typeof RegenerateDictionaryCardAuthoringGenerationRequestSchema
>;
export type RegenerateDictionaryCardAuthoringGenerationResponse = z.infer<
    typeof RegenerateDictionaryCardAuthoringGenerationResponseSchema
>;
export type EnqueueDictionaryPastedTermsGenerationRequest = z.infer<
    typeof EnqueueDictionaryPastedTermsGenerationRequestSchema
>;
export type EnqueueDictionaryPastedTermsGenerationResponse = z.infer<
    typeof EnqueueDictionaryPastedTermsGenerationResponseSchema
>;
export type RetryDictionaryPastedTermsGenerationRequest = z.infer<
    typeof RetryDictionaryPastedTermsGenerationRequestSchema
>;
export type RetryDictionaryPastedTermsGenerationResponse = z.infer<
    typeof RetryDictionaryPastedTermsGenerationResponseSchema
>;
export type RetryDictionaryImportPairsGenerationRequest = z.infer<
    typeof RetryDictionaryImportPairsGenerationRequestSchema
>;
export type RetryDictionaryImportPairsGenerationResponse = z.infer<
    typeof RetryDictionaryImportPairsGenerationResponseSchema
>;
export type RetryDictionaryDocumentTermsGenerationRequest = z.infer<
    typeof RetryDictionaryDocumentTermsGenerationRequestSchema
>;
export type RetryDictionaryDocumentTermsGenerationResponse = z.infer<
    typeof RetryDictionaryDocumentTermsGenerationResponseSchema
>;
export type CreateDictionaryDocumentUploadRequest = z.infer<
    typeof CreateDictionaryDocumentUploadRequestSchema
>;
export type CreateDictionaryDocumentUploadResponse = z.infer<
    typeof CreateDictionaryDocumentUploadResponseSchema
>;
export type CompleteDictionaryDocumentUploadRequest = z.infer<
    typeof CompleteDictionaryDocumentUploadRequestSchema
>;
export type CompleteDictionaryDocumentUploadResponse = z.infer<
    typeof CompleteDictionaryDocumentUploadResponseSchema
>;
export type ReadLatestDictionaryCardGenerationResponse = z.infer<
    typeof ReadLatestDictionaryCardGenerationResponseSchema
>;
export type CancelDictionaryGenerationJobRequest = z.infer<
    typeof CancelDictionaryGenerationJobRequestSchema
>;
export type CancelDictionaryGenerationJobResponse = z.infer<
    typeof CancelDictionaryGenerationJobResponseSchema
>;
export type DiscardDictionaryGenerationJobRequest = z.infer<
    typeof DiscardDictionaryGenerationJobRequestSchema
>;
export type DiscardDictionaryGenerationJobResponse = z.infer<
    typeof DiscardDictionaryGenerationJobResponseSchema
>;
export type AcceptDictionaryGenerationJobRequest = z.infer<
    typeof AcceptDictionaryGenerationJobRequestSchema
>;
export type AcceptDictionarySingleCardGenerationJobRequest = z.infer<
    typeof AcceptDictionarySingleCardGenerationJobRequestSchema
>;
export type AcceptDictionaryCardAuthoringGenerationJobRequest = z.infer<
    typeof AcceptDictionaryCardAuthoringGenerationJobRequestSchema
>;
export type AcceptDictionaryPastedTermsGenerationJobRequest = z.infer<
    typeof AcceptDictionaryPastedTermsGenerationJobRequestSchema
>;
export type AcceptDictionaryImportPairsGenerationJobRequest = z.infer<
    typeof AcceptDictionaryImportPairsGenerationJobRequestSchema
>;
export type AcceptDictionaryDocumentTermsGenerationJobRequest = z.infer<
    typeof AcceptDictionaryDocumentTermsGenerationJobRequestSchema
>;
export type RegenerateDictionaryGenerationJobRequest = z.infer<
    typeof RegenerateDictionaryGenerationJobRequestSchema
>;
export type RegenerateDictionaryGenerationJobResponse = z.infer<
    typeof RegenerateDictionaryGenerationJobResponseSchema
>;
export type DictionaryEndpointName =
    (typeof DictionaryEndpointInventory)[number]['name'];

export { EmptyDictionaryBodySchema };
