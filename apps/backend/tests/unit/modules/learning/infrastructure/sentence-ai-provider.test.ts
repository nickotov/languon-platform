import { describe, it, expect, vi } from 'vitest';
const generate = vi.hoisted(() => vi.fn());
vi.mock('@mastra/core/agent', () => ({
    Agent: class {
        generate = generate;
    },
}));
import { createSentenceAiProvider } from '../../../../../src/modules/learning/infrastructure/ai/sentence-ai-provider';
import { textAiModelCatalog } from '../../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import { SentenceInvalidModelOutputError } from '../../../../../src/modules/learning/domain/sentence-errors';
const model = textAiModelCatalog[0]!;
const execution = {
    adapterRevision: model.adapterRevision,
    aggregateBudget: model.aggregateBudget,
    credentialReference: model.credentialReference,
    creditPricing: model.creditPricing,
    enabledModelIds: [model.id],
    modelId: model.id,
    perCallMaxInputTokens: model.perCallMaxInputTokens,
    perCallMaxOutputTokens: model.perCallMaxOutputTokens,
    providerId: model.providerId,
    supportedFormats: ['sentence-generation:v1'],
};
const call = {
    execution,
    budget: model.aggregateBudget,
    idempotencyKey: 'synthetic-generation:1',
    signal: new AbortController().signal,
    input: {
        schemaVersion: 1 as const,
        generationPolicyVersion: 1 as const,
        dictionaryId: 'dictionary',
        direction: 'source-to-target' as const,
        sourceLanguage: 'en' as const,
        targetLanguage: 'de' as const,
        priorityEntryId: '00000000-0000-4000-8000-000000000001',
        candidates: [
            {
                entryId: '00000000-0000-4000-8000-000000000001',
                learningVersion: 5,
                sourceText: 'go',
                targetText: 'gehen',
            },
        ],
    },
};
const draft = {
    sourceText: 'Go.',
    referenceTranslation: 'Geh.',
    segments: [
        { text: 'Go.', entryId: '00000000-0000-4000-8000-000000000001' },
    ],
    targets: [
        {
            entryId: '00000000-0000-4000-8000-000000000001',
            normalizedHint: 'gehen',
            hintForm: 'infinitive',
        },
    ],
};
const providerDraft = {
    ...draft,
    segments: draft.segments.map((segment) => ({
        ...segment,
        entryId: 'candidate-1',
    })),
    targets: draft.targets.map((target) => ({
        ...target,
        entryId: 'candidate-1',
    })),
};
describe('sentence structured provider boundary', () => {
    it('hides private input/output, prohibits tools and pins bounded single-attempt SDK options', async () => {
        generate.mockResolvedValue({
            object: providerDraft,
            usage: { inputTokens: 12, outputTokens: 18 },
        });
        const provider = createSentenceAiProvider({
            credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
        });
        expect(await provider.generate(call)).toEqual({
            draft,
            usage: { inputTokens: 12, outputTokens: 18 },
        });
        expect(generate.mock.calls.at(-1)?.[1]).toMatchObject({
            runId: call.idempotencyKey,
            toolChoice: 'none',
            tracingOptions: { hideInput: true, hideOutput: true },
            modelSettings: { maxRetries: 0 },
        });
    });

    it('projects generation to request-local aliases and excludes all persistent identifiers and versions', async () => {
        generate.mockResolvedValue({ object: providerDraft });
        const provider = createSentenceAiProvider({
            credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
        });
        const result = await provider.generate(call);
        const message = generate.mock.calls.at(-1)?.[0] as string;
        expect(message).not.toContain(call.input.dictionaryId);
        expect(message).not.toContain(call.input.priorityEntryId);
        expect(message).not.toContain('learningVersion');
        expect(message).not.toContain('schemaVersion');
        expect(JSON.parse(message).candidates).toEqual([
            { entryId: 'candidate-1', sourceText: 'go', targetText: 'gehen' },
        ]);
        expect(JSON.parse(message).priorityEntryId).toBe('candidate-1');
        expect(result.draft.targets[0]?.entryId).toBe(
            call.input.priorityEntryId,
        );
    });
    it('projects checks to local aliases while preserving the exact answer and bounded grading context', async () => {
        const checkInput = {
            schemaVersion: 1 as const,
            exerciseId: '00000000-0000-4000-8000-000000000002',
            sourceText: 'Go.',
            referenceTranslation: 'Geh.',
            sourceLanguage: 'en' as const,
            targetLanguage: 'de' as const,
            targets: call.input.candidates,
            answer: '  Geh!  ',
            explanationLanguage: 'en' as const,
            revealedHintIds: ['hint-1'],
        };
        const checkDraft = {
            proposedPercentage: 100,
            meaning: 'correct',
            grammar: 'correct',
            targets: [
                {
                    entryId: 'target-1',
                    status: 'used',
                    explanation: 'Correct vocabulary.',
                },
            ],
            issues: [],
            improvedTranslation: 'Geh!',
            explanation: 'Correct.',
        };
        generate.mockResolvedValue({ object: checkDraft });
        const provider = createSentenceAiProvider({
            credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
        });
        const result = await provider.check({ ...call, input: checkInput });
        const message = generate.mock.calls.at(-1)?.[0] as string;
        expect(message).not.toContain(checkInput.exerciseId);
        expect(message).not.toContain(call.input.priorityEntryId);
        expect(message).not.toContain('learningVersion');
        expect(JSON.parse(message)).toMatchObject({
            answer: '  Geh!  ',
            sourceText: 'Go.',
            referenceTranslation: 'Geh.',
            hintsRevealed: true,
        });
        expect(result.draft.targets[0]?.entryId).toBe(
            call.input.priorityEntryId,
        );
        generate.mockResolvedValue({
            object: {
                ...checkDraft,
                targets: [{ ...checkDraft.targets[0], entryId: 'target-99' }],
            },
        });
        await expect(
            provider.check({ ...call, input: checkInput }),
        ).rejects.toBeInstanceOf(SentenceInvalidModelOutputError);
    });
    it('rejects generation output containing unrecognized local aliases or persistent IDs', async () => {
        const provider = createSentenceAiProvider({
            credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
        });
        generate.mockResolvedValue({
            object: {
                ...providerDraft,
                targets: [
                    {
                        ...providerDraft.targets[0],
                        entryId: call.input.priorityEntryId,
                    },
                ],
            },
        });
        await expect(provider.generate(call)).rejects.toBeInstanceOf(
            SentenceInvalidModelOutputError,
        );
        generate.mockResolvedValue({
            object: {
                ...providerDraft,
                segments: [{ text: 'Go.', entryId: 'candidate-99' }],
            },
        });
        await expect(provider.generate(call)).rejects.toBeInstanceOf(
            SentenceInvalidModelOutputError,
        );
    });
    it('rejects malformed structured output and invalid reported token usage', async () => {
        const provider = createSentenceAiProvider({
            credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
        });
        generate.mockResolvedValueOnce({
            object: { ...providerDraft, unexpected: 'private' },
        });
        await expect(provider.generate(call)).rejects.toBeInstanceOf(
            SentenceInvalidModelOutputError,
        );
        generate.mockResolvedValueOnce({
            object: providerDraft,
            usage: { inputTokens: -1, outputTokens: 18 },
        });
        await expect(provider.generate(call)).rejects.toBeInstanceOf(
            SentenceInvalidModelOutputError,
        );
    });
});
