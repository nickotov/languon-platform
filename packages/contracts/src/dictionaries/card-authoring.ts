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
    DictionaryTranslationContextSchema,
    DictionaryVersionSchema,
} from './primitives';

export const DICTIONARY_CARD_AUTHORING_GENERATION_FORMAT_V1 =
    'card-authoring:v1' as const;
export const DICTIONARY_CARD_AUTHORING_GENERATION_FORMAT_V2 =
    'card-authoring:v2' as const;
export const DICTIONARY_CARD_AUTHORING_GENERATION_FORMAT =
    'card-authoring:v3' as const;
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
export const DictionaryCardAuthoringV2FieldSchema = z.enum([
    'source',
    ...DictionaryCardAuthoringFieldSchema.options,
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

export const DictionaryCardAuthoringV3DraftSchema =
    DictionaryCardAuthoringDraftSchema.safeExtend({
        translationContext: DictionaryTranslationContextSchema.nullable(),
    }).strict();

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

export const DictionaryCardAuthoringV2SuggestionSchema = z
    .object({
        id: DictionaryIdSchema,
        field: DictionaryCardAuthoringFieldSchema,
        value: DictionaryCardOptionalValueSchema,
        basisSource: DictionaryCardPrimaryValueSchema,
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
                message: 'Suggestion exceeds 200 code point limit',
            });
    });

export const DictionaryCardAuthoringSourceResultSchema = z.discriminatedUnion(
    'kind',
    [
        z.object({ kind: z.literal('unchanged') }).strict(),
        z
            .object({
                kind: z.literal('suggested'),
                suggestionId: DictionaryIdSchema,
            })
            .strict(),
    ],
);

export const DictionaryCardAuthoringV2ProposalSchema = z
    .object({
        source: DictionaryCardPrimaryValueSchema,
        sourceResult: DictionaryCardAuthoringSourceResultSchema.nullable(),
        sourceSuggestions: z
            .array(
                z
                    .object({
                        id: DictionaryIdSchema,
                        field: z.literal('source'),
                        value: DictionaryCardPrimaryValueSchema,
                    })
                    .strict(),
            )
            .max(DICTIONARY_CARD_AUTHORING_SUGGESTION_LIMIT_PER_FIELD),
        suggestions: z
            .array(DictionaryCardAuthoringV2SuggestionSchema)
            .max(
                DICTIONARY_CARD_AUTHORING_SUGGESTION_LIMIT_PER_FIELD *
                    DictionaryCardAuthoringFieldSchema.options.length,
            ),
    })
    .strict()
    .superRefine((proposal, context) => {
        const latestSourceSuggestionId =
            proposal.sourceResult?.kind === 'suggested'
                ? proposal.sourceResult.suggestionId
                : null;
        const allIds = [
            ...proposal.sourceSuggestions.map((item) => item.id),
            ...proposal.suggestions.map((item) => item.id),
        ];
        if (new Set(allIds).size !== allIds.length)
            context.addIssue({
                code: 'custom',
                message: 'Suggestion IDs must be unique',
            });
        if (
            new Set(proposal.sourceSuggestions.map((item) => item.value))
                .size !== proposal.sourceSuggestions.length
        )
            context.addIssue({
                code: 'custom',
                message: 'Source suggestions must be distinct',
            });
        if (
            latestSourceSuggestionId !== null &&
            !proposal.sourceSuggestions.some(
                (item) => item.id === latestSourceSuggestionId,
            )
        )
            context.addIssue({
                code: 'custom',
                path: ['sourceResult', 'suggestionId'],
                message:
                    'Latest Source suggestion must reference retained history',
            });
        DictionaryCardAuthoringFieldSchema.options.forEach((field) => {
            if (
                proposal.suggestions.filter((item) => item.field === field)
                    .length >
                DICTIONARY_CARD_AUTHORING_SUGGESTION_LIMIT_PER_FIELD
            )
                context.addIssue({
                    code: 'custom',
                    message: `Suggestions for ${field} exceed the visible bound`,
                });
        });
    });

