import { z } from 'zod';

import { dictionaryLimits } from './limits';
import { dictionaryDocumentGenerationFormat } from './document-ingestion';

export const dictionaryGenerationFormat = 'single-card:v1' as const;
export const dictionaryPastedTermsGenerationFormat = 'pasted-terms:v1' as const;
export const dictionaryImportPairsGenerationFormat = 'import-pairs:v1' as const;
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

export const DictionarySingleCardGenerationInputPayloadSchema = z
    .object({
        format: z.literal(dictionaryGenerationFormat),
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
    })
    .strict();

export const DictionaryPastedTermsGenerationInputPayloadSchema = z
    .object({
        effectiveSettings: DictionaryGenerationEffectiveSettingsSchema,
        format: z.literal(dictionaryPastedTermsGenerationFormat),
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
    .strict();

export const DictionaryImportPairsGenerationInputPayloadSchema = z
    .object({
        effectiveSettings: DictionaryGenerationEffectiveSettingsSchema,
        format: z.literal(dictionaryImportPairsGenerationFormat),
        importFingerprint: z
            .string()
            .regex(/^hmac-sha256:v1:[A-Za-z0-9_-]{43}$/u),
        instruction: z.string().trim().min(1).max(1_000).nullable(),
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
    });

export const DictionaryDocumentTermsGenerationInputPayloadSchema = z
    .object({
        effectiveSettings: DictionaryGenerationEffectiveSettingsSchema,
        format: z.literal(dictionaryDocumentGenerationFormat),
        instruction: z.string().trim().min(1).max(1_000).nullable(),
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
    .strict();

export const DictionaryGenerationInputPayloadSchema = z.discriminatedUnion(
    'format',
    [
        DictionarySingleCardGenerationInputPayloadSchema,
        DictionaryPastedTermsGenerationInputPayloadSchema,
        DictionaryImportPairsGenerationInputPayloadSchema,
        DictionaryDocumentTermsGenerationInputPayloadSchema,
    ],
);

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

export type DictionaryGenerationInputPayload = z.infer<
    typeof DictionaryGenerationInputPayloadSchema
>;
export type DictionarySingleCardGenerationInputPayload = z.infer<
    typeof DictionarySingleCardGenerationInputPayloadSchema
>;
export type DictionaryPastedTermsGenerationInputPayload = z.infer<
    typeof DictionaryPastedTermsGenerationInputPayloadSchema
>;
export type DictionaryImportPairsGenerationInputPayload = z.infer<
    typeof DictionaryImportPairsGenerationInputPayloadSchema
>;
export type DictionaryDocumentTermsGenerationInputPayload = z.infer<
    typeof DictionaryDocumentTermsGenerationInputPayloadSchema
>;
export type DictionaryGenerationProposalPayload = z.infer<
    typeof DictionaryGenerationProposalPayloadSchema
>;

export function parseDictionaryGenerationInput(
    value: unknown,
): DictionaryGenerationInputPayload {
    return DictionaryGenerationInputPayloadSchema.parse(value);
}

export function parseDictionaryGenerationProposal(
    value: unknown,
): DictionaryGenerationProposalPayload {
    return DictionaryGenerationProposalPayloadSchema.parse(value);
}
