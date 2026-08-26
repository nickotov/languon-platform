import { z } from 'zod';

import {
    DictionaryCardIdSchema,
    DictionaryDescriptionSchema,
    DictionaryIdSchema,
    DictionaryLanguageTagSchema,
    DictionaryNameSchema,
    DictionaryVersionSchema,
} from './primitives';
import { DictionaryCardSchema, OwnedDictionarySchema } from './models';
import { DictionaryImportPairsGenerationJobSchema } from './generation';

export const dictionaryInterchangeLimitsV1 = {
    maximumColumns: 100,
    maximumInputUtf8Bytes: 1 * 1_024 * 1_024,
    maximumPreviewRows: 100,
    maximumRows: 10_000,
    maximumCellCodePoints: 8_192,
    maximumExportUtf8Bytes: 320 * 1_024 * 1_024,
} as const;

export const dictionaryLanguonCsvFormatVersion = 'languon-csv:v1' as const;
export const dictionaryExportFormats = [
    'quizlet-text',
    'quizlet-csv',
    dictionaryLanguonCsvFormatVersion,
] as const;

export const dictionaryLanguonCsvV1Headers = [
    'record_type',
    'languon_format_version',
    'dictionary_name',
    'dictionary_name_formula_escaped',
    'dictionary_description',
    'dictionary_description_formula_escaped',
    'source_language',
    'target_language',
    'dictionary_transcription_enabled',
    'dictionary_transcription_notation',
    'dictionary_transcription_custom_label',
    'dictionary_transcription_custom_label_formula_escaped',
    'dictionary_definition_enabled',
    'dictionary_definition_language',
    'dictionary_example_enabled',
    'dictionary_example_language',
    'dictionary_example_translation_enabled',
    'position',
    'source',
    'source_formula_escaped',
    'translation',
    'translation_formula_escaped',
    'transcription',
    'transcription_formula_escaped',
    'definition',
    'definition_formula_escaped',
    'example',
    'example_formula_escaped',
    'example_translation',
    'example_translation_formula_escaped',
    'override_transcription_enabled',
    'override_transcription_notation',
    'override_transcription_custom_label',
    'override_transcription_custom_label_formula_escaped',
    'override_transcription_custom_label_inherited',
    'override_definition_enabled',
    'override_definition_language',
    'override_example_enabled',
    'override_example_language',
    'override_example_translation_enabled',
    'effective_transcription_enabled',
    'effective_transcription_notation',
    'effective_transcription_custom_label',
    'effective_transcription_custom_label_formula_escaped',
    'effective_definition_enabled',
    'effective_definition_language',
    'effective_example_enabled',
    'effective_example_language',
    'effective_example_translation_enabled',
    'effective_example_translation_language',
    'authorship',
] as const;

const DictionaryImportContentSchema = z
    .string()
    .superRefine((value, context) => {
        if (
            new TextEncoder().encode(value).byteLength >
            dictionaryInterchangeLimitsV1.maximumInputUtf8Bytes
        )
            context.addIssue({
                code: 'custom',
                message: 'Import content exceeds the UTF-8 byte limit',
            });
        if (value.includes('\0'))
            context.addIssue({
                code: 'custom',
                message: 'Import content contains a NUL character',
            });
        for (let index = 0; index < value.length; index += 1) {
            const unit = value.charCodeAt(index);
            const previous = value.charCodeAt(index - 1);
            const next = value.charCodeAt(index + 1);
            const loneSurrogate =
                (unit >= 0xd800 &&
                    unit <= 0xdbff &&
                    !(next >= 0xdc00 && next <= 0xdfff)) ||
                (unit >= 0xdc00 &&
                    unit <= 0xdfff &&
                    !(previous >= 0xd800 && previous <= 0xdbff));
            const disallowedControl =
                ((unit >= 0 && unit <= 31) || (unit >= 127 && unit <= 159)) &&
                unit !== 9 &&
                unit !== 10 &&
                unit !== 13;
            if (loneSurrogate || disallowedControl) {
                context.addIssue({
                    code: 'custom',
                    message: 'Import content contains invalid text characters',
                });
                break;
            }
        }
    });

export const DictionaryImportDelimiterSchema = z.enum(['comma', 'tab']);
export const DictionaryExportFormatSchema = z.enum(dictionaryExportFormats);

export const DictionaryImportOptionsSchema = z
    .object({
        delimiter: DictionaryImportDelimiterSchema,
        hasHeader: z.boolean(),
        sourceColumnIndex: z
            .number()
            .int()
            .min(0)
            .max(dictionaryInterchangeLimitsV1.maximumColumns - 1),
        targetColumnIndex: z
            .number()
            .int()
            .min(0)
            .max(dictionaryInterchangeLimitsV1.maximumColumns - 1),
    })
    .strict()
    .superRefine((options, context) => {
        if (options.sourceColumnIndex === options.targetColumnIndex)
            context.addIssue({
                code: 'custom',
                path: ['targetColumnIndex'],
                message: 'Source and target columns must be distinct',
            });
    });

