import { z } from 'zod';

import {
    DictionaryCardOverridesSchema,
    DictionaryCardValuesSchema,
} from './models';
import {
    DictionaryCardOptionalValueSchema,
    DictionaryCardPrimaryValueSchema,
    DictionaryIdSchema,
    DictionaryLanguageTagSchema,
    DictionaryTimestampSchema,
    DictionaryVersionSchema,
} from './primitives';

export const DICTIONARY_CARD_AUTHORING_GENERATION_FORMAT =
    'card-authoring:v1' as const;
export const DICTIONARY_CARD_AUTHORING_GENERATION_KIND =
    'card-authoring' as const;
export const DICTIONARY_CARD_AUTHORING_SUGGESTION_LIMIT_PER_FIELD = 6;

export const DictionaryCardAuthoringFieldSchema = z.enum([
    'translation',
    'transcription',
    'definition',
    'example',
    'exampleTranslation',
]);

export const DictionaryCardAuthoringDraftSchema = z
    .object({
        values: z
            .object({
                translation: DictionaryCardPrimaryValueSchema.nullable(),
                transcription: DictionaryCardOptionalValueSchema.nullable(),
                definition: DictionaryCardOptionalValueSchema.nullable(),
                example: DictionaryCardOptionalValueSchema.nullable(),
                exampleTranslation:
                    DictionaryCardOptionalValueSchema.nullable(),
            })
            .strict(),
        overrides: DictionaryCardOverridesSchema,
    })
    .strict();

export const DictionaryCardAuthoringScopeSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('all') }).strict(),
    z
        .object({
            kind: z.literal('field'),
            field: DictionaryCardAuthoringFieldSchema,
        })
        .strict(),
]);

export const DictionaryCardAuthoringSuggestionSchema = z
    .object({
        id: DictionaryIdSchema,
        field: DictionaryCardAuthoringFieldSchema,
        value: DictionaryCardOptionalValueSchema,
    })
    .strict()
    .superRefine((suggestion, context) => {
        if (
            ['translation', 'transcription'].includes(suggestion.field) &&
            [...suggestion.value].length > 200
        )
            context.addIssue({
                code: 'custom',
                path: ['value'],
                message: 'Suggestion exceeds the 200 code point limit',
            });
    });

export const DictionaryCardAuthoringProposalSchema = z
    .object({
        source: DictionaryCardPrimaryValueSchema,
        suggestions: z
            .array(DictionaryCardAuthoringSuggestionSchema)
            .max(
                DICTIONARY_CARD_AUTHORING_SUGGESTION_LIMIT_PER_FIELD *
                    DictionaryCardAuthoringFieldSchema.options.length,
            )
            .superRefine((suggestions, context) => {
                const ids = suggestions.map((suggestion) => suggestion.id);
                if (new Set(ids).size !== ids.length)
                    context.addIssue({
                        code: 'custom',
                        message: 'Authoring suggestion IDs must be unique',
                    });
                DictionaryCardAuthoringFieldSchema.options.forEach((field) => {
                    if (
                        suggestions.filter(
                            (suggestion) => suggestion.field === field,
                        ).length >
                        DICTIONARY_CARD_AUTHORING_SUGGESTION_LIMIT_PER_FIELD
                    )
                        context.addIssue({
                            code: 'custom',
                            message: `Authoring suggestions for ${field} exceed the visible bound`,
                        });
                });
            }),
    })
    .strict();

export const DictionaryCardAuthoringSelectedSuggestionSchema = z
    .object({
        field: DictionaryCardAuthoringFieldSchema,
        suggestionId: DictionaryIdSchema,
    })
    .strict();

export const DictionaryCardAuthoringAcceptedOutcomeSchema = z
    .object({
        cardId: DictionaryIdSchema,
        cardVersion: DictionaryVersionSchema,
        dictionaryVersion: DictionaryVersionSchema,
        duplicateSource: z.boolean(),
    })
    .strict();

const authoringJobBase = {
    id: DictionaryIdSchema,
    kind: z.literal(DICTIONARY_CARD_AUTHORING_GENERATION_KIND),
    format: z.literal(DICTIONARY_CARD_AUTHORING_GENERATION_FORMAT),
    dictionaryId: DictionaryIdSchema,
    expectedDictionaryVersion: DictionaryVersionSchema,
    expectedSettingsVersion: DictionaryVersionSchema,
    sourceLanguage: DictionaryLanguageTagSchema,
    targetLanguage: DictionaryLanguageTagSchema,
    cancellationRequested: z.boolean(),
    createdAt: DictionaryTimestampSchema,
    updatedAt: DictionaryTimestampSchema,
};

