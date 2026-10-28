import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { ProviderPrice } from '@languon/contracts';
import {
    recordProviderExpense,
    type Transaction,
} from '../../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-persistence-support';

const price: ProviderPrice = {
    id: '00000000-0000-4000-8000-000000000001',
    version: 1,
    createdAt: '2026-10-28T12:00:00.000Z',
    effectiveAt: '2026-10-28T12:00:00.000Z',
    createdBy: null,
    providerId: 'openrouter',
    modelId: 'synthetic',
    meter: 'text-tokens',
    inputUsdPerMillionTokens: null,
    outputUsdPerMillionTokens: null,
    cacheReadUsdPerMillionTokens: null,
    cacheWriteUsdPerMillionTokens: null,
    minimumUsdPerRequest: null,
    usdPer1000Characters: null,
    reason: 'Synthetic native expense fixture',
    sourceReference: 'fixture',
    sourceUrl: null,
    nativeRules: {
        version: 1,
        validFrom: '2026-10-28T12:00:00.000Z',
        validUntil: null,
        variants: [
            {
                id: 'default',
                applies: {},
                components: [
                    {
                        meter: 'inputTokens',
                        pricePerUnit: '1',
                        unitQuantity: 1_000_000,
                        chargeWhen: 'positive-usage',
                    },
                ],
            },
        ],
    },
};
const fact = {
    attemptReference: 'legacy:00000000-0000-4000-8000-000000000002',
    attemptId: '00000000-0000-4000-8000-000000000002',
    actionId: '00000000-0000-4000-8000-000000000003',
    providerId: 'openrouter',
    modelId: 'synthetic',
    measurement: 'unknown' as const,
    costSource: 'unknown' as const,
    amountUsdMicros: null,
    occurredAt: new Date('2026-10-28T12:00:00.000Z'),
};

describe('native text expense authority', () => {
    it('lets DB checkpoints retain known reported money when SDK aggregate tokens are absent', async () => {
        const execute = vi.fn(async (_query: SQL) => []);
        await recordProviderExpense(
            { execute } as unknown as Transaction,
            fact,
            { nativePrice: price },
        );
        const query = new PgDialect().sqlToQuery(execute.mock.calls[0]![0]!);
        expect(query.params).toEqual([fact.attemptId, null]);
    });

    it('retains the full amount and identity assertion for legacy pins', async () => {
        const execute = vi.fn(async (_query: SQL) => []);
        await recordProviderExpense(
            { execute } as unknown as Transaction,
            fact,
        );
        const query = new PgDialect().sqlToQuery(execute.mock.calls[0]![0]!);
        expect(query.params[0]).toBe(fact.attemptId);
        expect(JSON.parse(String(query.params[1]))).toMatchObject({
            attemptId: fact.attemptId,
            measurement: 'unknown',
            costSource: 'unknown',
            amountUsdMicros: null,
        });
    });
});