const DictionaryImportPayloadFieldsSchema = z
    .object({
        content: DictionaryImportContentSchema,
        options: DictionaryImportOptionsSchema,
    })
    .strict();

export const DictionaryImportRowFailureCodeSchema = z.enum([
    'cell_too_long',
    'invalid_source',
    'invalid_translation',
    'malformed_row',
    'missing_column',
    'too_many_columns',
]);

export const DictionaryImportRowFailureSchema = z
    .object({
        code: DictionaryImportRowFailureCodeSchema,
        message: z.string().min(1).max(200),
        rowIndex: z.number().int().min(0).max(9_999),
    })
    .strict();

export const DictionaryImportRowWarningSchema = z
    .object({
        code: z.literal('duplicate_source'),
        duplicateCardId: DictionaryCardIdSchema.nullable(),
        duplicateRowIndex: z.number().int().min(0).max(9_999).nullable(),
        message: z.string().min(1).max(200),
        rowIndex: z.number().int().min(0).max(9_999),
    })
    .strict()
    .superRefine((warning, context) => {
        if (
            Number(warning.duplicateCardId !== null) +
                Number(warning.duplicateRowIndex !== null) !==
            1
        )
            context.addIssue({
                code: 'custom',
                message:
                    'A duplicate warning must reference exactly one prior row or retained card',
            });
    });

export const DictionaryImportPreviewColumnSchema = z
    .object({
        heading: z.string().max(500).nullable(),
        index: z.number().int().min(0).max(99),
        samples: z.array(z.string().max(500)).max(3),
    })
    .strict();

export const DictionaryImportPreviewRowSchema = z
    .object({
        rowIndex: z.number().int().min(0).max(9_999),
        source: z.string().max(200).nullable(),
        translation: z.string().max(200).nullable(),
    })
    .strict();

export const PreviewDictionaryImportResponseSchema = z
    .object({
        capacity: z
            .object({
                remainingRows: z.number().int().min(0).max(10_000),
                wouldExceed: z.boolean(),
            })
            .strict(),
        columns: z
            .array(DictionaryImportPreviewColumnSchema)
            .max(dictionaryInterchangeLimitsV1.maximumColumns),
        failures: z
            .array(DictionaryImportRowFailureSchema)
            .max(dictionaryInterchangeLimitsV1.maximumPreviewRows),
        rows: z
            .array(DictionaryImportPreviewRowSchema)
            .max(dictionaryInterchangeLimitsV1.maximumPreviewRows),
        summary: z
            .object({
                duplicateRows: z.number().int().min(0).max(10_000),
                failureRows: z.number().int().min(0).max(10_000),
                readyRows: z.number().int().min(0).max(10_000),
                totalRows: z.number().int().min(0).max(10_000),
                truncated: z.boolean(),
            })
            .strict(),
        warnings: z
            .array(DictionaryImportRowWarningSchema)
            .max(dictionaryInterchangeLimitsV1.maximumPreviewRows),
    })
    .strict()
    .superRefine((response, context) => {
        if (
            response.capacity.wouldExceed !==
            response.summary.readyRows > response.capacity.remainingRows
        )
            context.addIssue({
                code: 'custom',
                path: ['capacity', 'wouldExceed'],
                message: 'Preview capacity must match the ready row count',
            });
    });

export const DictionaryImportTargetSchema = z.discriminatedUnion('kind', [
    z
        .object({
            description: DictionaryDescriptionSchema.nullable().default(null),
            kind: z.literal('new'),
            name: DictionaryNameSchema,
            sourceLanguage: DictionaryLanguageTagSchema,
            targetLanguage: DictionaryLanguageTagSchema,
        })
        .strict()
        .superRefine((target, context) => {
            if (target.sourceLanguage === target.targetLanguage)
                context.addIssue({
                    code: 'custom',
                    path: ['targetLanguage'],
                    message: 'Source and target languages must be distinct',
                });
        }),
    z
        .object({
            dictionaryId: DictionaryIdSchema,
            expectedDictionaryVersion: DictionaryVersionSchema,
            expectedSettingsVersion: DictionaryVersionSchema,
            kind: z.literal('existing'),
        })
        .strict(),
]);

export const DictionaryImportEnrichmentSchema = z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('none') }).strict(),
    z
        .object({
            instruction: z.string().trim().min(1).max(1_000).nullable(),
            mode: z.literal('ai'),
            selectedRowIndexes: z
                .array(z.number().int().min(0).max(9_999))
                .min(1)
                .max(100)
                .superRefine((indexes, context) => {
                    if (new Set(indexes).size !== indexes.length)
                        context.addIssue({
                            code: 'custom',
                            message: 'Selected row indexes must be unique',
                        });
                }),
        })
        .strict(),
]);

