import { z } from 'zod';

import {
    DictionaryCardEffectiveSettingsSchema,
    DictionaryCardOverridesSchema,
    DictionaryCardValuesSchema,
} from './models';
import {
    DictionaryAuthorshipSchema,
    DictionaryCardOptionalValueSchema,
    DictionaryCardPrimaryValueSchema,
    DictionaryGenerationFeedbackTextSchema,
    DictionaryIdSchema,
    DictionaryLanguageTagSchema,
    DictionaryTimestampSchema,
    DictionaryVersionSchema,
} from './primitives';

export const DICTIONARY_SINGLE_CARD_GENERATION_FORMAT = 'single-card:v1';
export const DICTIONARY_PASTED_TERMS_GENERATION_FORMAT = 'pasted-terms:v1';
export const DICTIONARY_DOCUMENT_TERMS_GENERATION_FORMAT = 'document-terms:v1';
export const DICTIONARY_IMPORT_PAIRS_GENERATION_FORMAT = 'import-pairs:v1';
export const DICTIONARY_IMPORT_PAIRS_ACCEPTED_AUTHORSHIP = 'mixed' as const;

export const DictionaryGenerationJobStateSchema = z.enum([
    'awaiting-upload',
    'queued',
    'running',
    'review',
    'accepted',
    'discarded',
    'cancelled',
    'failed',
    'expired',
]);

export const DictionaryGenerationJobStageSchema = z.enum([
    'awaiting_upload',
    'queued',
    'scanning',
    'extracting',
    'ocr',
    'generating',
    'validating',
    'cleaning',
    'review_ready',
    'terminal',
]);

export const DictionaryGenerationJobProgressSchema = z
    .object({
        stage: DictionaryGenerationJobStageSchema,
        percent: z.number().int().min(0).max(100),
    })
    .strict();

export const DictionaryGenerationCandidateSchema = z
    .object({
        values: DictionaryCardValuesSchema,
        overrides: DictionaryCardOverridesSchema,
    })
    .strict();

export const DictionaryGenerationFieldSchema = z.enum([
    'source',
    'translation',
    'transcription',
    'definition',
    'example',
    'exampleTranslation',
]);

const PrimaryFieldFeedbackSchema = z
    .object({
        field: z.enum(['source', 'translation']),
        reason: DictionaryGenerationFeedbackTextSchema,
        alternatives: z
            .array(DictionaryCardPrimaryValueSchema)
            .max(3)
            .default([]),
    })
    .strict();

const OptionalFieldFeedbackSchema = z
    .object({
        field: z.enum([
            'transcription',
            'definition',
            'example',
            'exampleTranslation',
        ]),
        reason: DictionaryGenerationFeedbackTextSchema,
        alternatives: z
            .array(DictionaryCardOptionalValueSchema)
            .max(3)
            .default([]),
    })
    .strict();

export const DictionaryGenerationFieldFeedbackSchema = z.discriminatedUnion(
    'field',
    [PrimaryFieldFeedbackSchema, OptionalFieldFeedbackSchema],
);

export const DictionaryGenerationProposalSchema = z
    .object({
        candidate: DictionaryGenerationCandidateSchema,
        fieldFeedback: z
            .array(DictionaryGenerationFieldFeedbackSchema)
            .max(6)
            .superRefine((feedback, context) => {
                const fields = feedback.map((entry) => entry.field);
                if (new Set(fields).size !== fields.length) {
                    context.addIssue({
                        code: 'custom',
                        message:
                            'Proposal field feedback must be unique by field',
                    });
                }
            }),
        warnings: z
            .array(DictionaryGenerationFeedbackTextSchema)
            .max(10)
            .default([]),
    })
    .strict();

export const DictionaryGenerationOriginalSnapshotSchema = z
    .object({
        values: DictionaryCardValuesSchema,
        overrides: DictionaryCardOverridesSchema,
        effectiveSettings: DictionaryCardEffectiveSettingsSchema,
        authorship: DictionaryAuthorshipSchema,
    })
    .strict();

export const DictionaryGenerationSafeFailureSchema = z
    .object({
        code: z.enum([
            'provider_unavailable',
            'provider_timeout',
            'provider_rate_limited',
            'invalid_model_output',
            'retry_exhausted',
            'internal_error',
            'malware_detected',
            'scan_failed',
            'unsupported_document',
            'invalid_document',
            'too_many_terms',
            'no_terms_found',
            'extraction_failed',
            'ocr_failed',
            'cleanup_failed',
        ]),
        message: DictionaryGenerationFeedbackTextSchema,
        retryable: z.boolean(),
    })
    .strict();