export const DictionaryCardAuthoringV3ProposalSchema =
    DictionaryCardAuthoringV2ProposalSchema.safeExtend({
        translationContext: DictionaryTranslationContextSchema.nullable(),
    }).strict();

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
    format: z.literal(DICTIONARY_CARD_AUTHORING_GENERATION_FORMAT_V1),
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
                            'ai_credits_exhausted',
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

const authoringV2JobBase = {
    ...authoringJobBase,
    format: z.literal(DICTIONARY_CARD_AUTHORING_GENERATION_FORMAT_V2),
    target: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('create') }).strict(),
        z
            .object({
                kind: z.literal('update'),
                cardId: DictionaryIdSchema,
                expectedCardVersion: DictionaryVersionSchema,
            })
            .strict(),
    ]),
};

export const DictionaryCardAuthoringV2GenerationJobSchema =
    z.discriminatedUnion('state', [
        z
            .object({
                ...authoringV2JobBase,
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
                ...authoringV2JobBase,
                state: z.literal('review'),
                progress: z.object({
                    stage: z.literal('review_ready'),
                    percent: z.literal(100),
                }),
                proposal: DictionaryCardAuthoringV2ProposalSchema,
                failure: z.null(),
                outcome: z.null(),
                completedAt: z.null(),
                expiresAt: DictionaryTimestampSchema,
            })
            .strict(),
        z
            .object({
                ...authoringV2JobBase,
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
                            'ai_credits_exhausted',
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
    ]);

const authoringV3JobBase = {
    ...authoringV2JobBase,
    format: z.literal(DICTIONARY_CARD_AUTHORING_GENERATION_FORMAT),
};

export const DictionaryCardAuthoringV3GenerationJobSchema =
    z.discriminatedUnion('state', [
        z
            .object({
                ...authoringV3JobBase,
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
                ...authoringV3JobBase,
                state: z.literal('review'),
                progress: z.object({
                    stage: z.literal('review_ready'),
                    percent: z.literal(100),
                }),
                proposal: DictionaryCardAuthoringV3ProposalSchema,
                failure: z.null(),
                outcome: z.null(),
                completedAt: z.null(),
                expiresAt: DictionaryTimestampSchema,
            })
            .strict(),
        z
            .object({
                ...authoringV3JobBase,
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
                            'ai_credits_exhausted',
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
    ]);

export const DictionaryCardAuthoringAnyGenerationJobSchema = z.union([
    DictionaryCardAuthoringGenerationJobSchema,
    DictionaryCardAuthoringV2GenerationJobSchema,
    DictionaryCardAuthoringV3GenerationJobSchema,
]);

const EnqueueDictionaryCardAuthoringV1GenerationRequestSchema = z
    .object({
        expectedDictionaryVersion: DictionaryVersionSchema,
        expectedSettingsVersion: DictionaryVersionSchema,
        source: DictionaryCardPrimaryValueSchema,
        draft: DictionaryCardAuthoringDraftSchema,
        scope: z.object({ kind: z.literal('all') }).strict(),
    })
    .strict();

const enqueueV2Base = {
    format: z.literal(DICTIONARY_CARD_AUTHORING_GENERATION_FORMAT_V2),
    expectedDictionaryVersion: DictionaryVersionSchema,
    expectedSettingsVersion: DictionaryVersionSchema,
    source: DictionaryCardPrimaryValueSchema,
    draft: DictionaryCardAuthoringDraftSchema,
    scope: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('all') }).strict(),
        z
            .object({
                kind: z.literal('field'),
                field: DictionaryCardAuthoringV2FieldSchema,
            })
            .strict(),
    ]),
};
const enqueueV3Base = {
    ...enqueueV2Base,
    format: z.literal(DICTIONARY_CARD_AUTHORING_GENERATION_FORMAT),
    draft: DictionaryCardAuthoringV3DraftSchema,
};
const requireExampleForFieldOnlyTranslation = (
    request: {
        scope: { kind: 'all' } | { kind: 'field'; field: string };
        draft: z.infer<typeof DictionaryCardAuthoringDraftSchema>;
    },
    context: z.RefinementCtx,
) => {
    if (
        request.scope.kind === 'field' &&
        request.scope.field === 'exampleTranslation' &&
        request.draft.values.example === null
    )
        context.addIssue({
            code: 'custom',
            path: ['draft', 'values', 'example'],
            message: 'Example translation generation requires an Example',
        });
};

