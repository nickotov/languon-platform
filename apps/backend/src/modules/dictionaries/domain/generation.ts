import { z } from 'zod';

import { dictionaryLimits } from './limits';
import {
    dictionaryDocumentGenerationFormat,
    dictionaryDocumentGenerationFormatV1,
} from './document-ingestion';
import {
    DictionaryCardAuthoringGenerationInputPayloadSchema,
    type DictionaryCardAuthoringGenerationInputPayload,
} from './card-authoring';
export {
    DictionaryGenerationCardOverridesSchema,
    DictionaryGenerationCardValuesSchema,
    DictionaryGenerationEffectiveSettingsSchema,
    DictionaryGenerationTranslationContextSchema,
} from './generation-card-context';
import {
    DictionaryGenerationCardOverridesSchema,
    DictionaryGenerationCardValuesSchema,
    DictionaryGenerationEffectiveSettingsSchema,
    DictionaryGenerationTranslationContextSchema,
} from './generation-card-context';

export const dictionaryGenerationFormat = 'single-card:v2' as const;
export const dictionaryGenerationFormatV1 = 'single-card:v1' as const;
export const dictionaryPastedTermsGenerationFormat = 'pasted-terms:v2' as const;
export const dictionaryPastedTermsGenerationFormatV1 =
    'pasted-terms:v1' as const;
export const dictionaryImportPairsGenerationFormat = 'import-pairs:v2' as const;
export const dictionaryImportPairsGenerationFormatV1 =
    'import-pairs:v1' as const;
export const dictionarySingleCardGenerationFormats = [
    dictionaryGenerationFormatV1,
    dictionaryGenerationFormat,
] as const;
export const dictionaryPastedTermsGenerationFormats = [
    dictionaryPastedTermsGenerationFormatV1,
    dictionaryPastedTermsGenerationFormat,
] as const;
export const dictionaryImportPairsGenerationFormats = [
    dictionaryImportPairsGenerationFormatV1,
    dictionaryImportPairsGenerationFormat,
] as const;
export const dictionaryGenerationReviewLifetimeMs = 7 * 24 * 60 * 60 * 1_000;

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

export const DictionarySingleCardGenerationInputPayloadSchema = z
    .object({
        format: z.union([
            z.literal(dictionaryGenerationFormatV1),
            z.literal(dictionaryGenerationFormat),
        ]),
        instruction: z.string().trim().min(1).max(1_000).nullable(),
        context: z
            .object({
                cardId: z.string().uuid(),
                dictionaryId: z.string().uuid(),
                expectedCardVersion: z.number().int().positive(),
                expectedDictionaryVersion: z.number().int().positive(),
                expectedSettingsVersion: z.number().int().positive(),
                sourceLanguage: z.string().min(2).max(35),
                targetLanguage: z.string().min(2).max(35),
            })
            .strict()
            .refine(
                (context) => context.sourceLanguage !== context.targetLanguage,
                'Language pair must be distinct',
            ),
        original: z
            .object({
                authorship: z.enum(['human', 'ai-generated', 'mixed']),
                effectiveSettings: DictionaryGenerationEffectiveSettingsSchema,
                overrides: DictionaryGenerationCardOverridesSchema,
                values: DictionaryGenerationCardValuesSchema,
            })
            .strict(),
        translationContext:
            DictionaryGenerationTranslationContextSchema.optional(),
    })
    .strict()
    .superRefine((input, context) => {
        if (
            input.format === dictionaryGenerationFormat &&
            input.translationContext === undefined
        )
            context.addIssue({
                code: 'custom',
                path: ['translationContext'],
                message: 'Translation context snapshot is required for v2',
            });
        if (
            input.format === dictionaryGenerationFormatV1 &&
            input.translationContext !== undefined
        )
            context.addIssue({
                code: 'custom',
                path: ['translationContext'],
                message: 'Translation context is not supported by v1',
            });
    });

