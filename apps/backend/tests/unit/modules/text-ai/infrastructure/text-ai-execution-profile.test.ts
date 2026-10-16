import { describe, expect, it } from 'vitest';
import {
    findTextAiModel,
    textAiExecutionLimits,
    type TextAiExecutionSnapshot,
} from '../../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import {
    resolveTextAiExecutionSnapshot,
    resolveTextAiProviderOptions,
} from '../../../../../src/modules/text-ai/infrastructure/ai/text-ai-provider-resolver';

function snapshot(modelId: string, format: string): TextAiExecutionSnapshot {
    const model = findTextAiModel('deepseek', modelId)!;
    return {
        adapterRevision: model.adapterRevision,
        aggregateBudget: model.aggregateBudget,
        credentialReference: model.credentialReference,
        creditPricing: model.creditPricing,
        enabledModelIds: [model.id],
        modelId: model.id,
        ...textAiExecutionLimits(model, [format]),
        providerId: model.providerId,
        supportedFormats: [format],
    };
}

describe('reviewed Texts execution limits', () => {
    it('preserves dictionary and legacy route limits', () => {
        for (const modelId of ['deepseek-chat', 'deepseek-flash']) {
            const execution = snapshot(modelId, 'single-card:v2');
            expect(execution.perCallMaxOutputTokens).toBe(8192);
            expect(
                resolveTextAiExecutionSnapshot(
                    execution,
                    execution.aggregateBudget,
                ).id,
            ).toBe(modelId);
        }
        expect(
            snapshot('deepseek-chat', 'text-translation:v2')
                .perCallMaxOutputTokens,
        ).toBe(8192);
    });

    it('passes the pinned reviewed Flash translation limits to the adapter', () => {
        const execution = snapshot('deepseek-flash', 'text-translation:v2');
        const options = resolveTextAiProviderOptions({
            snapshot: execution,
            budget: execution.aggregateBudget,
            credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
        });
        expect(options.modelRequestLimits).toEqual({
            maxInputTokens: 128000,
            maxOutputTokens: 32768,
        });
        expect(
            execution.aggregateBudget.maxOutputTokensPerAttempt,
        ).toBeGreaterThanOrEqual(options.modelRequestLimits.maxOutputTokens);
    });

    it('rejects unreviewed caps and using translation caps for dictionary work', () => {
        const execution = snapshot('deepseek-flash', 'text-translation:v2');
        for (const invalid of [
            { ...execution, perCallMaxOutputTokens: 32769 },
            { ...execution, supportedFormats: ['single-card:v2'] },
            { ...execution, modelId: 'deepseek-chat' },
        ]) {
            expect(() =>
                resolveTextAiExecutionSnapshot(
                    invalid,
                    invalid.aggregateBudget,
                ),
            ).toThrow('unsupported');
        }
    });
});