export const DictionaryCardAuthoringGenerationJobSchema = z.discriminatedUnion(
    'state',
    [
        z
            .object({
                ...authoringJobBase,
                state: z.enum(['queued', 'running']),
                progress: z.object({
                    stage: z.enum(['queued', 'generating', 'validating']),
                    percent: z.number().int().min(0).max(100),
                }),
                proposal: z.null(),
                failure: z.null(),
                outcome: z.null(),
                completedAt: z.null(),
                expiresAt: z.null(),
            })
            .strict()
            .superRefine((job, context) => {
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
            }),
        z
            .object({
                ...authoringJobBase,
                state: z.literal('review'),
                progress: z.object({
                    stage: z.literal('review_ready'),
                    percent: z.literal(100),
                }),
                proposal: DictionaryCardAuthoringProposalSchema,
                failure: z.null(),
                outcome: z.null(),
                completedAt: z.null(),
                expiresAt: DictionaryTimestampSchema,
            })
            .strict(),
        z
            .object({
                ...authoringJobBase,
                state: z.enum([
                    'accepted',
                    'discarded',
                    'cancelled',
                    'failed',
                    'expired',
                ]),
                progress: z.object({
                    stage: z.literal('terminal'),
                    percent: z.number().int().min(0).max(100),
                }),
                proposal: z.null(),
                failure: z
                    .object({
                        code: z.enum([
                            'provider_unavailable',
                            'provider_timeout',
                            'provider_rate_limited',
                            'invalid_model_output',
                            'retry_exhausted',
                            'internal_error',
                            'generation_conflict',
                        ]),
                        message: z.string().trim().min(1).max(500),
                        retryable: z.boolean(),
                    })
                    .strict()
                    .nullable(),
                outcome:
                    DictionaryCardAuthoringAcceptedOutcomeSchema.nullable(),
                completedAt: DictionaryTimestampSchema,
                expiresAt: z.null(),
            })
            .strict()
            .superRefine((job, context) => {
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
                        message:
                            'Only accepted jobs expose an accepted outcome',
                    });
                if (
                    job.failure?.code === 'generation_conflict' &&
                    job.failure.retryable
                )
                    context.addIssue({
                        code: 'custom',
                        path: ['failure', 'retryable'],
                        message: 'Generation conflicts are not retryable',
                    });
            }),
    ],
);

export const EnqueueDictionaryCardAuthoringGenerationRequestSchema = z
    .object({
        expectedDictionaryVersion: DictionaryVersionSchema,
        expectedSettingsVersion: DictionaryVersionSchema,
        source: DictionaryCardPrimaryValueSchema,
        draft: DictionaryCardAuthoringDraftSchema,
        scope: z.object({ kind: z.literal('all') }).strict(),
    })
    .strict();

export const RegenerateDictionaryCardAuthoringGenerationRequestSchema = z
    .object({
        format: z.literal(DICTIONARY_CARD_AUTHORING_GENERATION_FORMAT),
        expectedDictionaryVersion: DictionaryVersionSchema,
        expectedSettingsVersion: DictionaryVersionSchema,
        source: DictionaryCardPrimaryValueSchema,
        draft: DictionaryCardAuthoringDraftSchema,
        scope: DictionaryCardAuthoringScopeSchema,
        discardedSuggestionIds: z
            .array(DictionaryIdSchema)
            .max(
                DICTIONARY_CARD_AUTHORING_SUGGESTION_LIMIT_PER_FIELD *
                    DictionaryCardAuthoringFieldSchema.options.length,
            )
            .superRefine((ids, context) => {
                if (new Set(ids).size !== ids.length)
                    context.addIssue({
                        code: 'custom',
                        message: 'Discarded suggestion IDs must be unique',
                    });
            }),
    })
    .strict();

export const AcceptDictionaryCardAuthoringGenerationJobRequestSchema = z
    .object({
        format: z.literal(DICTIONARY_CARD_AUTHORING_GENERATION_FORMAT),
        candidate: z
            .object({
                values: DictionaryCardValuesSchema,
                overrides: DictionaryCardOverridesSchema,
            })
            .strict(),
        selectedSuggestions: z
            .array(DictionaryCardAuthoringSelectedSuggestionSchema)
            .max(DictionaryCardAuthoringFieldSchema.options.length)
            .superRefine((selected, context) => {
                if (
                    new Set(selected.map((item) => item.field)).size !==
                    selected.length
                )
                    context.addIssue({
                        code: 'custom',
                        message:
                            'Selected suggestions must be unique by contributing field',
                    });
                if (
                    new Set(selected.map((item) => item.suggestionId)).size !==
                    selected.length
                )
                    context.addIssue({
                        code: 'custom',
                        message: 'Selected suggestion IDs must be unique',
                    });
            }),
    })
    .strict();

export const EnqueueDictionaryCardAuthoringGenerationResponseSchema = z
    .object({ job: DictionaryCardAuthoringGenerationJobSchema })
    .strict();
export const RegenerateDictionaryCardAuthoringGenerationResponseSchema =
    EnqueueDictionaryCardAuthoringGenerationResponseSchema;
export const AcceptDictionaryCardAuthoringGenerationJobResponseSchema = z
    .object({
        job: DictionaryCardAuthoringGenerationJobSchema,
        outcome: DictionaryCardAuthoringAcceptedOutcomeSchema,
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

export type DictionaryCardAuthoringField = z.infer<
    typeof DictionaryCardAuthoringFieldSchema
>;
export type DictionaryCardAuthoringDraft = z.infer<
    typeof DictionaryCardAuthoringDraftSchema
>;
export type DictionaryCardAuthoringScope = z.infer<
    typeof DictionaryCardAuthoringScopeSchema
>;
export type DictionaryCardAuthoringSuggestion = z.infer<
    typeof DictionaryCardAuthoringSuggestionSchema
>;
export type DictionaryCardAuthoringSelectedSuggestion = z.infer<
    typeof DictionaryCardAuthoringSelectedSuggestionSchema
>;
export type DictionaryCardAuthoringAcceptedOutcome = z.infer<
    typeof DictionaryCardAuthoringAcceptedOutcomeSchema
>;
export type DictionaryCardAuthoringProposal = z.infer<
    typeof DictionaryCardAuthoringProposalSchema
>;
export type DictionaryCardAuthoringGenerationJob = z.infer<
    typeof DictionaryCardAuthoringGenerationJobSchema
>;