export const DictionaryPastedTermsGenerationInputPayloadSchema = z
    .object({
        effectiveSettings: DictionaryGenerationEffectiveSettingsSchema,
        format: z.union([
            z.literal(dictionaryPastedTermsGenerationFormatV1),
            z.literal(dictionaryPastedTermsGenerationFormat),
        ]),
        predecessor: z
            .object({
                jobId: z.string().uuid(),
                rowIndexes: z
                    .array(z.number().int().min(0).max(99))
                    .min(1)
                    .max(100),
            })
            .strict()
            .optional(),
        sharedContext: z.string().trim().min(1).max(1_000).nullable(),
        translationContext:
            DictionaryGenerationTranslationContextSchema.optional(),
        context: z
            .object({
                dictionaryId: z.string().uuid(),
                expectedDictionaryVersion: z.number().int().positive(),
                expectedSettingsVersion: z.number().int().positive(),
                sourceLanguage: z.string().min(2).max(35),
                targetLanguage: z.string().min(2).max(35),
            })
            .strict()
            .refine(
                (context) => context.sourceLanguage !== context.targetLanguage,
                'Language pair must be distinct',
            ),
        rows: z
            .array(
                z
                    .object({
                        input: boundedText(
                            dictionaryLimits.requiredCardValueCodePoints,
                        ),
                        rowIndex: z.number().int().min(0).max(99),
                    })
                    .strict(),
            )
            .min(1)
            .max(100)
            .superRefine((rows, context) => {
                if (
                    new Set(rows.map((row) => row.rowIndex)).size !==
                    rows.length
                ) {
                    context.addIssue({
                        code: 'custom',
                        message: 'Pasted-term row indexes must be unique',
                    });
                }
            }),
    })
    .strict()
    .superRefine((input, context) => {
        if (
            input.format === dictionaryPastedTermsGenerationFormat &&
            input.translationContext === undefined
        )
            context.addIssue({
                code: 'custom',
                path: ['translationContext'],
                message: 'Translation context snapshot is required for v2',
            });
        if (
            input.format === dictionaryPastedTermsGenerationFormatV1 &&
            input.translationContext !== undefined
        )
            context.addIssue({
                code: 'custom',
                path: ['translationContext'],
                message: 'Translation context is not supported by v1',
            });
    });

export const DictionaryImportPairsGenerationInputPayloadSchema = z
    .object({
        effectiveSettings: DictionaryGenerationEffectiveSettingsSchema,
        format: z.union([
            z.literal(dictionaryImportPairsGenerationFormatV1),
            z.literal(dictionaryImportPairsGenerationFormat),
        ]),
        importFingerprint: z
            .string()
            .regex(/^hmac-sha256:v1:[A-Za-z0-9_-]{43}$/u),
        instruction: z.string().trim().min(1).max(1_000).nullable(),
        translationContext:
            DictionaryGenerationTranslationContextSchema.optional(),
        predecessor: z
            .object({
                jobId: z.string().uuid(),
                rowIndexes: z
                    .array(z.number().int().min(0).max(9_999))
                    .min(1)
                    .max(100)
                    .superRefine((indexes, context) => {
                        if (new Set(indexes).size !== indexes.length)
                            context.addIssue({
                                code: 'custom',
                                message:
                                    'Predecessor row indexes must be unique',
                            });
                    }),
            })
            .strict()
            .optional(),
        context: z
            .object({
                dictionaryId: z.string().uuid(),
                expectedDictionaryVersion: z.number().int().positive(),
                expectedSettingsVersion: z.number().int().positive(),
                sourceLanguage: z.string().min(2).max(35),
                targetLanguage: z.string().min(2).max(35),
            })
            .strict()
            .refine(
                (context) => context.sourceLanguage !== context.targetLanguage,
                'Language pair must be distinct',
            ),
        rows: z
            .array(
                z
                    .object({
                        lineage: z
                            .object({
                                importFingerprint: z
                                    .string()
                                    .regex(
                                        /^hmac-sha256:v1:[A-Za-z0-9_-]{43}$/u,
                                    ),
                                importedRowIndex: z
                                    .number()
                                    .int()
                                    .min(0)
                                    .max(9_999),
                            })
                            .strict(),
                        rowIndex: z.number().int().min(0).max(9_999),
                        source: boundedText(
                            dictionaryLimits.requiredCardValueCodePoints,
                        ),
                        translation: boundedText(
                            dictionaryLimits.requiredCardValueCodePoints,
                        ),
                    })
                    .strict(),
            )
            .min(1)
            .max(100),
    })
    .strict()
    .superRefine((input, context) => {
        if (
            !input.effectiveSettings.transcriptionEnabled &&
            !input.effectiveSettings.definitionEnabled &&
            !input.effectiveSettings.exampleEnabled &&
            !input.effectiveSettings.exampleTranslationEnabled
        )
            context.addIssue({
                code: 'custom',
                path: ['effectiveSettings'],
                message:
                    'Import AI enrichment requires an enabled optional field',
            });
        if (
            new Set(input.rows.map((row) => row.rowIndex)).size !==
            input.rows.length
        )
            context.addIssue({
                code: 'custom',
                path: ['rows'],
                message: 'Import row indexes must be unique',
            });
        input.rows.forEach((row, index) => {
            if (
                row.lineage.importFingerprint !== input.importFingerprint ||
                row.lineage.importedRowIndex !== row.rowIndex
            )
                context.addIssue({
                    code: 'custom',
                    path: ['rows', index, 'lineage'],
                    message: 'Import lineage must match its trusted import row',
                });
        });
        if (
            input.format === dictionaryImportPairsGenerationFormat &&
            input.translationContext === undefined
        )
            context.addIssue({
                code: 'custom',
                path: ['translationContext'],
                message: 'Translation context snapshot is required for v2',
            });
        if (
            input.format === dictionaryImportPairsGenerationFormatV1 &&
            input.translationContext !== undefined
        )
            context.addIssue({
                code: 'custom',
                path: ['translationContext'],
                message: 'Translation context is not supported by v1',
            });
    });

