import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
    createTextsAiProvider,
    preflightTextsRequest,
} from '../../../../src/modules/texts/infrastructure/ai/texts-ai-provider';
import { segmentText } from '../../../../src/modules/texts/domain/text';
import type { TextsProviderCall } from '../../../../src/modules/texts/application/ports/texts-ai-provider';
import { textAiModelCatalog } from '../../../../src/modules/text-ai/application/text-ai-provider-catalog';
const mocks = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('../../../../src/modules/texts/infrastructure/ai/texts-agents', () => ({
    createTextsAgents: () => ({
        textTranslationAgent: { generate: mocks.generate },
        textDetectionAgent: { generate: mocks.generate },
    }),
}));
function call(): TextsProviderCall {
    const model = textAiModelCatalog[0]!;
    const sourceText = 'Whole article.\nSecond sentence with context.';
    return {
        input: {
            kind: 'text-translation',
            operationId: randomUUID(),
            folderId: randomUUID(),
            sourceText,
            sourceLanguage: 'en',
            targetLanguage: 'es',
            segments: segmentText(sourceText, 'en', randomUUID),
        },
        execution: {
            adapterRevision: model.adapterRevision,
            aggregateBudget: model.aggregateBudget,
            credentialReference: model.credentialReference,
            creditPricing: model.creditPricing,
            enabledModelIds: [model.id],
            modelId: model.id,
            providerId: model.providerId,
            perCallMaxInputTokens: model.perCallMaxInputTokens,
            perCallMaxOutputTokens: model.perCallMaxOutputTokens,
            supportedFormats: [...model.supportedFormats],
        },
        budget: model.aggregateBudget,
        signal: new AbortController().signal,
        idempotencyKey: 'provider-idempotency-key',
    };
}
beforeEach(() => vi.clearAllMocks());
describe('Texts production AI adapter', () => {
    it('sends the entire source plus sentence mapping in one call with content tracing disabled', async () => {
        const c = call();
        if (c.input.kind !== 'text-translation') throw Error();
        const translation = c.input.segments.map((s) => ({
            pairId: s.pairId,
            text: 'Traducción.',
        }));
        mocks.generate.mockResolvedValue({
            object: { translation },
            usage: { inputTokens: 50, outputTokens: 50 },
        });
        const provider = createTextsAiProvider({
            credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
        });
        await expect(provider.run(c)).resolves.toEqual({
            draft: { translation },
            usage: { inputTokens: 50, outputTokens: 50 },
        });
        expect(mocks.generate).toHaveBeenCalledTimes(1);
        const [message, options] = mocks.generate.mock.calls[0]!;
        expect(JSON.parse(message)).toEqual({
            sourceText: c.input.sourceText,
            sourceLanguage: 'en',
            targetLanguage: 'es',
            segments: c.input.segments,
        });
        expect(options).toMatchObject({
            runId: 'provider-idempotency-key',
            toolChoice: 'none',
            tracingOptions: { hideInput: true, hideOutput: true },
            modelSettings: { maxRetries: 0 },
        });
    });
    it('rejects model limits before invoking a provider', () => {
        const c = call();
        expect(() =>
            preflightTextsRequest(
                c.input,
                { ...c.execution, perCallMaxInputTokens: 5 },
                c.budget,
            ),
        ).toThrow('This model cannot safely translate');
        expect(mocks.generate).not.toHaveBeenCalled();
    });
    it('rejects output bounds without truncating source', () => {
        const c = call();
        expect(() =>
            preflightTextsRequest(
                c.input,
                { ...c.execution, perCallMaxOutputTokens: 5 },
                c.budget,
            ),
        ).toThrow('This model cannot safely translate');
        expect(c.input.sourceText).toContain('Second sentence');
    });
    it('rejects invalid usage rather than undercharging', async () => {
        const c = call();
        mocks.generate.mockResolvedValue({
            object: { translation: [] },
            usage: { inputTokens: -1, outputTokens: 10 },
        });
        await expect(
            createTextsAiProvider({
                credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
            }).run(c),
        ).rejects.toMatchObject({ code: 'invalid_model_output' });
    });
    it('retains safe token measurements when structured model output is invalid', async () => {
        const c = call();
        mocks.generate.mockResolvedValue({
            object: { unexpected: 'private model content' },
            usage: { inputTokens: 10, outputTokens: 3 },
        });
        await expect(
            createTextsAiProvider({
                credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
            }).run(c),
        ).rejects.toMatchObject({
            code: 'invalid_model_output',
            usage: { inputTokens: 10, outputTokens: 3 },
        });
    });
});
