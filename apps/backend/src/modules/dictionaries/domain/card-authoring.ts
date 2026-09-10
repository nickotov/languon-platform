import { z } from 'zod';

import { dictionaryLimits } from './limits';
import {
    DictionaryGenerationCardOverridesSchema,
    DictionaryGenerationEffectiveSettingsSchema,
} from './generation-card-context';

export const dictionaryCardAuthoringGenerationFormat =
    'card-authoring:v1' as const;
export const dictionaryCardAuthoringSuggestionLimitPerField = 6;
export const dictionaryCardAuthoringExcludedValueLimitPerField = 24;

export const DictionaryCardAuthoringFieldSchema = z.enum([
    'translation',
    'transcription',
    'definition',
    'example',
    'exampleTranslation',
]);

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

export const DictionaryCardAuthoringDraftSchema = z
    .object({
        overrides: DictionaryGenerationCardOverridesSchema,
        values: z
            .object({
                translation: boundedText(
                    dictionaryLimits.requiredCardValueCodePoints,
                ).nullable(),
                transcription: boundedText(
                    dictionaryLimits.optionalShortValueCodePoints,
                ).nullable(),
                definition: boundedText(
                    dictionaryLimits.optionalLongValueCodePoints,
                ).nullable(),
                example: boundedText(
                    dictionaryLimits.optionalLongValueCodePoints,
                ).nullable(),
                exampleTranslation: boundedText(
                    dictionaryLimits.optionalLongValueCodePoints,
                ).nullable(),
            })
            .strict(),
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

export const DictionaryCardAuthoringGenerationInputPayloadSchema = z
    .object({
        format: z.literal(dictionaryCardAuthoringGenerationFormat),
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
        source: boundedText(dictionaryLimits.requiredCardValueCodePoints),
        draft: DictionaryCardAuthoringDraftSchema,
        effectiveSettings: DictionaryGenerationEffectiveSettingsSchema,
        excludedValues: z
            .array(
                z
                    .object({
                        field: DictionaryCardAuthoringFieldSchema,
                        values: z
                            .array(
                                z.union([
                                    boundedText(
                                        dictionaryLimits.requiredCardValueCodePoints,
                                    ),
                                    boundedText(
                                        dictionaryLimits.optionalLongValueCodePoints,
                                    ),
                                ]),
                            )
                            .max(
                                dictionaryCardAuthoringExcludedValueLimitPerField,
                            ),
                    })
                    .strict(),
            )
            .max(DictionaryCardAuthoringFieldSchema.options.length)
            .superRefine((entries, context) => {
                if (
                    new Set(entries.map((entry) => entry.field)).size !==
                    entries.length
                )
                    context.addIssue({
                        code: 'custom',
                        message: 'Excluded authoring fields must be unique',
                    });
                entries.forEach((entry, index) => {
                    if (new Set(entry.values).size !== entry.values.length)
                        context.addIssue({
                            code: 'custom',
                            path: [index, 'values'],
                            message:
                                'Excluded authoring values must be unique per field',
                        });
                });
            })
            .default([]),
        scope: DictionaryCardAuthoringScopeSchema,
        predecessor: z
            .object({
                jobId: z.string().uuid(),
                discardedSuggestionIds: z
                    .array(z.string().uuid())
                    .max(
                        dictionaryCardAuthoringSuggestionLimitPerField *
                            DictionaryCardAuthoringFieldSchema.options.length,
                    )
                    .superRefine((ids, context) => {
                        if (new Set(ids).size !== ids.length)
                            context.addIssue({
                                code: 'custom',
                                message:
                                    'Discarded suggestion IDs must be unique',
                            });
                    }),
            })
            .strict()
            .optional(),
    })
    .strict()
    .superRefine((input, context) => {
        if (!input.predecessor && input.scope.kind !== 'all')
            context.addIssue({
                code: 'custom',
                path: ['scope'],
                message:
                    'Initial card authoring generation must target all fields',
            });
        const requested = resolveDictionaryCardAuthoringFields(
            input.effectiveSettings,
            input.scope,
        );
        if (input.scope.kind === 'field' && requested.length === 0)
            context.addIssue({
                code: 'custom',
                path: ['scope', 'field'],
                message: 'The requested authoring field is not enabled',
            });
        const excludedFields = new Set(
            input.excludedValues.map((entry) => entry.field),
        );
        if (
            input.predecessor &&
            requested.some(
                (field) =>
                    !excludedFields.has(field) ||
                    input.excludedValues.find((entry) => entry.field === field)
                        ?.values.length === 0,
            )
        )
            context.addIssue({
                code: 'custom',
                path: ['excludedValues'],
                message:
                    'Successor generation must exclude prior values for every requested field',
            });
    });

const DictionaryCardAuthoringProviderFieldContextSchema = z
    .object({
        field: DictionaryCardAuthoringFieldSchema,
        currentValue: z
            .union([
                boundedText(dictionaryLimits.requiredCardValueCodePoints),
                boundedText(dictionaryLimits.optionalLongValueCodePoints),
            ])
            .nullable(),
        excludedValues: z
            .array(
                z.union([
                    boundedText(dictionaryLimits.requiredCardValueCodePoints),
                    boundedText(dictionaryLimits.optionalLongValueCodePoints),
                ]),
            )
            .max(dictionaryCardAuthoringExcludedValueLimitPerField),
    })
    .strict()
    .superRefine((fieldContext, context) => {
        if (
            new Set(fieldContext.excludedValues).size !==
            fieldContext.excludedValues.length
        )
            context.addIssue({
                code: 'custom',
                path: ['excludedValues'],
                message: 'Excluded provider values must be unique',
            });
    });

export const DictionaryCardAuthoringProviderInputSchema = z
    .object({
        sourceLanguage: z.string().min(2).max(35),
        targetLanguage: z.string().min(2).max(35),
        source: boundedText(dictionaryLimits.requiredCardValueCodePoints),
        effectiveSettings: DictionaryGenerationEffectiveSettingsSchema,
        fieldContext: z
            .array(DictionaryCardAuthoringProviderFieldContextSchema)
            .min(1)
            .max(DictionaryCardAuthoringFieldSchema.options.length)
            .superRefine((entries, context) => {
                if (
                    new Set(entries.map((entry) => entry.field)).size !==
                    entries.length
                )
                    context.addIssue({
                        code: 'custom',
                        message: 'Provider field context must be unique',
                    });
            }),
        requestedFields: z
            .array(DictionaryCardAuthoringFieldSchema)
            .min(1)
            .max(DictionaryCardAuthoringFieldSchema.options.length)
            .superRefine((fields, context) => {
                if (new Set(fields).size !== fields.length)
                    context.addIssue({
                        code: 'custom',
                        message: 'Requested authoring fields must be unique',
                    });
            }),
    })
    .strict()
    .superRefine((input, context) => {
        if (input.sourceLanguage === input.targetLanguage)
            context.addIssue({
                code: 'custom',
                path: ['targetLanguage'],
                message: 'Language pair must be distinct',
            });
        const contextFields = input.fieldContext.map((entry) => entry.field);
        if (
            contextFields.length !== input.requestedFields.length ||
            input.requestedFields.some(
                (field) => !contextFields.includes(field),
            )
        )
            context.addIssue({
                code: 'custom',
                path: ['fieldContext'],
                message:
                    'Provider context must contain exactly the requested fields',
            });
    });

const suggestionValueSchema = z.union([
    boundedText(dictionaryLimits.requiredCardValueCodePoints),
    boundedText(dictionaryLimits.optionalLongValueCodePoints),
]);

export const DictionaryCardAuthoringProviderDeltaSchema = z
    .object({
        suggestions: z
            .array(
                z
                    .object({
                        field: DictionaryCardAuthoringFieldSchema,
                        value: suggestionValueSchema,
                    })
                    .strict()
                    .superRefine((suggestion, context) => {
                        const maximum = [
                            'translation',
                            'transcription',
                        ].includes(suggestion.field)
                            ? dictionaryLimits.requiredCardValueCodePoints
                            : dictionaryLimits.optionalLongValueCodePoints;
                        if ([...suggestion.value].length > maximum)
                            context.addIssue({
                                code: 'custom',
                                path: ['value'],
                                message: `Suggestion exceeds the ${maximum} code point limit`,
                            });
                    }),
            )
            .max(DictionaryCardAuthoringFieldSchema.options.length)
            .superRefine((suggestions, context) => {
                if (
                    new Set(suggestions.map((item) => item.field)).size !==
                    suggestions.length
                )
                    context.addIssue({
                        code: 'custom',
                        message: 'Provider suggestions must be unique by field',
                    });
            }),
    })
    .strict();

export const DictionaryCardAuthoringSuggestionSchema = z
    .object({
        id: z.string().uuid(),
        field: DictionaryCardAuthoringFieldSchema,
        value: suggestionValueSchema,
    })
    .strict();

export const DictionaryCardAuthoringProposalPayloadSchema = z
    .object({
        source: boundedText(dictionaryLimits.requiredCardValueCodePoints),
        suggestions: z
            .array(DictionaryCardAuthoringSuggestionSchema)
            .max(
                dictionaryCardAuthoringSuggestionLimitPerField *
                    DictionaryCardAuthoringFieldSchema.options.length,
            )
            .superRefine((suggestions, context) => {
                if (
                    new Set(suggestions.map((item) => item.id)).size !==
                    suggestions.length
                )
                    context.addIssue({
                        code: 'custom',
                        message: 'Authoring suggestion IDs must be unique',
                    });
                DictionaryCardAuthoringFieldSchema.options.forEach((field) => {
                    if (
                        suggestions.filter((item) => item.field === field)
                            .length >
                        dictionaryCardAuthoringSuggestionLimitPerField
                    )
                        context.addIssue({
                            code: 'custom',
                            message: `Authoring suggestions for ${field} exceed the visible bound`,
                        });
                });
            }),
    })
    .strict();

export class DictionaryCardAuthoringSuggestionLimitError extends Error {
    public constructor(public readonly field: DictionaryCardAuthoringField) {
        super(
            `Card authoring suggestions for ${field} reached the visible limit.`,
        );
        this.name = 'DictionaryCardAuthoringSuggestionLimitError';
    }
}

export class DictionaryCardAuthoringDuplicateSuggestionError extends Error {
    public constructor(public readonly field: DictionaryCardAuthoringField) {
        super(`Card authoring suggestion for ${field} is not distinct.`);
        this.name = 'DictionaryCardAuthoringDuplicateSuggestionError';
    }
}

export function mergeDictionaryCardAuthoringProposal(input: {
    source: string;
    predecessor?: DictionaryCardAuthoringProposalPayload;
    discardedSuggestionIds: readonly string[];
    delta: DictionaryCardAuthoringProviderDelta;
    requestedFields: readonly DictionaryCardAuthoringField[];
    nextId: () => string;
}): DictionaryCardAuthoringProposalPayload {
    if (input.predecessor && input.predecessor.source !== input.source)
        throw new Error('Card authoring predecessor source does not match.');
    const requested = new Set(input.requestedFields);
    if (
        input.delta.suggestions.some(
            (suggestion) => !requested.has(suggestion.field),
        )
    )
        throw new Error(
            'Card authoring provider returned an unrequested field.',
        );
    const discarded = new Set(input.discardedSuggestionIds);
    const suggestions = (input.predecessor?.suggestions ?? []).filter(
        (suggestion) => !discarded.has(suggestion.id),
    );
    for (const candidate of input.delta.suggestions) {
        const fieldSuggestions = suggestions.filter(
            (suggestion) => suggestion.field === candidate.field,
        );
        if (
            fieldSuggestions.some(
                (suggestion) => suggestion.value === candidate.value,
            )
        )
            throw new DictionaryCardAuthoringDuplicateSuggestionError(
                candidate.field,
            );
        if (
            fieldSuggestions.length >=
            dictionaryCardAuthoringSuggestionLimitPerField
        )
            throw new DictionaryCardAuthoringSuggestionLimitError(
                candidate.field,
            );
        suggestions.push({ ...candidate, id: input.nextId() });
    }
    return DictionaryCardAuthoringProposalPayloadSchema.parse({
        source: input.source,
        suggestions,
    });
}

export function resolveDictionaryCardAuthoringFields(
    settings: z.infer<typeof DictionaryGenerationEffectiveSettingsSchema>,
    scope: z.infer<typeof DictionaryCardAuthoringScopeSchema>,
): DictionaryCardAuthoringField[] {
    const eligible: DictionaryCardAuthoringField[] = ['translation'];
    if (settings.transcriptionEnabled) eligible.push('transcription');
    if (settings.definitionEnabled) eligible.push('definition');
    if (settings.exampleEnabled) eligible.push('example');
    if (settings.exampleTranslationEnabled) eligible.push('exampleTranslation');
    return scope.kind === 'all'
        ? eligible
        : eligible.includes(scope.field)
          ? [scope.field]
          : [];
}

export function dictionaryCardAuthoringProviderInput(
    input: DictionaryCardAuthoringGenerationInputPayload,
): DictionaryCardAuthoringProviderInput {
    return DictionaryCardAuthoringProviderInputSchema.parse({
        sourceLanguage: input.context.sourceLanguage,
        targetLanguage: input.context.targetLanguage,
        source: input.source,
        effectiveSettings: input.effectiveSettings,
        requestedFields: resolveDictionaryCardAuthoringFields(
            input.effectiveSettings,
            input.scope,
        ),
        fieldContext: resolveDictionaryCardAuthoringFields(
            input.effectiveSettings,
            input.scope,
        ).map((field) => ({
            field,
            currentValue: input.draft.values[field],
            excludedValues:
                input.excludedValues.find((entry) => entry.field === field)
                    ?.values ?? [],
        })),
    });
}

export function validateDictionaryCardAuthoringProviderDelta(
    input: DictionaryCardAuthoringProviderInput,
    value: unknown,
): DictionaryCardAuthoringProviderDelta {
    const delta = DictionaryCardAuthoringProviderDeltaSchema.parse(value);
    const fields = delta.suggestions.map((suggestion) => suggestion.field);
    if (
        fields.length !== input.requestedFields.length ||
        input.requestedFields.some((field) => !fields.includes(field))
    )
        throw new Error(
            'Card authoring provider must return every requested field exactly once.',
        );
    for (const suggestion of delta.suggestions) {
        const context = input.fieldContext.find(
            (entry) => entry.field === suggestion.field,
        )!;
        if (
            suggestion.value === context.currentValue ||
            context.excludedValues.includes(suggestion.value)
        )
            throw new Error(
                'Card authoring provider suggestion must be distinct.',
            );
    }
    return delta;
}

export type DictionaryCardAuthoringField = z.infer<
    typeof DictionaryCardAuthoringFieldSchema
>;
export type DictionaryCardAuthoringDraft = z.infer<
    typeof DictionaryCardAuthoringDraftSchema
>;
export type DictionaryCardAuthoringScope = z.infer<
    typeof DictionaryCardAuthoringScopeSchema
>;
export type DictionaryCardAuthoringGenerationInputPayload = z.infer<
    typeof DictionaryCardAuthoringGenerationInputPayloadSchema
>;
export type DictionaryCardAuthoringProviderInput = z.infer<
    typeof DictionaryCardAuthoringProviderInputSchema
>;
export type DictionaryCardAuthoringProviderDelta = z.infer<
    typeof DictionaryCardAuthoringProviderDeltaSchema
>;
export type DictionaryCardAuthoringSuggestion = z.infer<
    typeof DictionaryCardAuthoringSuggestionSchema
>;
export type DictionaryCardAuthoringProposalPayload = z.infer<
    typeof DictionaryCardAuthoringProposalPayloadSchema
>;
