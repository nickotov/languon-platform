import { z } from 'zod';

import { dictionaryLimits } from './limits';
import {
    DictionaryGenerationCardOverridesSchema,
    DictionaryGenerationEffectiveSettingsSchema,
    DictionaryGenerationTranslationContextSchema,
} from './generation-card-context';

export const dictionaryCardAuthoringGenerationFormat =
    'card-authoring:v3' as const;
export const dictionaryCardAuthoringGenerationFormatV2 =
    'card-authoring:v2' as const;
export const dictionaryCardAuthoringGenerationFormatV1 =
    'card-authoring:v1' as const;
export const dictionaryCardAuthoringGenerationFormats = [
    dictionaryCardAuthoringGenerationFormatV1,
    dictionaryCardAuthoringGenerationFormatV2,
    dictionaryCardAuthoringGenerationFormat,
] as const;
export const usesModernCardAuthoringSemantics = (format: string) =>
    format === dictionaryCardAuthoringGenerationFormatV2 ||
    format === dictionaryCardAuthoringGenerationFormat;
export const dictionaryCardAuthoringSuggestionLimitPerField = 6;
export const dictionaryCardAuthoringExcludedValueLimitPerField = 24;

export const DictionaryCardAuthoringFieldSchema = z.enum([
    'source',
    'translation',
    'transcription',
    'definition',
    'example',
    'exampleTranslation',
]);
export const DictionaryCardAuthoringValueFieldSchema =
    DictionaryCardAuthoringFieldSchema.exclude(['source']);

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
        translationContext:
            DictionaryGenerationTranslationContextSchema.optional(),
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
        format: z.union([
            z.literal(dictionaryCardAuthoringGenerationFormatV1),
            z.literal(dictionaryCardAuthoringGenerationFormatV2),
            z.literal(dictionaryCardAuthoringGenerationFormat),
        ]),
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
        translationContext:
            DictionaryGenerationTranslationContextSchema.optional(),
        target: z
            .discriminatedUnion('kind', [
                z.object({ kind: z.literal('create') }).strict(),
                z
                    .object({
                        kind: z.literal('update'),
                        cardId: z.string().uuid(),
                        expectedCardVersion: z.number().int().positive(),
                    })
                    .strict(),
            ])
            .optional(),
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
        if (
            input.format === dictionaryCardAuthoringGenerationFormatV1 &&
            !input.predecessor &&
            input.scope.kind !== 'all'
        )
            context.addIssue({
                code: 'custom',
                path: ['scope'],
                message:
                    'Initial card authoring generation must target all fields',
            });
        if (
            input.format === dictionaryCardAuthoringGenerationFormatV1 &&
            input.scope.kind === 'field' &&
            input.scope.field === 'source'
        )
            context.addIssue({
                code: 'custom',
                path: ['scope', 'field'],
                message: 'V1 card authoring does not support Source generation',
            });
        if (
            input.format !== dictionaryCardAuthoringGenerationFormatV1 &&
            !input.target
        )
            context.addIssue({
                code: 'custom',
                path: ['target'],
                message: 'Card authoring generation requires a target',
            });
        if (
            input.format !== dictionaryCardAuthoringGenerationFormatV1 &&
            input.scope.kind === 'field' &&
            input.scope.field === 'exampleTranslation' &&
            input.draft.values.example === null
        )
            context.addIssue({
                code: 'custom',
                path: ['draft', 'values', 'example'],
                message: 'Example translation generation requires an Example',
            });
        if (
            input.format === dictionaryCardAuthoringGenerationFormatV1 &&
            input.target
        )
            context.addIssue({
                code: 'custom',
                path: ['target'],
                message:
                    'V1 card authoring generation does not support a target',
            });
        if (
            input.format === dictionaryCardAuthoringGenerationFormat &&
            input.translationContext === undefined
        )
            context.addIssue({
                code: 'custom',
                path: ['translationContext'],
                message: 'Translation context snapshot is required for v3',
            });
        if (
            input.format === dictionaryCardAuthoringGenerationFormat &&
            input.draft.translationContext === undefined
        )
            context.addIssue({
                code: 'custom',
                path: ['draft', 'translationContext'],
                message: 'Card translation context is required for v3',
            });
        if (
            input.format !== dictionaryCardAuthoringGenerationFormat &&
            input.translationContext !== undefined
        )
            context.addIssue({
                code: 'custom',
                path: ['translationContext'],
                message: 'Translation context is not supported before v3',
            });
        if (
            input.format !== dictionaryCardAuthoringGenerationFormat &&
            input.draft.translationContext !== undefined
        )
            context.addIssue({
                code: 'custom',
                path: ['draft', 'translationContext'],
                message: 'Card translation context is not supported before v3',
            });
        const requested = resolveDictionaryCardAuthoringFields(
            input.effectiveSettings,
            input.scope,
            input.format !== dictionaryCardAuthoringGenerationFormatV1,
        );
        if (input.scope.kind === 'field' && requested.length === 0)
            context.addIssue({
                code: 'custom',
                path: ['scope', 'field'],
                message: 'The requested authoring field is not enabled',
            });
        // The store derives exclusions from actual predecessor history. A v2
        // successor may legitimately request a field that its predecessor did
        // not generate, in which case there is no prior value to exclude.
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
        exampleForTranslation: boundedText(
            dictionaryLimits.optionalLongValueCodePoints,
        ).optional(),
        effectiveSettings: DictionaryGenerationEffectiveSettingsSchema,
        translationContext: DictionaryGenerationTranslationContextSchema,
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
        const needsExistingExample =
            input.requestedFields.includes('exampleTranslation') &&
            !input.requestedFields.includes('example');
        if (input.exampleForTranslation !== undefined && !needsExistingExample)
            context.addIssue({
                code: 'custom',
                path: ['exampleForTranslation'],
                message:
                    'Existing Example context is required only for field-local Example translation',
            });
    });