export const DictionaryGenerationAcceptedOutcomeSchema = z
    .object({
        cardId: DictionaryIdSchema,
        cardVersion: DictionaryVersionSchema,
        dictionaryVersion: DictionaryVersionSchema,
    })
    .strict();

export const DictionarySingleCardGenerationJobSchema = z
    .object({
        id: DictionaryIdSchema,
        kind: z.literal('single-card'),
        format: z.literal(DICTIONARY_SINGLE_CARD_GENERATION_FORMAT),
        state: DictionaryGenerationJobStateSchema,
        dictionaryId: DictionaryIdSchema,
        cardId: DictionaryIdSchema,
        expectedDictionaryVersion: DictionaryVersionSchema,
        expectedSettingsVersion: DictionaryVersionSchema,
        expectedCardVersion: DictionaryVersionSchema,
        sourceLanguage: DictionaryLanguageTagSchema,
        targetLanguage: DictionaryLanguageTagSchema,
        progress: DictionaryGenerationJobProgressSchema,
        cancellationRequested: z.boolean(),
        originalSnapshot: DictionaryGenerationOriginalSnapshotSchema.nullable(),
        proposal: DictionaryGenerationProposalSchema.nullable(),
        failure: DictionaryGenerationSafeFailureSchema.nullable(),
        outcome: DictionaryGenerationAcceptedOutcomeSchema.nullable(),
        createdAt: DictionaryTimestampSchema,
        updatedAt: DictionaryTimestampSchema,
        completedAt: DictionaryTimestampSchema.nullable(),
        expiresAt: DictionaryTimestampSchema.nullable(),
    })
    .strict()
    .superRefine((job, context) => {
        const contentState =
            job.state === 'queued' ||
            job.state === 'running' ||
            job.state === 'review';
        const terminalState = !contentState;

        if (contentState && job.originalSnapshot === null) {
            context.addIssue({
                code: 'custom',
                path: ['originalSnapshot'],
                message:
                    'Active generation jobs require their original snapshot',
            });
        }
        if (terminalState && job.originalSnapshot !== null) {
            context.addIssue({
                code: 'custom',
                path: ['originalSnapshot'],
                message:
                    'Terminal generation jobs must redact original content',
            });
        }
        if ((job.state === 'review') !== (job.proposal !== null)) {
            context.addIssue({
                code: 'custom',
                path: ['proposal'],
                message: 'Only review jobs expose a proposal',
            });
        }
        if ((job.state === 'failed') !== (job.failure !== null)) {
            context.addIssue({
                code: 'custom',
                path: ['failure'],
                message: 'Only failed jobs expose a sanitized failure',
            });
        }
        if ((job.state === 'accepted') !== (job.outcome !== null)) {
            context.addIssue({
                code: 'custom',
                path: ['outcome'],
                message: 'Only accepted jobs expose an accepted outcome',
            });
        }
        if (job.state === 'queued' && job.progress.stage !== 'queued') {
            context.addIssue({
                code: 'custom',
                path: ['progress', 'stage'],
                message: 'Queued jobs must report the queued stage',
            });
        }
        if (
            job.state === 'running' &&
            !['generating', 'validating'].includes(job.progress.stage)
        ) {
            context.addIssue({
                code: 'custom',
                path: ['progress', 'stage'],
                message: 'Running jobs must report a running stage',
            });
        }
        if (job.state === 'review' && job.progress.stage !== 'review_ready') {
            context.addIssue({
                code: 'custom',
                path: ['progress', 'stage'],
                message: 'Review jobs must report the review-ready stage',
            });
        }
        if (terminalState && job.progress.stage !== 'terminal') {
            context.addIssue({
                code: 'custom',
                path: ['progress', 'stage'],
                message: 'Terminal jobs must report the terminal stage',
            });
        }
        if ((job.state === 'review') !== (job.expiresAt !== null)) {
            context.addIssue({
                code: 'custom',
                path: ['expiresAt'],
                message: 'Only review jobs expose proposal expiry',
            });
        }
        if (terminalState !== (job.completedAt !== null)) {
            context.addIssue({
                code: 'custom',
                path: ['completedAt'],
                message: 'Terminal jobs require a completion timestamp',
            });
        }
    });