export const DictionaryDocumentTermsGenerationInputPayloadSchema = z
    .object({
        effectiveSettings: DictionaryGenerationEffectiveSettingsSchema,
        format: z.union([
            z.literal(dictionaryDocumentGenerationFormatV1),
            z.literal(dictionaryDocumentGenerationFormat),
        ]),
        instruction: z.string().trim().min(1).max(1_000).nullable(),
        translationContext:
            DictionaryGenerationTranslationContextSchema.optional(),
        context: z
            .object({
                dictionaryId: z.string().uuid(),
                expectedDictionaryVersion: z.number().int().positive(),
                expectedSettingsVersion: z.number().int().positive(),
                sourceLanguage: z.string().min(2).max(35),
                targetLanguage: z.string().min(2).max(35),
            })
            .strict()
            .refine(
                (context) => context.sourceLanguage !== context.targetLanguage,
                'Language pair must be distinct',
            ),
        uploadId: z.string().uuid(),
    })
    .strict()
    .superRefine((input, context) => {
        if (
            input.format === dictionaryDocumentGenerationFormat &&
            input.translationContext === undefined
        )
            context.addIssue({
                code: 'custom',
                path: ['translationContext'],
                message: 'Translation context snapshot is required for v2',
            });
        if (
            input.format === dictionaryDocumentGenerationFormatV1 &&
            input.translationContext !== undefined
        )
            context.addIssue({
                code: 'custom',
                path: ['translationContext'],
                message: 'Translation context is not supported by v1',
            });
    });

export const DictionaryGenerationInputPayloadSchema = z.union([
    DictionarySingleCardGenerationInputPayloadSchema,
    DictionaryCardAuthoringGenerationInputPayloadSchema,
    DictionaryPastedTermsGenerationInputPayloadSchema,
    DictionaryImportPairsGenerationInputPayloadSchema,
    DictionaryDocumentTermsGenerationInputPayloadSchema,
]);

const FieldFeedbackSchema = z
    .object({
        field: z.enum([
            'source',
            'translation',
            'transcription',
            'definition',
            'example',
            'exampleTranslation',
        ]),
        alternatives: z.array(boundedText(2_000)).max(3),
        reason: boundedText(500),
    })
    .strict()
    .superRefine((feedback, context) => {
        const maximum = ['source', 'translation', 'transcription'].includes(
            feedback.field,
        )
            ? dictionaryLimits.requiredCardValueCodePoints
            : dictionaryLimits.optionalLongValueCodePoints;
        feedback.alternatives.forEach((alternative, index) => {
            if ([...alternative].length > maximum) {
                context.addIssue({
                    code: 'custom',
                    path: ['alternatives', index],
                    message: `Alternative exceeds the ${maximum} character limit`,
                });
            }
        });
    });

