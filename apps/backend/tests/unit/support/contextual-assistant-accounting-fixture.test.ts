import { expect, it } from 'vitest';
import { z } from 'zod';
import { contextualAssistantFixtureAllowance } from '../../support/contextual-assistant-accounting-fixture';
import { affordableActionOutput } from '../../../src/modules/ai-credits/domain/action-pricing';
import { parseCreditMilli } from '../../../src/modules/ai-credits/domain/exact-credit-amount';
import { textAiModelCatalog } from '../../../src/modules/text-ai/application/text-ai-provider-catalog';
import {
    learningBlockToolDescription,
    learningBlockToolInputSchema,
} from '../../../src/modules/conversations/application/learning-block-tool-contract';

const model = textAiModelCatalog.find((item) => item.id === 'deepseek-flash')!;
const tariff = {
    inputCreditsPerMillionTokens: '1000',
    outputCreditsPerMillionTokens: '3000',
};
it('proves the old twenty-credit action cap cannot admit current proposal framing even with ample wallet credits', () => {
    const schemaBytes =
        Buffer.byteLength(
            JSON.stringify({
                name: 'propose_learning_blocks',
                description: learningBlockToolDescription,
                inputSchema: z.toJSONSchema(learningBlockToolInputSchema, {
                    io: 'input',
                    target: 'draft-7',
                }),
            }),
            'utf8',
        ) + 512;
    // Real tutorReservedInputBytes adds 10k framing; tutorAdmissionInputBytes adds 8192.
    // Even before the actual system prompt, user content, history or memory, this exceeds 20 credits.
    const minimumInputBound = schemaBytes + 10_000 + 8192;
    expect(minimumInputBound).toBeGreaterThan(20_000);
    expect(
        affordableActionOutput({
            budgetMilli: 20_000n,
            inputTokens: minimumInputBound,
            outputLimit: 1,
            tariff,
        }),
    ).toBe(0);
    expect(
        affordableActionOutput({
            budgetMilli: parseCreditMilli(
                contextualAssistantFixtureAllowance(model, tariff),
            ),
            inputTokens: minimumInputBound,
            outputLimit: 8192,
            tariff,
        }),
    ).toBe(8192);
});
it('derives a finite whole-action fixture cap from aggregate token limits and exact customer tariff', () => {
    const allowance = contextualAssistantFixtureAllowance(model, tariff);
    expect(allowance).toBe('385.024');
    expect(
        affordableActionOutput({
            budgetMilli: parseCreditMilli(allowance),
            inputTokens: model.aggregateBudget.maxInputTokensPerAttempt,
            outputLimit: model.aggregateBudget.maxOutputTokensPerAttempt,
            tariff,
        }),
    ).toBe(model.aggregateBudget.maxOutputTokensPerAttempt);
    expect(parseCreditMilli(allowance)).toBeLessThan(1_000_000_000n);
    expect(
        affordableActionOutput({
            budgetMilli: 0n,
            inputTokens: 1,
            outputLimit: 1,
            tariff,
        }),
    ).toBe(0);
});
it('keeps zero-tariff fixtures free and reserves the higher input tariff for unknown cache use', () => {
    expect(
        contextualAssistantFixtureAllowance(model, {
            inputCreditsPerMillionTokens: '0',
            outputCreditsPerMillionTokens: '0',
        }),
    ).toBe('0');
    expect(
        contextualAssistantFixtureAllowance(model, {
            ...tariff,
            cachedInputCreditsPerMillionTokens: '2000',
        }),
    ).toBe('647.168');
});