export const DictionaryPastedTermsGenerationCandidateSchema = z
    .object({
        rowIndex: z.number().int().min(0).max(99),
        input: DictionaryCardPrimaryValueSchema,
        candidate: DictionaryGenerationCandidateSchema,
        fieldFeedback: z
            .array(DictionaryGenerationFieldFeedbackSchema)
            .max(6)
            .superRefine((feedback, context) => {
                const fields = feedback.map((entry) => entry.field);
                if (new Set(fields).size !== fields.length) {
                    context.addIssue({
                        code: 'custom',
                        message:
                            'Candidate field feedback must be unique by field',
                    });
                }
            }),
    })
    .strict();

export const DictionaryPastedTermsGenerationRowFailureSchema = z
    .object({
        rowIndex: z.number().int().min(0).max(99),
        input: DictionaryCardPrimaryValueSchema,
        code: z.enum(['invalid_term', 'generation_failed']),
        message: DictionaryGenerationFeedbackTextSchema,
        retryable: z.boolean(),
    })
    .strict();

export const DictionaryPastedTermsGenerationRowWarningSchema = z
    .object({
        rowIndex: z.number().int().min(0).max(99),
        code: z.enum(['duplicate_source']),
        message: DictionaryGenerationFeedbackTextSchema,
        duplicateCardId: DictionaryIdSchema.nullable().default(null),
    })
    .strict();

export const DictionaryPastedTermsGenerationProposalSchema = z
    .object({
        candidates: z
            .array(DictionaryPastedTermsGenerationCandidateSchema)
            .max(100),
        failures: z
            .array(DictionaryPastedTermsGenerationRowFailureSchema)
            .max(100),
        warnings: z
            .array(DictionaryPastedTermsGenerationRowWarningSchema)
            .max(100),
    })
    .strict()
    .superRefine((proposal, context) => {
        const resolvedIndexes = [
            ...proposal.candidates.map((row) => row.rowIndex),
            ...proposal.failures.map((row) => row.rowIndex),
        ];

        if (resolvedIndexes.length === 0) {
            context.addIssue({
                code: 'custom',
                message: 'A pasted-term proposal must contain at least one row',
            });
        }
        if (
            resolvedIndexes.length > 100 ||
            new Set(resolvedIndexes).size !== resolvedIndexes.length
        ) {
            context.addIssue({
                code: 'custom',
                message:
                    'Candidate and failure row indexes must be unique and bounded',
            });
        }

        const resolvedIndexSet = new Set(resolvedIndexes);
        const warningKeys = proposal.warnings.map(
            (warning) => `${warning.rowIndex}:${warning.code}`,
        );
        if (new Set(warningKeys).size !== warningKeys.length) {
            context.addIssue({
                code: 'custom',
                path: ['warnings'],
                message: 'Row warning codes must be unique per row',
            });
        }
        proposal.warnings.forEach((warning, index) => {
            if (!resolvedIndexSet.has(warning.rowIndex)) {
                context.addIssue({
                    code: 'custom',
                    path: ['warnings', index, 'rowIndex'],
                    message: 'Warnings must reference a proposal row',
                });
            }
        });
    });

export const DictionaryPastedTermsGenerationAcceptedCardSchema = z
    .object({
        rowIndex: z.number().int().min(0).max(99),
        cardId: DictionaryIdSchema,
        cardVersion: DictionaryVersionSchema,
    })
    .strict();

export const DictionaryImportPairsGenerationCandidateSchema = z
    .object({
        rowIndex: z.number().int().min(0).max(9_999),
        source: DictionaryCardPrimaryValueSchema,
        translation: DictionaryCardPrimaryValueSchema,
        candidate: DictionaryGenerationCandidateSchema,
        fieldFeedback: z
            .array(DictionaryGenerationFieldFeedbackSchema)
            .max(6)
            .superRefine((feedback, context) => {
                const fields = feedback.map((entry) => entry.field);
                if (new Set(fields).size !== fields.length)
                    context.addIssue({
                        code: 'custom',
                        message:
                            'Candidate field feedback must be unique by field',
                    });
            }),
    })
    .strict()
    .superRefine((row, context) => {
        if (row.candidate.values.source !== row.source)
            context.addIssue({
                code: 'custom',
                path: ['candidate', 'values', 'source'],
                message: 'AI output must preserve the imported source',
            });
        if (row.candidate.values.translation !== row.translation)
            context.addIssue({
                code: 'custom',
                path: ['candidate', 'values', 'translation'],
                message: 'AI output must preserve the imported translation',
            });
        if (
            row.fieldFeedback.some(
                (feedback) =>
                    feedback.field === 'source' ||
                    feedback.field === 'translation',
            )
        )
            context.addIssue({
                code: 'custom',
                path: ['fieldFeedback'],
                message: 'AI may only provide feedback for optional fields',
            });
    });

