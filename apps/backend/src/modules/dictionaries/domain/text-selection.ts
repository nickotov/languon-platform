import { z } from 'zod';
import { DictionaryGenerationCardValuesSchema } from './generation-card-context';
import {
    DictionaryCardAuthoringProviderInputSchema,
    validateDictionaryCardAuthoringProviderDelta,
    type DictionaryCardAuthoringProviderDelta,
} from './card-authoring';
import {
    inheritedCardSettingsOverrides,
    resolveCardSettings,
    type DictionarySettings,
} from './settings';

export const SelectionOccurrenceSchema = z
    .object({
        phrase: z
            .string()
            .min(1)
            .refine((v) => [...v].length <= 200),
        sourceLanguageTag: z.string().min(2).max(35),
        targetLanguageTag: z.string().min(2).max(35),
        sentence: z.string().min(1).max(160_000),
        previousSentence: z.string().max(160_000).nullable(),
        nextSentence: z.string().max(160_000).nullable(),
        startOffset: z.number().int().nonnegative(),
        endOffset: z.number().int().positive(),
    })
    .strict()
    .superRefine((value, context) => {
        if (
            value.sentence.slice(value.startOffset, value.endOffset) !==
                value.phrase ||
            value.phrase !== value.phrase.trim() ||
            value.startOffset >= value.endOffset ||
            value.sourceLanguageTag === value.targetLanguageTag
        )
            context.addIssue({
                code: 'custom',
                message: 'Invalid selected occurrence',
            });
    });
export type SelectionOccurrence = z.infer<typeof SelectionOccurrenceSchema>;
export const selectionCardOverrides = {
    ...inheritedCardSettingsOverrides,
    definitionEnabled: 'enabled',
    exampleEnabled: 'enabled',
    exampleTranslationEnabled: 'enabled',
} as const;
export function selectionProviderInput(
    occurrence: SelectionOccurrence,
    settings: DictionarySettings,
    translationContext: string | null,
) {
    const selected = SelectionOccurrenceSchema.parse(occurrence);
    const effective = resolveCardSettings({
        dictionary: settings,
        overrides: selectionCardOverrides,
    });
    const fields = [
        'source',
        'translation',
        'definition',
        'example',
        'exampleTranslation',
        ...(effective.transcriptionEnabled ? ['transcription' as const] : []),
    ] as const;
    return DictionaryCardAuthoringProviderInputSchema.parse({
        sourceLanguage: selected.sourceLanguageTag,
        targetLanguage: selected.targetLanguageTag,
        source: selected.phrase,
        translationContext,
        occurrenceContext: {
            sentence: selected.sentence,
            previousSentence: selected.previousSentence,
            nextSentence: selected.nextSentence,
            startOffset: selected.startOffset,
            endOffset: selected.endOffset,
        },
        effectiveSettings: {
            transcriptionCustomLabel: effective.customNotationLabel,
            definitionEnabled: true,
            definitionLanguage: effective.definitionLanguageRole,
            exampleEnabled: true,
            exampleLanguage: effective.exampleLanguageRole,
            exampleTranslationEnabled: true,
            exampleTranslationLanguage:
                effective.exampleTranslationLanguageRole,
            transcriptionEnabled: effective.transcriptionEnabled,
            transcriptionNotation: effective.transcriptionNotation,
        },
        requestedFields: fields,
        fieldContext: fields.map((field) => ({
            field,
            currentValue: field === 'source' ? selected.phrase : null,
            excludedValues: [],
        })),
    });
}
export function selectionCardValues(
    input: ReturnType<typeof selectionProviderInput>,
    value: DictionaryCardAuthoringProviderDelta,
) {
    const delta = validateDictionaryCardAuthoringProviderDelta(input, value);
    const field = (name: string) =>
        delta.suggestions.find((s) => s.field === name)?.value ?? null;
    for (const required of input.requestedFields)
        if (required !== 'source' && field(required) === null)
            throw new Error('Missing requested vocabulary field');
    return DictionaryGenerationCardValuesSchema.parse({
        source:
            delta.sourceResult?.kind === 'suggested'
                ? delta.sourceResult.value
                : input.source,
        translation: field('translation'),
        definition: field('definition'),
        example: field('example'),
        exampleTranslation: field('exampleTranslation'),
        transcription: field('transcription'),
    });
}
export class TextSelectionError extends Error {
    constructor(
        public readonly code:
            | 'invalid_request'
            | 'not_found'
            | 'stale_content'
            | 'duplicate_confirmation_required'
            | 'language_pair_mismatch'
            | 'idempotency_conflict'
            | 'capacity_exceeded'
            | 'model_input_too_large'
            | 'access_revoked'
            | 'provider_unavailable',
    ) {
        super(code);
        this.name = 'TextSelectionError';
    }
}