const suggestionValueSchema = z.union([
    boundedText(dictionaryLimits.requiredCardValueCodePoints),
    boundedText(dictionaryLimits.optionalLongValueCodePoints),
]);

export const DictionaryCardAuthoringProviderDeltaSchema = z
    .object({
        sourceResult: z
            .discriminatedUnion('kind', [
                z.object({ kind: z.literal('unchanged') }).strict(),
                z
                    .object({
                        kind: z.literal('suggested'),
                        value: boundedText(
                            dictionaryLimits.requiredCardValueCodePoints,
                        ),
                    })
                    .strict(),
            ])
            .nullable()
            .optional(),
        suggestions: z
            .array(
                z
                    .object({
                        field: DictionaryCardAuthoringValueFieldSchema,
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
        basisSource: boundedText(
            dictionaryLimits.requiredCardValueCodePoints,
        ).optional(),
    })
    .strict();

export const DictionaryCardAuthoringProposalPayloadSchema = z
    .object({
        source: boundedText(dictionaryLimits.requiredCardValueCodePoints),
        translationContext:
            DictionaryGenerationTranslationContextSchema.optional(),
        sourceResult: z
            .discriminatedUnion('kind', [
                z.object({ kind: z.literal('unchanged') }).strict(),
                z
                    .object({
                        kind: z.literal('suggested'),
                        suggestionId: z.string().uuid(),
                    })
                    .strict(),
            ])
            .nullable()
            .optional(),
        sourceSuggestions: z
            .array(
                z
                    .object({
                        id: z.string().uuid(),
                        field: z.literal('source'),
                        value: boundedText(
                            dictionaryLimits.requiredCardValueCodePoints,
                        ),
                    })
                    .strict(),
            )
            .max(dictionaryCardAuthoringSuggestionLimitPerField)
            .optional(),
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
    .strict()
    .superRefine((proposal, context) => {
        const ids = [
            ...(proposal.sourceSuggestions ?? []).map((item) => item.id),
            ...proposal.suggestions.map((item) => item.id),
        ];
        if (new Set(ids).size !== ids.length)
            context.addIssue({
                code: 'custom',
                message: 'Authoring suggestion IDs must be unique',
            });
        if (
            proposal.sourceResult?.kind === 'suggested' &&
            !(proposal.sourceSuggestions ?? []).some(
                (item) =>
                    item.id ===
                    (proposal.sourceResult?.kind === 'suggested'
                        ? proposal.sourceResult.suggestionId
                        : ''),
            )
        )
            context.addIssue({
                code: 'custom',
                path: ['sourceResult', 'suggestionId'],
                message:
                    'Latest Source suggestion must reference retained history',
            });
    });

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
    format?:
        | typeof dictionaryCardAuthoringGenerationFormatV1
        | typeof dictionaryCardAuthoringGenerationFormatV2
        | typeof dictionaryCardAuthoringGenerationFormat;
    translationContext?: string | null;
    source: string;
    predecessor?: DictionaryCardAuthoringProposalPayload;
    discardedSuggestionIds: readonly string[];
    delta: DictionaryCardAuthoringProviderDelta;
    requestedFields: readonly DictionaryCardAuthoringField[];
    nextId: () => string;
}): DictionaryCardAuthoringProposalPayload {
    const discarded = new Set(input.discardedSuggestionIds);
    if (
        input.predecessor &&
        input.predecessor.source !== input.source &&
        !(
            usesModernCardAuthoringSemantics(input.format ?? '') &&
            (input.predecessor.sourceSuggestions ?? []).some(
                (suggestion) =>
                    !discarded.has(suggestion.id) &&
                    suggestion.value === input.source,
            )
        )
    )
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
        const basisSource =
            input.delta.sourceResult?.kind === 'suggested'
                ? input.delta.sourceResult.value
                : input.source;
        suggestions.push(
            usesModernCardAuthoringSemantics(input.format ?? '')
                ? { ...candidate, basisSource, id: input.nextId() }
                : { ...candidate, id: input.nextId() },
        );
    }
    const sourceSuggestions = (
        input.predecessor?.sourceSuggestions ?? []
    ).filter((suggestion) => !discarded.has(suggestion.id));
    let sourceResult = input.predecessor?.sourceResult ?? null;
    if (requested.has('source')) {
        if (input.delta.sourceResult?.kind === 'suggested') {
            if (
                sourceSuggestions.some(
                    (item) =>
                        item.value ===
                        (input.delta.sourceResult?.kind === 'suggested'
                            ? input.delta.sourceResult.value
                            : ''),
                )
            )
                throw new DictionaryCardAuthoringDuplicateSuggestionError(
                    'source',
                );
            if (
                sourceSuggestions.length >=
                dictionaryCardAuthoringSuggestionLimitPerField
            )
                throw new DictionaryCardAuthoringSuggestionLimitError('source');
            const id = input.nextId();
            sourceSuggestions.push({
                field: 'source',
                id,
                value: input.delta.sourceResult.value,
            });
            sourceResult = { kind: 'suggested', suggestionId: id };
        } else {
            sourceResult = input.delta.sourceResult ?? null;
        }
    } else if (
        sourceResult?.kind === 'suggested' &&
        discarded.has(sourceResult.suggestionId)
    ) {
        sourceResult = null;
    }
    return DictionaryCardAuthoringProposalPayloadSchema.parse({
        source: input.predecessor?.source ?? input.source,
        ...(usesModernCardAuthoringSemantics(input.format ?? '')
            ? { sourceResult, sourceSuggestions }
            : {}),
        ...(input.format === dictionaryCardAuthoringGenerationFormat
            ? { translationContext: input.translationContext ?? null }
            : {}),
        suggestions,
    });
}

export function resolveDictionaryCardAuthoringFields(
    settings: z.infer<typeof DictionaryGenerationEffectiveSettingsSchema>,
    scope: z.infer<typeof DictionaryCardAuthoringScopeSchema>,
    useV2FieldSemantics = false,
): DictionaryCardAuthoringField[] {
    const eligible: DictionaryCardAuthoringField[] = [
        ...(useV2FieldSemantics ? (['source'] as const) : []),
        'translation',
    ];
    if (settings.transcriptionEnabled) eligible.push('transcription');
    if (settings.definitionEnabled) eligible.push('definition');
    if (settings.exampleEnabled) eligible.push('example');
    if (settings.exampleTranslationEnabled) eligible.push('exampleTranslation');
    if (scope.kind === 'all') return eligible;
    if (!eligible.includes(scope.field)) return [];
    if (!useV2FieldSemantics) return [scope.field];
    if (scope.field === 'translation')
        return eligible.filter((field) => field !== 'source');
    if (scope.field === 'example')
        return eligible.filter(
            (field) => field === 'example' || field === 'exampleTranslation',
        );
    return [scope.field];
}

export function dictionaryCardAuthoringProviderInput(
    input: z.infer<typeof DictionaryCardAuthoringGenerationInputPayloadSchema>,
): DictionaryCardAuthoringProviderInput {
    const requestedFields = resolveDictionaryCardAuthoringFields(
        input.effectiveSettings,
        input.scope,
        input.format !== dictionaryCardAuthoringGenerationFormatV1,
    );
    return DictionaryCardAuthoringProviderInputSchema.parse({
        sourceLanguage: input.context.sourceLanguage,
        targetLanguage: input.context.targetLanguage,
        source: input.source,
        ...(input.draft.values.example &&
        requestedFields.includes('exampleTranslation') &&
        !requestedFields.includes('example')
            ? { exampleForTranslation: input.draft.values.example }
            : {}),
        effectiveSettings: input.effectiveSettings,
        translationContext: input.translationContext ?? null,
        requestedFields,
        fieldContext: requestedFields.map((field) => ({
            field,
            currentValue:
                field === 'source' ? input.source : input.draft.values[field],
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
    const sourceRequested = input.requestedFields.includes('source');
    if (sourceRequested !== (delta.sourceResult != null))
        throw new Error(
            'Card authoring provider must return Source exactly when requested.',
        );
    const fields = delta.suggestions.map((suggestion) => suggestion.field);
    const requestedValueFields = input.requestedFields.filter(
        (field) => field !== 'source',
    );
    if (fields.some((field) => !requestedValueFields.includes(field)))
        throw new Error(
            'Card authoring provider must not return unrequested fields.',
        );
    const suggestions = delta.suggestions.filter((suggestion) => {
        const context = input.fieldContext.find(
            (entry) => entry.field === suggestion.field,
        )!;
        return (
            suggestion.value !== context.currentValue &&
            !context.excludedValues.includes(suggestion.value)
        );
    });
    let sourceResult = delta.sourceResult;
    if (
        delta.sourceResult?.kind === 'suggested' &&
        delta.sourceResult.value === input.source
    )
        sourceResult = { kind: 'unchanged' };
    else if (
        delta.sourceResult?.kind === 'suggested' &&
        input.fieldContext
            .find((entry) => entry.field === 'source')
            ?.excludedValues.includes(delta.sourceResult.value)
    )
        throw new Error(
            'Card authoring Source suggestion must not repeat an earlier alternative.',
        );
    return { ...delta, sourceResult, suggestions };
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
type DictionaryCardAuthoringGenerationInputPayloadBase = Omit<
    z.infer<typeof DictionaryCardAuthoringGenerationInputPayloadSchema>,
    'format' | 'target' | 'translationContext'
>;
export type DictionaryCardAuthoringGenerationInputPayload =
    | (DictionaryCardAuthoringGenerationInputPayloadBase & {
          format: typeof dictionaryCardAuthoringGenerationFormatV1;
          translationContext?: never;
          target?: never;
      })
    | (DictionaryCardAuthoringGenerationInputPayloadBase & {
          format: typeof dictionaryCardAuthoringGenerationFormatV2;
          translationContext?: never;
          target:
              | { kind: 'create' }
              | {
                    kind: 'update';
                    cardId: string;
                    expectedCardVersion: number;
                };
      })
    | (DictionaryCardAuthoringGenerationInputPayloadBase & {
          format: typeof dictionaryCardAuthoringGenerationFormat;
          translationContext: string | null;
          target:
              | { kind: 'create' }
              | {
                    kind: 'update';
                    cardId: string;
                    expectedCardVersion: number;
                };
      });
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