export const DictionaryImportPairsGenerationRowFailureSchema = z
    .object({
        rowIndex: z.number().int().min(0).max(9_999),
        input: DictionaryCardPrimaryValueSchema,
        source: DictionaryCardPrimaryValueSchema,
        translation: DictionaryCardPrimaryValueSchema,
        code: z.enum(['invalid_term', 'generation_failed']),
        message: DictionaryGenerationFeedbackTextSchema,
        retryable: z.boolean(),
    })
    .strict();

export const DictionaryImportPairsGenerationRowWarningSchema =
    DictionaryPastedTermsGenerationRowWarningSchema.extend({
        rowIndex: z.number().int().min(0).max(9_999),
    });

export const DictionaryImportPairsGenerationProposalSchema = z
    .object({
        candidates: z
            .array(DictionaryImportPairsGenerationCandidateSchema)
            .max(100),
        failures: z
            .array(DictionaryImportPairsGenerationRowFailureSchema)
            .max(100),
        warnings: z
            .array(DictionaryImportPairsGenerationRowWarningSchema)
            .max(100),
    })
    .strict()
    .superRefine((proposal, context) => {
        const resolvedIndexes = [
            ...proposal.candidates.map((row) => row.rowIndex),
            ...proposal.failures.map((row) => row.rowIndex),
        ];
        proposal.failures.forEach((failure, index) => {
            if (failure.input !== failure.source)
                context.addIssue({
                    code: 'custom',
                    path: ['failures', index, 'input'],
                    message: 'Failure input must preserve the imported source',
                });
        });
        if (resolvedIndexes.length === 0)
            context.addIssue({
                code: 'custom',
                message:
                    'An import-pairs proposal must contain at least one row',
            });
        if (new Set(resolvedIndexes).size !== resolvedIndexes.length)
            context.addIssue({
                code: 'custom',
                message: 'Candidate and failure row indexes must be unique',
            });
        const resolved = new Set(resolvedIndexes);
        const warningKeys = new Set<string>();
        proposal.warnings.forEach((warning, index) => {
            const key = `${warning.rowIndex}:${warning.code}`;
            if (warningKeys.has(key))
                context.addIssue({
                    code: 'custom',
                    path: ['warnings', index],
                    message: 'Row warning codes must be unique per row',
                });
            warningKeys.add(key);
            if (!resolved.has(warning.rowIndex))
                context.addIssue({
                    code: 'custom',
                    path: ['warnings', index, 'rowIndex'],
                    message: 'Warnings must reference a proposal row',
                });
        });
    });

export const DictionaryImportPairsGenerationAcceptedCardSchema =
    DictionaryPastedTermsGenerationAcceptedCardSchema.extend({
        rowIndex: z.number().int().min(0).max(9_999),
    });

export const DictionaryImportPairsGenerationAcceptedOutcomeSchema = z
    .object({
        authorship: z.literal(DICTIONARY_IMPORT_PAIRS_ACCEPTED_AUTHORSHIP),
        cards: z
            .array(DictionaryImportPairsGenerationAcceptedCardSchema)
            .min(1)
            .max(100)
            .superRefine((cards, context) => {
                if (
                    new Set(cards.map((card) => card.rowIndex)).size !==
                    cards.length
                )
                    context.addIssue({
                        code: 'custom',
                        message: 'Accepted card row indexes must be unique',
                    });
                if (
                    new Set(cards.map((card) => card.cardId)).size !==
                    cards.length
                )
                    context.addIssue({
                        code: 'custom',
                        message: 'Accepted card IDs must be unique',
                    });
            }),
        dictionaryVersion: DictionaryVersionSchema,
        warnings: z
            .array(DictionaryImportPairsGenerationRowWarningSchema)
            .max(100)
            .default([]),
    })
    .strict();