export const EnqueueDictionaryCardAuthoringGenerationRequestSchema = z.union([
    EnqueueDictionaryCardAuthoringV1GenerationRequestSchema,
    z
        .object(enqueueV2Base)
        .strict()
        .superRefine(requireExampleForFieldOnlyTranslation),
    z
        .object(enqueueV3Base)
        .strict()
        .superRefine(requireExampleForFieldOnlyTranslation),
]);

export const EnqueueDictionaryCardAuthoringUpdateGenerationRequestSchema =
    z.union([
        z
            .object({
                ...enqueueV2Base,
                expectedCardVersion: DictionaryVersionSchema,
            })
            .strict()
            .superRefine(requireExampleForFieldOnlyTranslation),
        z
            .object({
                ...enqueueV3Base,
                expectedCardVersion: DictionaryVersionSchema,
            })
            .strict()
            .superRefine(requireExampleForFieldOnlyTranslation),
    ]);

const regenerationBase = {
    expectedDictionaryVersion: DictionaryVersionSchema,
    expectedSettingsVersion: DictionaryVersionSchema,
    source: DictionaryCardPrimaryValueSchema,
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
};
export const RegenerateDictionaryCardAuthoringGenerationRequestSchema = z.union(
    [
        z
            .object({
                ...regenerationBase,
                format: z.literal(
                    DICTIONARY_CARD_AUTHORING_GENERATION_FORMAT_V1,
                ),
                draft: DictionaryCardAuthoringDraftSchema,
                scope: DictionaryCardAuthoringScopeSchema,
            })
            .strict(),
        z
            .object({
                ...regenerationBase,
                format: z.literal(
                    DICTIONARY_CARD_AUTHORING_GENERATION_FORMAT_V2,
                ),
                draft: DictionaryCardAuthoringDraftSchema,
                discardedSuggestionIds: z
                    .array(DictionaryIdSchema)
                    .max(
                        DICTIONARY_CARD_AUTHORING_SUGGESTION_LIMIT_PER_FIELD *
                            DictionaryCardAuthoringV2FieldSchema.options.length,
                    )
                    .superRefine((ids, context) => {
                        if (new Set(ids).size !== ids.length)
                            context.addIssue({
                                code: 'custom',
                                message:
                                    'Discarded suggestion IDs must be unique',
                            });
                    }),
                scope: z.discriminatedUnion('kind', [
                    z.object({ kind: z.literal('all') }).strict(),
                    z
                        .object({
                            kind: z.literal('field'),
                            field: DictionaryCardAuthoringV2FieldSchema,
                        })
                        .strict(),
                ]),
            })
            .strict()
            .superRefine(requireExampleForFieldOnlyTranslation),
        z
            .object({
                ...regenerationBase,
                format: z.literal(DICTIONARY_CARD_AUTHORING_GENERATION_FORMAT),
                draft: DictionaryCardAuthoringV3DraftSchema,
                discardedSuggestionIds: z
                    .array(DictionaryIdSchema)
                    .max(
                        DICTIONARY_CARD_AUTHORING_SUGGESTION_LIMIT_PER_FIELD *
                            DictionaryCardAuthoringV2FieldSchema.options.length,
                    )
                    .superRefine((ids, context) => {
                        if (new Set(ids).size !== ids.length)
                            context.addIssue({
                                code: 'custom',
                                message:
                                    'Discarded suggestion IDs must be unique',
                            });
                    }),
                scope: z.discriminatedUnion('kind', [
                    z.object({ kind: z.literal('all') }).strict(),
                    z
                        .object({
                            kind: z.literal('field'),
                            field: DictionaryCardAuthoringV2FieldSchema,
                        })
                        .strict(),
                ]),
            })
            .strict()
            .superRefine(requireExampleForFieldOnlyTranslation),
    ],
);

