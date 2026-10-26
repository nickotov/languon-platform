import type { z } from 'zod';
import { SUPPORTED_LANGUAGE_TAGS } from '@languon/languages';
import { getLocalPrompt } from '@languon/prompts';
import {
    TextAiFlowIdSchema,
    TextDetectionResultSchema,
    PortraitInterviewerOutputSchema,
    type TextAiFlowId,
} from '@languon/contracts';
import type { TextAiSyntheticFlow } from '../../modules/text-ai/infrastructure/ai/text-ai-probe-executor';
import { DictionaryCardGenerationModelOutputSchema } from '../../modules/dictionaries/infrastructure/ai/card-proposal-generators';
import {
    DictionaryCardAuthoringModelInputSchema,
    DictionaryCardAuthoringModelOutputSchema,
} from '../../modules/dictionaries/infrastructure/ai/card-authoring-proposal-generators';
import { dictionaryCardAuthoringInstructions } from '../../modules/dictionaries/infrastructure/ai/dictionary-card-authoring-agent';
import { DictionaryPastedTermsChunkModelOutputSchema } from '../../modules/dictionaries/infrastructure/ai/pasted-terms-proposal-generators';
import { DictionaryImportPairsGenerationProposalPayloadSchema } from '../../modules/dictionaries/domain/batch-generation';
import {
    DictionarySingleCardGenerationInputPayloadSchema,
    DictionaryPastedTermsGenerationInputPayloadSchema,
    DictionaryImportPairsGenerationInputPayloadSchema,
} from '../../modules/dictionaries/domain/generation';
import { validateDictionaryCardAuthoringProviderDelta } from '../../modules/dictionaries/domain/card-authoring';
import { defaultDictionarySettings } from '../../modules/dictionaries/domain/settings';
import { selectionProviderInput } from '../../modules/dictionaries/domain/text-selection';
import {
    sentenceGenerationProviderSchema,
    sentenceCheckProviderSchema,
} from '../../modules/learning/infrastructure/ai/sentence-provider-envelope';
import { TextTranslationProviderOutputSchema } from '../../modules/texts/infrastructure/ai/texts-ai-provider';
import { buildInterviewRequest } from '../../modules/learner-portraits/infrastructure/ai/interview-request';
import { validateReusablePortraitItems } from '../../modules/learner-portraits/domain/portrait-policy';

/** Code-owned semantic contract versions. Bump the affected entry whenever its
 * production validator or probe validate callback changes beyond JSON shape. */
export const textAiSyntheticValidationRevisions: Record<TextAiFlowId, string> =
    {
        'single-card': 'card-proposal-validation:v2',
        'card-authoring': 'atomic-authoring-validation:v3',
        'pasted-terms': 'pasted-row-identity-validation:v2',
        'import-pairs': 'import-pair-identity-validation:v2',
        'document-terms': 'document-enrichment-validation:v2',
        'sentence-generation': 'sentence-alias-validation:v2',
        'sentence-check': 'sentence-target-validation:v1',
        'text-detection': 'text-detection-validation:v1',
        'text-translation': 'text-alignment-validation:v3',
        'text-selection-card': 'selection-occurrence-validation:v1',
        conversation: 'conversation-base-response-validation:v1',
        'portrait-interview': 'reusable-portrait-validation:v1',
    };

const dictionaryId = '00000000-0000-4000-8000-000000000001';
const context = {
    dictionaryId,
    expectedDictionaryVersion: 1,
    expectedSettingsVersion: 1,
    sourceLanguage: 'en',
    targetLanguage: 'es',
};
const settings = {
    transcriptionCustomLabel: null,
    definitionEnabled: true,
    definitionLanguage: 'target',
    exampleEnabled: true,
    exampleLanguage: 'source',
    exampleTranslationEnabled: true,
    exampleTranslationLanguage: 'target',
    transcriptionEnabled: false,
    transcriptionNotation: 'ipa',
} as const;

function structured(
    instructions: string,
    input: unknown,
    schema: z.ZodType,
    validate?: (value: unknown) => void,
): TextAiSyntheticFlow {
    return {
        validationRevision: 'structured-flow-validation:v1',
        instructions,
        input: JSON.stringify(input),
        schema,
        validate(value) {
            try {
                schema.parse(value);
                validate?.(value);
                return true;
            } catch {
                return false;
            }
        },
    };
}