export const DictionaryPastedTermsGenerationAcceptedOutcomeSchema = z
    .object({
        cards: z
            .array(DictionaryPastedTermsGenerationAcceptedCardSchema)
            .min(1)
            .max(100)
            .superRefine((cards, context) => {
                if (
                    new Set(cards.map((card) => card.rowIndex)).size !==
                    cards.length
                ) {
                    context.addIssue({
                        code: 'custom',
                        message: 'Accepted card row indexes must be unique',
                    });
                }
                if (
                    new Set(cards.map((card) => card.cardId)).size !==
                    cards.length
                ) {
                    context.addIssue({
                        code: 'custom',
                        message: 'Accepted card IDs must be unique',
                    });
                }
            }),
        dictionaryVersion: DictionaryVersionSchema,
        warnings: z
            .array(DictionaryPastedTermsGenerationRowWarningSchema)
            .max(100)
            .default([]),
    })
    .strict();

export const DictionaryPastedTermsGenerationJobSchema = z
    .object({
        id: DictionaryIdSchema,
        kind: z.literal('pasted-terms'),
        format: z.literal(DICTIONARY_PASTED_TERMS_GENERATION_FORMAT),
        state: DictionaryGenerationJobStateSchema,
        dictionaryId: DictionaryIdSchema,
        expectedDictionaryVersion: DictionaryVersionSchema,
        expectedSettingsVersion: DictionaryVersionSchema,
        sourceLanguage: DictionaryLanguageTagSchema,
        targetLanguage: DictionaryLanguageTagSchema,
        progress: DictionaryGenerationJobProgressSchema,
        cancellationRequested: z.boolean(),
        proposal: DictionaryPastedTermsGenerationProposalSchema.nullable(),
        failure: DictionaryGenerationSafeFailureSchema.nullable(),
        outcome:
            DictionaryPastedTermsGenerationAcceptedOutcomeSchema.nullable(),
        createdAt: DictionaryTimestampSchema,
        updatedAt: DictionaryTimestampSchema,
        completedAt: DictionaryTimestampSchema.nullable(),
        expiresAt: DictionaryTimestampSchema.nullable(),
    })
    .strict()
    .superRefine((job, context) => {
        const activeState = ['queued', 'running', 'review'].includes(job.state);
        const terminalState = !activeState;

        if ((job.state === 'review') !== (job.proposal !== null)) {
            context.addIssue({
                code: 'custom',
                path: ['proposal'],
                message: 'Only review jobs expose a proposal',
            });
        }
        if ((job.state === 'failed') !== (job.failure !== null)) {
            context.addIssue({
                code: 'custom',
                path: ['failure'],
                message: 'Only failed jobs expose a sanitized failure',
            });
        }
        if ((job.state === 'accepted') !== (job.outcome !== null)) {
            context.addIssue({
                code: 'custom',
                path: ['outcome'],
                message: 'Only accepted jobs expose an accepted outcome',
            });
        }
        if (job.state === 'queued' && job.progress.stage !== 'queued') {
            context.addIssue({
                code: 'custom',
                path: ['progress', 'stage'],
                message: 'Queued jobs must report the queued stage',
            });
        }
        if (
            job.state === 'running' &&
            !['generating', 'validating'].includes(job.progress.stage)
        ) {
            context.addIssue({
                code: 'custom',
                path: ['progress', 'stage'],
                message: 'Running jobs must report a running stage',
            });
        }
        if (job.state === 'review' && job.progress.stage !== 'review_ready') {
            context.addIssue({
                code: 'custom',
                path: ['progress', 'stage'],
                message: 'Review jobs must report the review-ready stage',
            });
        }
        if (terminalState && job.progress.stage !== 'terminal') {
            context.addIssue({
                code: 'custom',
                path: ['progress', 'stage'],
                message: 'Terminal jobs must report the terminal stage',
            });
        }
        if ((job.state === 'review') !== (job.expiresAt !== null)) {
            context.addIssue({
                code: 'custom',
                path: ['expiresAt'],
                message: 'Only review jobs expose proposal expiry',
            });
        }
        if (terminalState !== (job.completedAt !== null)) {
            context.addIssue({
                code: 'custom',
                path: ['completedAt'],
                message: 'Terminal jobs require a completion timestamp',
            });
        }
    });

