import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTextsAiProvider } from '../../../../src/modules/texts/infrastructure/ai/texts-ai-provider';
import { segmentText } from '../../../../src/modules/texts/domain/text';
import type { TextsProviderCall } from '../../../../src/modules/texts/application/ports/texts-ai-provider';
import {
    textAiExecutionLimits,
    textAiModelCatalog,
} from '../../../../src/modules/text-ai/application/text-ai-provider-catalog';
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
afterEach(() => vi.unstubAllGlobals());
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
    it('rejects model limits before invoking a provider', async () => {
        const c = call();
        const originalInput = structuredClone(c.input);
        c.execution = { ...c.execution, perCallMaxInputTokens: 5 };
        const http = vi.fn<typeof fetch>(async () => {
            throw new Error('Unexpected HTTP during a rejected request');
        });
        vi.stubGlobal('fetch', http);
        await expect(
            createTextsAiProvider({
                credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
            }).run(c),
        ).rejects.toMatchObject({
            name: 'TextsAiError',
            code: 'model_capacity_exceeded',
        });
        expect(mocks.generate).not.toHaveBeenCalled();
        expect(http).not.toHaveBeenCalled();
        expect(c.input).toEqual(originalInput);
    });
    it('rejects output bounds without truncating source', async () => {
        const c = call();
        const originalInput = structuredClone(c.input);
        c.execution = { ...c.execution, perCallMaxOutputTokens: 5 };
        const http = vi.fn<typeof fetch>(async () => {
            throw new Error('Unexpected HTTP during a rejected request');
        });
        vi.stubGlobal('fetch', http);
        await expect(
            createTextsAiProvider({
                credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
            }).run(c),
        ).rejects.toMatchObject({
            name: 'TextsAiError',
            code: 'model_capacity_exceeded',
        });
        expect(mocks.generate).not.toHaveBeenCalled();
        expect(http).not.toHaveBeenCalled();
        expect(c.input).toEqual(originalInput);
    });
    it('translates a complete French article with extended limits and exact JSON framing', async () => {
        const c = call();
        const model = textAiModelCatalog.find(
            (m) => m.id === 'deepseek-flash',
        )!;
        const sourceText =
            'La médiation permet aux personnes concernées de raconter leur histoire et de comprendre les effets de la violence. '.repeat(
                100,
            );
        c.input = {
            ...c.input,
            kind: 'text-translation',
            sourceText,
            sourceLanguage: 'fr',
            targetLanguage: 'ru',
            segments: segmentText(sourceText, 'fr', randomUUID),
        };
        c.execution = {
            ...c.execution,
            modelId: model.id,
            enabledModelIds: [model.id],
            supportedFormats: ['text-translation:v2'],
            ...textAiExecutionLimits(model, ['text-translation:v2']),
        };
        expect(
            Buffer.byteLength(sourceText) * 2 +
                c.input.segments.length * 100 +
                256,
        ).toBeGreaterThan(32_768);
        mocks.generate.mockResolvedValue({
            object: {
                translation: c.input.segments.map((s) => ({
                    pairId: s.pairId,
                    text: 'Полный перевод предложения. ',
                })),
            },
            usage: { inputTokens: 9_000, outputTokens: 12_000 },
        });
        await expect(
            createTextsAiProvider({
                credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
            }).run(c),
        ).resolves.toMatchObject({
            usage: { inputTokens: 9_000, outputTokens: 12_000 },
        });
        const [message, options] = mocks.generate.mock.calls[0]!;
        expect(JSON.parse(message).sourceText).toBe(sourceText);
        expect(options.modelSettings.maxOutputTokens).toBe(32_768);
        expect(options.providerOptions.openaiCompatible.reasoningEffort).toBe(
            'none',
        );
    });
    it('rejects genuinely excessive framing before provider dispatch', async () => {
        const c = call();
        const model = textAiModelCatalog.find(
            (m) => m.id === 'deepseek-flash',
        )!;
        const sourceText = 'Oui. '.repeat(3_000);
        c.input = {
            ...c.input,
            kind: 'text-translation',
            sourceText,
            sourceLanguage: 'fr',
            targetLanguage: 'ru',
            segments: segmentText(sourceText, 'fr', randomUUID),
        };
        c.execution = {
            ...c.execution,
            modelId: model.id,
            enabledModelIds: [model.id],
            supportedFormats: ['text-translation:v2'],
            ...textAiExecutionLimits(model, ['text-translation:v2']),
        };
        await expect(
            createTextsAiProvider({
                credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
            }).run(c),
        ).rejects.toMatchObject({ code: 'model_capacity_exceeded' });
        expect(mocks.generate).not.toHaveBeenCalled();
    });
    it('never publishes a response stopped at its output limit', async () => {
        const c = call();
        mocks.generate.mockResolvedValue({
            object: {
                translation:
                    c.input.kind === 'text-translation'
                        ? c.input.segments.map((s) => ({
                              pairId: s.pairId,
                              text: 'Translated.',
                          }))
                        : [],
            },
            finishReason: 'length',
            usage: { inputTokens: 50, outputTokens: 8_192 },
        });
        await expect(
            createTextsAiProvider({
                credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
            }).run(c),
        ).rejects.toMatchObject({
            code: 'invalid_model_output',
            usage: { inputTokens: 50, outputTokens: 8_192 },
        });
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