export const PreviewDictionaryImportRequestSchema =
    DictionaryImportPayloadFieldsSchema.safeExtend({
        target: DictionaryImportTargetSchema,
    }).strict();

export const ImportDictionaryRequestSchema =
    DictionaryImportPayloadFieldsSchema.safeExtend({
        enrichment: DictionaryImportEnrichmentSchema.default({ mode: 'none' }),
        target: DictionaryImportTargetSchema,
    }).strict();

export const DictionaryImportedCardSchema = z
    .object({
        cardId: DictionaryCardIdSchema,
        cardVersion: DictionaryVersionSchema,
        position: z.string().min(1).max(128),
        rowIndex: z.number().int().min(0).max(9_999),
    })
    .strict();

export const DictionaryDeterministicImportResponseSchema = z
    .object({
        cards: z
            .array(DictionaryImportedCardSchema)
            .max(dictionaryInterchangeLimitsV1.maximumRows),
        dictionary: OwnedDictionarySchema,
        mode: z.literal('deterministic'),
        warnings: z
            .array(DictionaryImportRowWarningSchema)
            .max(dictionaryInterchangeLimitsV1.maximumRows),
    })
    .strict();

export const DictionaryAiImportResponseSchema = z
    .object({
        dictionary: OwnedDictionarySchema,
        job: DictionaryImportPairsGenerationJobSchema,
        mode: z.literal('ai'),
    })
    .strict();

export const ImportDictionaryResponseSchema = z.discriminatedUnion('mode', [
    DictionaryDeterministicImportResponseSchema,
    DictionaryAiImportResponseSchema,
]);

export const ExportDictionaryQuerySchema = z
    .object({ format: DictionaryExportFormatSchema })
    .strict();

export const ExportDictionaryResponseHeadersSchema = z
    .object({
        'cache-control': z.literal('private, no-store'),
        'content-disposition': z
            .string()
            .min(1)
            .max(260)
            .regex(/^attachment; filename="[A-Za-z0-9._-]+"$/u),
        'content-type': z.enum([
            'text/csv; charset=utf-8',
            'text/plain; charset=utf-8',
        ]),
        'referrer-policy': z.literal('no-referrer'),
        'x-content-type-options': z.literal('nosniff'),
    })
    .strict();

export const DictionaryExportStreamMetadataSchema = z
    .object({
        contentType: z.enum([
            'text/csv; charset=utf-8',
            'text/plain; charset=utf-8',
        ]),
        filename: z
            .string()
            .min(1)
            .max(200)
            .regex(/^[A-Za-z0-9._-]+$/u),
        format: DictionaryExportFormatSchema,
        maximumBytes: z.literal(
            dictionaryInterchangeLimitsV1.maximumExportUtf8Bytes,
        ),
    })
    .strict();

export const DictionaryInterchangeExportCardSchema = DictionaryCardSchema;

export type DictionaryImportDelimiter = z.infer<
    typeof DictionaryImportDelimiterSchema
>;
export type DictionaryImportOptions = z.infer<
    typeof DictionaryImportOptionsSchema
>;
export type DictionaryImportRowFailure = z.infer<
    typeof DictionaryImportRowFailureSchema
>;
export type DictionaryImportRowWarning = z.infer<
    typeof DictionaryImportRowWarningSchema
>;
export type PreviewDictionaryImportRequest = z.infer<
    typeof PreviewDictionaryImportRequestSchema
>;
export type PreviewDictionaryImportResponse = z.infer<
    typeof PreviewDictionaryImportResponseSchema
>;
export type DictionaryImportTarget = z.infer<
    typeof DictionaryImportTargetSchema
>;
export type DictionaryImportEnrichment = z.infer<
    typeof DictionaryImportEnrichmentSchema
>;
export type ImportDictionaryRequest = z.infer<
    typeof ImportDictionaryRequestSchema
>;
export type ImportDictionaryResponse = z.infer<
    typeof ImportDictionaryResponseSchema
>;
export type DictionaryDeterministicImportResponse = z.infer<
    typeof DictionaryDeterministicImportResponseSchema
>;
export type DictionaryAiImportResponse = z.infer<
    typeof DictionaryAiImportResponseSchema
>;
export type DictionaryExportFormat = z.infer<
    typeof DictionaryExportFormatSchema
>;
export type ExportDictionaryResponseHeaders = z.infer<
    typeof ExportDictionaryResponseHeadersSchema
>;
export type DictionaryExportStreamMetadata = z.infer<
    typeof DictionaryExportStreamMetadataSchema
>;