export const DictionaryImportPairsGenerationJobSchema = z
    .object({
        ...DictionaryPastedTermsGenerationJobSchema.shape,
        kind: z.literal('import-pairs'),
        format: z.literal(DICTIONARY_IMPORT_PAIRS_GENERATION_FORMAT),
        proposal: DictionaryImportPairsGenerationProposalSchema.nullable(),
        outcome:
            DictionaryImportPairsGenerationAcceptedOutcomeSchema.nullable(),
    })
    .strict()
    .superRefine((job, context) => {
        const terminal = !['queued', 'running', 'review'].includes(job.state);
        if ((job.state === 'review') !== (job.proposal !== null))
            context.addIssue({
                code: 'custom',
                path: ['proposal'],
                message: 'Only review jobs expose a proposal',
            });
        if ((job.state === 'failed') !== (job.failure !== null))
            context.addIssue({
                code: 'custom',
                path: ['failure'],
                message: 'Only failed jobs expose a sanitized failure',
            });
        if ((job.state === 'accepted') !== (job.outcome !== null))
            context.addIssue({
                code: 'custom',
                path: ['outcome'],
                message: 'Only accepted jobs expose an accepted outcome',
            });
        if (job.state === 'queued' && job.progress.stage !== 'queued')
            context.addIssue({
                code: 'custom',
                path: ['progress', 'stage'],
                message: 'Queued jobs must report the queued stage',
            });
        if (
            job.state === 'running' &&
            !['generating', 'validating'].includes(job.progress.stage)
        )
            context.addIssue({
                code: 'custom',
                path: ['progress', 'stage'],
                message: 'Running jobs must report a running stage',
            });
        if (job.state === 'review' && job.progress.stage !== 'review_ready')
            context.addIssue({
                code: 'custom',
                path: ['progress', 'stage'],
                message: 'Review jobs must report the review-ready stage',
            });
        if (terminal && job.progress.stage !== 'terminal')
            context.addIssue({
                code: 'custom',
                path: ['progress', 'stage'],
                message: 'Terminal jobs must report the terminal stage',
            });
        if ((job.state === 'review') !== (job.expiresAt !== null))
            context.addIssue({
                code: 'custom',
                path: ['expiresAt'],
                message: 'Only review jobs expose proposal expiry',
            });
        if (terminal !== (job.completedAt !== null))
            context.addIssue({
                code: 'custom',
                path: ['completedAt'],
                message: 'Terminal jobs require a completion timestamp',
            });
    });

export const DictionaryDocumentTermsGenerationJobSchema = z
    .object({
        id: DictionaryIdSchema,
        kind: z.literal('document-terms'),
        format: z.literal(DICTIONARY_DOCUMENT_TERMS_GENERATION_FORMAT),
        state: DictionaryGenerationJobStateSchema,
        dictionaryId: DictionaryIdSchema,
        expectedDictionaryVersion: DictionaryVersionSchema,
        expectedSettingsVersion: DictionaryVersionSchema,
        sourceLanguage: DictionaryLanguageTagSchema,
        targetLanguage: DictionaryLanguageTagSchema,
        progress: DictionaryGenerationJobProgressSchema,
        cancellationRequested: z.boolean(),
        proposal: DictionaryPastedTermsGenerationProposalSchema.nullable(),
        failure: DictionaryGenerationSafeFailureSchema.nullable(),
        outcome:
            DictionaryPastedTermsGenerationAcceptedOutcomeSchema.nullable(),
        createdAt: DictionaryTimestampSchema,
        updatedAt: DictionaryTimestampSchema,
        completedAt: DictionaryTimestampSchema.nullable(),
        expiresAt: DictionaryTimestampSchema.nullable(),
    })
    .strict()
    .superRefine((job, context) => {
        const activeState = [
            'awaiting-upload',
            'queued',
            'running',
            'review',
        ].includes(job.state);
        const terminalState = !activeState;

        if ((job.state === 'review') !== (job.proposal !== null)) {
            context.addIssue({
                code: 'custom',
                path: ['proposal'],
                message: 'Only review jobs expose a proposal',
            });
        }
        if ((job.state === 'failed') !== (job.failure !== null)) {
            context.addIssue({
                code: 'custom',
                path: ['failure'],
                message: 'Only failed jobs expose a sanitized failure',
            });
        }
        if ((job.state === 'accepted') !== (job.outcome !== null)) {
            context.addIssue({
                code: 'custom',
                path: ['outcome'],
                message: 'Only accepted jobs expose an accepted outcome',
            });
        }
        if (
            job.state === 'awaiting-upload' &&
            job.progress.stage !== 'awaiting_upload'
        ) {
            context.addIssue({
                code: 'custom',
                path: ['progress', 'stage'],
                message: 'Awaiting-upload jobs must report awaiting upload',
            });
        }
        if (job.state === 'queued' && job.progress.stage !== 'queued') {
            context.addIssue({
                code: 'custom',
                path: ['progress', 'stage'],
                message: 'Queued jobs must report the queued stage',
            });
        }
        if (
            job.state === 'running' &&
            ![
                'scanning',
                'extracting',
                'ocr',
                'generating',
                'validating',
                'cleaning',
            ].includes(job.progress.stage)
        ) {
            context.addIssue({
                code: 'custom',
                path: ['progress', 'stage'],
                message: 'Running document jobs must report a running stage',
            });
        }
        if (job.state === 'review' && job.progress.stage !== 'review_ready') {
            context.addIssue({
                code: 'custom',
                path: ['progress', 'stage'],
                message: 'Review jobs must report the review-ready stage',
            });
        }
        if (terminalState && job.progress.stage !== 'terminal') {
            context.addIssue({
                code: 'custom',
                path: ['progress', 'stage'],
                message: 'Terminal jobs must report the terminal stage',
            });
        }
        if ((job.state === 'review') !== (job.expiresAt !== null)) {
            context.addIssue({
                code: 'custom',
                path: ['expiresAt'],
                message: 'Only review jobs expose proposal expiry',
            });
        }
        if (terminalState !== (job.completedAt !== null)) {
            context.addIssue({
                code: 'custom',
                path: ['completedAt'],
                message: 'Terminal jobs require a completion timestamp',
            });
        }
    });