const uniqueSelectedSuggestions = (
    selected: Array<{ field: string; suggestionId: string }>,
    context: z.RefinementCtx,
) => {
    const entries = selected;
    if (new Set(entries.map((entry) => entry.field)).size !== entries.length)
        context.addIssue({
            code: 'custom',
            message:
                'Selected suggestions must be unique by contributing field',
        });
    if (
        new Set(entries.map((entry) => entry.suggestionId)).size !==
        entries.length
    )
        context.addIssue({
            code: 'custom',
            message: 'Selected suggestion IDs must be unique',
        });
};
const selectedV1Suggestions = z
    .array(DictionaryCardAuthoringSelectedSuggestionSchema)
    .max(DictionaryCardAuthoringFieldSchema.options.length)
    .superRefine(uniqueSelectedSuggestions);
const selectedV2Suggestions = z
    .array(
        z
            .object({
                field: DictionaryCardAuthoringV2FieldSchema,
                suggestionId: DictionaryIdSchema,
            })
            .strict(),
    )
    .min(1)
    .max(DictionaryCardAuthoringV2FieldSchema.options.length)
    .superRefine(uniqueSelectedSuggestions);

export const AcceptDictionaryCardAuthoringGenerationJobRequestSchema = z.union([
    z
        .object({
            format: z.literal(DICTIONARY_CARD_AUTHORING_GENERATION_FORMAT_V1),
            candidate: z
                .object({
                    values: DictionaryCardValuesSchema,
                    overrides: DictionaryCardOverridesSchema,
                })
                .strict(),
            selectedSuggestions: selectedV1Suggestions,
        })
        .strict(),
    z
        .object({
            format: z.literal(DICTIONARY_CARD_AUTHORING_GENERATION_FORMAT_V2),
            candidate: z
                .object({
                    values: DictionaryCardValuesSchema,
                    overrides: DictionaryCardOverridesSchema,
                })
                .strict(),
            selectedSuggestions: selectedV2Suggestions,
        })
        .strict(),
    z
        .object({
            format: z.literal(DICTIONARY_CARD_AUTHORING_GENERATION_FORMAT),
            candidate: z
                .object({
                    values: DictionaryCardValuesSchema,
                    translationContext:
                        DictionaryTranslationContextSchema.nullable(),
                    overrides: DictionaryCardOverridesSchema,
                })
                .strict(),
            selectedSuggestions: selectedV2Suggestions,
        })
        .strict(),
]);

export const EnqueueDictionaryCardAuthoringGenerationResponseSchema = z
    .object({ job: DictionaryCardAuthoringAnyGenerationJobSchema })
    .strict();
export const RegenerateDictionaryCardAuthoringGenerationResponseSchema =
    EnqueueDictionaryCardAuthoringGenerationResponseSchema;
export const AcceptDictionaryCardAuthoringGenerationJobResponseSchema = z
    .object({
        job: DictionaryCardAuthoringAnyGenerationJobSchema,
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
export type DictionaryCardAuthoringV2Field = z.infer<
    typeof DictionaryCardAuthoringV2FieldSchema
>;
export type DictionaryCardAuthoringDraft = z.infer<
    typeof DictionaryCardAuthoringDraftSchema
>;
export type DictionaryCardAuthoringV3Draft = z.infer<
    typeof DictionaryCardAuthoringV3DraftSchema
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
export type DictionaryCardAuthoringV3Proposal = z.infer<
    typeof DictionaryCardAuthoringV3ProposalSchema
>;
export type DictionaryCardAuthoringGenerationJob = z.infer<
    typeof DictionaryCardAuthoringAnyGenerationJobSchema
>;