export const DictionaryGenerationProposalPayloadSchema = z
    .object({
        candidate: z
            .object({
                overrides: DictionaryGenerationCardOverridesSchema,
                values: DictionaryGenerationCardValuesSchema,
            })
            .strict(),
        fieldFeedback: z
            .array(FieldFeedbackSchema)
            .max(6)
            .superRefine((feedback, context) => {
                if (
                    new Set(feedback.map((item) => item.field)).size !==
                    feedback.length
                ) {
                    context.addIssue({
                        code: 'custom',
                        message: 'Feedback fields must be unique',
                    });
                }
            }),
        warnings: z.array(boundedText(500)).max(10),
    })
    .strict();

export type DictionaryGenerationInputPayload =
    | DictionarySingleCardGenerationInputPayload
    | DictionaryCardAuthoringGenerationInputPayload
    | DictionaryPastedTermsGenerationInputPayload
    | DictionaryImportPairsGenerationInputPayload
    | DictionaryDocumentTermsGenerationInputPayload;
type DictionarySingleCardGenerationInputPayloadBase = Omit<
    z.infer<typeof DictionarySingleCardGenerationInputPayloadSchema>,
    'format' | 'translationContext'
>;
export type DictionarySingleCardGenerationInputPayload =
    | (DictionarySingleCardGenerationInputPayloadBase & {
          format: typeof dictionaryGenerationFormatV1;
          translationContext?: never;
      })
    | (DictionarySingleCardGenerationInputPayloadBase & {
          format: typeof dictionaryGenerationFormat;
          translationContext: string | null;
      });
export type { DictionaryCardAuthoringGenerationInputPayload } from './card-authoring';
type DictionaryPastedTermsGenerationInputPayloadBase = Omit<
    z.infer<typeof DictionaryPastedTermsGenerationInputPayloadSchema>,
    'format' | 'translationContext'
>;
export type DictionaryPastedTermsGenerationInputPayload =
    | (DictionaryPastedTermsGenerationInputPayloadBase & {
          format: typeof dictionaryPastedTermsGenerationFormatV1;
          translationContext?: never;
      })
    | (DictionaryPastedTermsGenerationInputPayloadBase & {
          format: typeof dictionaryPastedTermsGenerationFormat;
          translationContext: string | null;
      });
type DictionaryImportPairsGenerationInputPayloadBase = Omit<
    z.infer<typeof DictionaryImportPairsGenerationInputPayloadSchema>,
    'format' | 'translationContext'
>;
export type DictionaryImportPairsGenerationInputPayload =
    | (DictionaryImportPairsGenerationInputPayloadBase & {
          format: typeof dictionaryImportPairsGenerationFormatV1;
          translationContext?: never;
      })
    | (DictionaryImportPairsGenerationInputPayloadBase & {
          format: typeof dictionaryImportPairsGenerationFormat;
          translationContext: string | null;
      });
type DictionaryDocumentTermsGenerationInputPayloadBase = Omit<
    z.infer<typeof DictionaryDocumentTermsGenerationInputPayloadSchema>,
    'format' | 'translationContext'
>;
export type DictionaryDocumentTermsGenerationInputPayload =
    | (DictionaryDocumentTermsGenerationInputPayloadBase & {
          format: typeof dictionaryDocumentGenerationFormatV1;
          translationContext?: never;
      })
    | (DictionaryDocumentTermsGenerationInputPayloadBase & {
          format: typeof dictionaryDocumentGenerationFormat;
          translationContext: string | null;
      });
export type DictionaryGenerationProposalPayload = z.infer<
    typeof DictionaryGenerationProposalPayloadSchema
>;

export function parseDictionaryGenerationInput(
    value: unknown,
): DictionaryGenerationInputPayload {
    return DictionaryGenerationInputPayloadSchema.parse(
        value,
    ) as DictionaryGenerationInputPayload;
}

export function parseDictionaryGenerationProposal(
    value: unknown,
): DictionaryGenerationProposalPayload {
    return DictionaryGenerationProposalPayloadSchema.parse(value);
}