export const DictionaryGenerationJobSchema = z.discriminatedUnion('kind', [
    DictionarySingleCardGenerationJobSchema,
    DictionaryPastedTermsGenerationJobSchema,
    DictionaryImportPairsGenerationJobSchema,
    DictionaryDocumentTermsGenerationJobSchema,
]);

export const DictionaryGenerationJobResponseSchema = z
    .object({ job: DictionaryGenerationJobSchema })
    .strict();

export const AcceptDictionarySingleCardGenerationJobResponseSchema = z
    .object({
        job: DictionarySingleCardGenerationJobSchema,
        outcome: DictionaryGenerationAcceptedOutcomeSchema,
    })
    .strict()
    .superRefine((response, context) => {
        if (response.job.state !== 'accepted') {
            context.addIssue({
                code: 'custom',
                path: ['job', 'state'],
                message: 'An accepted response requires an accepted job',
            });
        }
        if (
            response.job.outcome?.cardId !== response.outcome.cardId ||
            response.job.outcome.cardVersion !== response.outcome.cardVersion ||
            response.job.outcome.dictionaryVersion !==
                response.outcome.dictionaryVersion
        ) {
            context.addIssue({
                code: 'custom',
                path: ['job', 'outcome'],
                message: 'Accepted job and response outcomes must match',
            });
        }
    });

export const AcceptDictionaryPastedTermsGenerationJobResponseSchema = z
    .object({
        job: DictionaryPastedTermsGenerationJobSchema,
        outcome: DictionaryPastedTermsGenerationAcceptedOutcomeSchema,
    })
    .strict()
    .superRefine((response, context) => {
        if (response.job.state !== 'accepted') {
            context.addIssue({
                code: 'custom',
                path: ['job', 'state'],
                message: 'An accepted response requires an accepted job',
            });
        }
        if (
            JSON.stringify(response.job.outcome) !==
            JSON.stringify(response.outcome)
        ) {
            context.addIssue({
                code: 'custom',
                path: ['job', 'outcome'],
                message: 'Accepted job and response outcomes must match',
            });
        }
    });

export const AcceptDictionaryDocumentTermsGenerationJobResponseSchema = z
    .object({
        job: DictionaryDocumentTermsGenerationJobSchema,
        outcome: DictionaryPastedTermsGenerationAcceptedOutcomeSchema,
    })
    .strict()
    .superRefine((response, context) => {
        if (response.job.state !== 'accepted') {
            context.addIssue({
                code: 'custom',
                path: ['job', 'state'],
                message: 'An accepted response requires an accepted job',
            });
        }
        if (
            JSON.stringify(response.job.outcome) !==
            JSON.stringify(response.outcome)
        ) {
            context.addIssue({
                code: 'custom',
                path: ['job', 'outcome'],
                message: 'Accepted job and response outcomes must match',
            });
        }
    });

