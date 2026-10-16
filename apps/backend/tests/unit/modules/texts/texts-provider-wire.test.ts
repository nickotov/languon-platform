import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import {
    textAiExecutionLimits,
    textAiModelCatalog,
} from '../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import { createTextsAiProvider } from '../../../../src/modules/texts/infrastructure/ai/texts-ai-provider';
import { segmentText } from '../../../../src/modules/texts/domain/text';

afterEach(() => vi.unstubAllGlobals());

it('sends the pinned Flash translation cap and non-thinking mode on the actual SDK wire', async () => {
    const model = textAiModelCatalog.find((m) => m.id === 'deepseek-flash')!;
    const sourceText =
        'La médiation permet de comprendre.\n\nChacun peut raconter son histoire.';
    const segments = segmentText(sourceText, 'fr', randomUUID);
    const translation = segments.map(({ pairId }) => ({
        pairId,
        text: 'Полный перевод.',
    }));
    const transport = vi.fn<typeof fetch>(
        async () =>
            new Response(
                JSON.stringify({
                    id: 'fixture-capacity',
                    object: 'chat.completion',
                    created: 1,
                    model: model.id,
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: 'assistant',
                                content: JSON.stringify({ translation }),
                            },
                            finish_reason: 'stop',
                        },
                    ],
                    usage: {
                        prompt_tokens: 100,
                        completion_tokens: 200,
                        total_tokens: 300,
                    },
                }),
                {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                },
            ),
    );
    vi.stubGlobal('fetch', transport);
    const result = await createTextsAiProvider({
        credentials: { DEEPSEEK_API_KEY: 'synthetic-wire-key' },
    }).run({
        input: {
            kind: 'text-translation',
            folderId: randomUUID(),
            operationId: randomUUID(),
            sourceText,
            sourceLanguage: 'fr',
            targetLanguage: 'ru',
            segments,
        },
        execution: {
            adapterRevision: model.adapterRevision,
            modelId: model.id,
            providerId: model.providerId,
            credentialReference: model.credentialReference,
            enabledModelIds: [model.id],
            supportedFormats: ['text-translation:v2'],
            aggregateBudget: model.aggregateBudget,
            creditPricing: model.creditPricing,
            ...textAiExecutionLimits(model, ['text-translation:v2']),
        },
        budget: model.aggregateBudget,
        idempotencyKey: 'synthetic-capacity-wire',
        signal: new AbortController().signal,
    });
    expect(result.draft).toEqual({ translation });
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0]!;
    expect(String(url)).toBe('https://api.deepseek.com/chat/completions');
    const body = JSON.parse(String(options?.body));
    expect(body.model).toBe('deepseek-flash');
    expect(body.max_tokens).toBe(32_768);
    expect(body.reasoning_effort).toBe('none');
    expect(JSON.stringify(body.messages)).toContain(
        'La médiation permet de comprendre.',
    );
    expect(body.tools).toBeUndefined();
});