/** Synthetic production-shaped contract checks, not a live linguistic-quality score. */
export function createTextAiSyntheticFlows(): Record<
    TextAiFlowId,
    TextAiSyntheticFlow
> {
    const authoringInput = DictionaryCardAuthoringModelInputSchema.parse({
        sourceLanguage: 'en',
        targetLanguage: 'es',
        source: 'book',
        translationContext: null,
        effectiveSettings: settings,
        requestedFields: ['translation'],
        fieldContext: [
            { field: 'translation', currentValue: null, excludedValues: [] },
        ],
    });
    const selectionInput = selectionProviderInput(
        {
            phrase: 'book',
            sourceLanguageTag: 'en',
            targetLanguageTag: 'es',
            sentence: 'I read a book.',
            previousSentence: null,
            nextSentence: null,
            startOffset: 9,
            endOffset: 13,
        },
        defaultDictionarySettings,
        null,
    );
    const singleInput = DictionarySingleCardGenerationInputPayloadSchema.parse({
        format: 'single-card:v2',
        instruction: 'Provide the Spanish translation.',
        translationContext: null,
        context: {
            ...context,
            cardId: '00000000-0000-4000-8000-000000000002',
            expectedCardVersion: 1,
        },
        original: {
            authorship: 'human',
            effectiveSettings: settings,
            overrides: {
                transcriptionCustomLabel: null,
                definitionEnabled: null,
                definitionLanguage: null,
                exampleEnabled: null,
                exampleLanguage: null,
                exampleTranslationEnabled: null,
                transcriptionEnabled: null,
                transcriptionNotation: null,
            },
            values: {
                source: 'book',
                translation: 'libro',
                definition: 'Objeto para leer.',
                example: 'I read a book.',
                exampleTranslation: 'Leo un libro.',
                transcription: null,
            },
        },
    });
    const pastedInput = DictionaryPastedTermsGenerationInputPayloadSchema.parse(
        {
            format: 'pasted-terms:v2',
            translationContext: null,
            effectiveSettings: settings,
            sharedContext: null,
            context,
            rows: [{ rowIndex: 0, input: 'book' }],
        },
    );
    const importedInput =
        DictionaryImportPairsGenerationInputPayloadSchema.parse({
            format: 'import-pairs:v2',
            translationContext: null,
            importFingerprint:
                'hmac-sha256:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            instruction: null,
            effectiveSettings: settings,
            context,
            rows: [
                {
                    rowIndex: 0,
                    source: 'book',
                    translation: 'libro',
                    lineage: {
                        importFingerprint:
                            'hmac-sha256:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
                        importedRowIndex: 0,
                    },
                },
            ],
        });
    const pasted = () =>
        structured(
            getLocalPrompt('dictionary-pasted-terms-generation-agent'),
            pastedInput,
            DictionaryPastedTermsChunkModelOutputSchema,
            (value) => {
                const parsed =
                    DictionaryPastedTermsChunkModelOutputSchema.parse(value);
                const rows = [...parsed.candidates, ...parsed.failures];
                if (
                    rows.length !== 1 ||
                    rows[0]?.rowIndex !== 0 ||
                    rows[0]?.input !== 'book'
                )
                    throw new Error('Synthetic row identity mismatch.');
            },
        );
    const flows: Record<TextAiFlowId, TextAiSyntheticFlow> = {
        'single-card': structured(
            getLocalPrompt('dictionary-card-generation-agent'),
            singleInput,
            DictionaryCardGenerationModelOutputSchema,
        ),
        'card-authoring': structured(
            dictionaryCardAuthoringInstructions(),
            authoringInput,
            DictionaryCardAuthoringModelOutputSchema,
            (value) => {
                validateDictionaryCardAuthoringProviderDelta(
                    authoringInput,
                    value,
                );
            },
        ),
        'pasted-terms': pasted(),
        // Document extraction is deterministic; its AI enrichment is the same production pasted-term chunk contract.
        'document-terms': pasted(),
        'import-pairs': structured(
            getLocalPrompt('dictionary-import-pairs-generation-agent'),
            importedInput,
            DictionaryImportPairsGenerationProposalPayloadSchema,
            (value) => {
                const parsed =
                    DictionaryImportPairsGenerationProposalPayloadSchema.parse(
                        value,
                    );
                const rows = [...parsed.candidates, ...parsed.failures];
                if (
                    rows.length !== 1 ||
                    rows[0]?.rowIndex !== 0 ||
                    rows[0]?.source !== 'book' ||
                    rows[0]?.translation !== 'libro'
                )
                    throw new Error('Synthetic imported pair mismatch.');
            },
        ),
        'sentence-generation': structured(
            getLocalPrompt('sentence-generation-agent'),
            {
                generationPolicyVersion: 2,
                direction: 'source-to-target',
                sourceLanguage: 'en',
                targetLanguage: 'es',
                priorityEntryId: 'candidate-1',
                candidates: [
                    {
                        entryId: 'candidate-1',
                        sourceText: 'book',
                        targetText: 'libro',
                    },
                ],
            },
            sentenceGenerationProviderSchema(['candidate-1'], 2),
        ),
        'sentence-check': structured(
            getLocalPrompt('sentence-check-agent'),
            {
                sourceText: 'I read a book.',
                referenceTranslation: 'Leo un libro.',
                sourceLanguage: 'en',
                targetLanguage: 'es',
                answer: 'Leo un libro.',
                explanationLanguage: 'en',
                hintsRevealed: false,
                targets: [
                    {
                        entryId: 'target-1',
                        sourceText: 'book',
                        targetText: 'libro',
                    },
                ],
            },
            sentenceCheckProviderSchema(['target-1']),
        ),
        'text-detection': structured(
            getLocalPrompt('text-detection-agent'),
            {
                sourceText: 'I read a book.',
                supportedLanguages: SUPPORTED_LANGUAGE_TAGS,
            },
            TextDetectionResultSchema,
        ),
        'text-translation': structured(
            getLocalPrompt('text-translation-agent'),
            {
                sourceText: 'I read a book.',
                sourceLanguage: 'en',
                targetLanguage: 'es',
                segments: [
                    {
                        pairId: '00000000-0000-4000-8000-000000000003',
                        text: 'I read a book.',
                        startOffset: 0,
                        endOffset: 14,
                        paragraphIndex: 0,
                    },
                ],
            },
            TextTranslationProviderOutputSchema,
            (value) => {
                const result = TextTranslationProviderOutputSchema.parse(value);
                if (
                    result.translation.length !== 1 ||
                    result.translation[0]?.pairId !==
                        '00000000-0000-4000-8000-000000000003'
                )
                    throw new Error('Synthetic text alignment mismatch.');
            },
        ),
        'text-selection-card': structured(
            dictionaryCardAuthoringInstructions(),
            selectionInput,
            DictionaryCardAuthoringModelOutputSchema,
            (value) => {
                validateDictionaryCardAuthoringProviderDelta(
                    selectionInput,
                    value,
                );
            },
        ),
        conversation: {
            validationRevision: 'conversation-base-response-validation:v1',
            streaming: true,
            instructions: getLocalPrompt('contextual-language-tutor'),
            input: 'Synthetic language exercise: explain briefly how “book” is used in “I read a book.” Do not use tools.',
            validate: (value) =>
                typeof value === 'string' && value.trim().length > 0,
        },
        'portrait-interview': structured(
            getLocalPrompt('learner-interviewer'),
            JSON.parse(
                buildInterviewRequest({
                    context: {
                        locale: 'en',
                        approvedItems: null,
                        draftItems: null,
                        messages: [],
                        completedTopics: [],
                    },
                    input: {
                        kind: 'chat',
                        topic: 'style',
                        text: 'I prefer short explanations and examples.',
                    },
                }),
            ),
            PortraitInterviewerOutputSchema,
            (value) => {
                const result = PortraitInterviewerOutputSchema.parse(value);
                if (result.proposedItems)
                    validateReusablePortraitItems(result.proposedItems);
            },
        ),
    };
    // Adding a registered flow without its real check contract must fail closed.
    for (const id of TextAiFlowIdSchema.options) {
        if (!flows[id]) throw new Error('Missing synthetic flow contract.');
        flows[id].validationRevision = textAiSyntheticValidationRevisions[id];
    }
    return flows;
}