export const AcceptDictionaryImportPairsGenerationJobResponseSchema = z
    .object({
        job: DictionaryImportPairsGenerationJobSchema,
        outcome: DictionaryImportPairsGenerationAcceptedOutcomeSchema,
    })
    .strict()
    .superRefine((response, context) => {
        if (response.job.state !== 'accepted')
            context.addIssue({
                code: 'custom',
                path: ['job', 'state'],
                message: 'An accepted response requires an accepted job',
            });
        if (
            JSON.stringify(response.job.outcome) !==
            JSON.stringify(response.outcome)
        )
            context.addIssue({
                code: 'custom',
                path: ['job', 'outcome'],
                message: 'Accepted job and response outcomes must match',
            });
    });

export const AcceptDictionaryGenerationJobResponseSchema = z.union([
    AcceptDictionarySingleCardGenerationJobResponseSchema,
    AcceptDictionaryPastedTermsGenerationJobResponseSchema,
    AcceptDictionaryImportPairsGenerationJobResponseSchema,
    AcceptDictionaryDocumentTermsGenerationJobResponseSchema,
]);

export type DictionaryGenerationJobState = z.infer<
    typeof DictionaryGenerationJobStateSchema
>;
export type DictionaryGenerationJobStage = z.infer<
    typeof DictionaryGenerationJobStageSchema
>;
export type DictionaryGenerationJobProgress = z.infer<
    typeof DictionaryGenerationJobProgressSchema
>;
export type DictionaryGenerationCandidate = z.infer<
    typeof DictionaryGenerationCandidateSchema
>;
export type DictionaryGenerationField = z.infer<
    typeof DictionaryGenerationFieldSchema
>;
export type DictionaryGenerationFieldFeedback = z.infer<
    typeof DictionaryGenerationFieldFeedbackSchema
>;
export type DictionaryGenerationProposal = z.infer<
    typeof DictionaryGenerationProposalSchema
>;
export type DictionaryGenerationOriginalSnapshot = z.infer<
    typeof DictionaryGenerationOriginalSnapshotSchema
>;
export type DictionaryGenerationSafeFailure = z.infer<
    typeof DictionaryGenerationSafeFailureSchema
>;
export type DictionaryGenerationAcceptedOutcome = z.infer<
    typeof DictionaryGenerationAcceptedOutcomeSchema
>;
export type DictionarySingleCardGenerationJob = z.infer<
    typeof DictionarySingleCardGenerationJobSchema
>;
export type DictionaryPastedTermsGenerationCandidate = z.infer<
    typeof DictionaryPastedTermsGenerationCandidateSchema
>;
export type DictionaryPastedTermsGenerationRowFailure = z.infer<
    typeof DictionaryPastedTermsGenerationRowFailureSchema
>;
export type DictionaryPastedTermsGenerationRowWarning = z.infer<
    typeof DictionaryPastedTermsGenerationRowWarningSchema
>;
export type DictionaryPastedTermsGenerationProposal = z.infer<
    typeof DictionaryPastedTermsGenerationProposalSchema
>;
export type DictionaryPastedTermsGenerationAcceptedOutcome = z.infer<
    typeof DictionaryPastedTermsGenerationAcceptedOutcomeSchema
>;
export type DictionaryPastedTermsGenerationJob = z.infer<
    typeof DictionaryPastedTermsGenerationJobSchema
>;
export type DictionaryImportPairsGenerationCandidate = z.infer<
    typeof DictionaryImportPairsGenerationCandidateSchema
>;
export type DictionaryImportPairsGenerationProposal = z.infer<
    typeof DictionaryImportPairsGenerationProposalSchema
>;
export type DictionaryImportPairsGenerationAcceptedOutcome = z.infer<
    typeof DictionaryImportPairsGenerationAcceptedOutcomeSchema
>;
export type DictionaryImportPairsGenerationJob = z.infer<
    typeof DictionaryImportPairsGenerationJobSchema
>;
export type DictionaryDocumentTermsGenerationJob = z.infer<
    typeof DictionaryDocumentTermsGenerationJobSchema
>;
export type DictionaryGenerationJob = z.infer<
    typeof DictionaryGenerationJobSchema
>;
export type DictionaryGenerationJobResponse = z.infer<
    typeof DictionaryGenerationJobResponseSchema
>;
export type AcceptDictionaryGenerationJobResponse = z.infer<
    typeof AcceptDictionaryGenerationJobResponseSchema
>;
