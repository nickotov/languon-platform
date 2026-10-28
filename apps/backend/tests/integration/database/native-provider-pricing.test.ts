import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PostgresClient } from '@languon/database';
import type {
    ProviderNativePricingRules,
    ProviderNativeUsage,
    ProviderExecutionFacts,
    ProviderPrice,
} from '@languon/contracts';
import { nativeTextProviderReservationMicros } from '../../../src/modules/ai-credits/domain/provider-cost-admission';
import { evaluateNativeProviderCost } from '../../../src/modules/ai-credits/domain/native-provider-pricing';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
} from '../support/test-database';

const instant = '2026-10-28T12:00:00.000Z';
const facts: ProviderExecutionFacts = { dispatchedAt: instant };
const base: ProviderNativePricingRules = {
    version: 1,
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: null,
    variants: [
        {
            id: 'base',
            applies: {},
            components: [
                {
                    meter: 'inputTokens',
                    pricePerUnit: '0.3',
                    unitQuantity: 1_000_000,
                    chargeWhen: 'positive-usage',
                },
                {
                    meter: 'outputTokens',
                    pricePerUnit: '1.2',
                    unitQuantity: 1_000_000,
                    chargeWhen: 'positive-usage',
                },
            ],
        },
    ],
};
const usage: ProviderNativeUsage = {
    inputTokens: 1000,
    outputTokens: 2000,
    requests: 1,
};
describe.runIf(isDatabaseIntegrationEnabled())(
    'native price TypeScript and PostgreSQL parity',
    () => {
        let client: PostgresClient;
        beforeAll(async () => {
            client = createTestPostgresClient();
            await client.unsafe(
                await readFile(
                    new URL(
                        '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/native-pricing-evaluator.sql',
                        import.meta.url,
                    ),
                    'utf8',
                ),
            );
        });
        afterAll(async () => {
            await client?.end();
        });

        async function parity(
            rules: ProviderNativePricingRules,
            quantities: ProviderNativeUsage = usage,
            execution: ProviderExecutionFacts = facts,
            mode: 'actual' | 'upper-bound' = 'actual',
        ) {
            const ts = evaluateNativeProviderCost(
                rules,
                execution,
                quantities,
                mode,
            );
            const rows =
                await client`select languon_evaluate_provider_price(${client.json({ nativeRules: rules })}, ${client.json(execution)}, ${client.json(quantities)}, ${mode}) as value`;
            const actual = rows[0]!.value as {
                status: string;
                amountUsdMicros?: string;
                costSource?: string;
                variantIds?: string[];
            };
            expect(actual.status).toBe(ts.status);
            if (ts.status === 'calculated') {
                expect(actual.amountUsdMicros).toBe(ts.micros.toString());
                expect(actual.costSource).toBe(ts.costSource);
                expect(actual.variantIds).toEqual(ts.variantIds);
            }
            return actual;
        }
        it('keeps TS and SQL mixed-card multi-call reservation envelopes identical', async () => {
            const rules = structuredClone(base);
            rules.currency = {
                code: 'UC',
                usdNumerator: '1',
                unitDenominator: '680000',
            };
            rules.variants[0]!.components.forEach((component) => {
                component.minimum = '100';
                component.chargeWhen = 'request';
                component.rounding = { quantum: '1', mode: 'ceil' };
            });
            const price = {
                meter: 'text-tokens',
                nativeRules: rules,
            } as ProviderPrice;
            for (const maximumCalls of [1, 2, 5]) {
                const expected = nativeTextProviderReservationMicros(
                    price,
                    facts,
                    1000,
                    2000,
                    maximumCalls,
                );
                const rows =
                    await client`select languon_native_text_reservation(${client.json(price)},${client.json(facts)},1000,2000,${maximumCalls}) as value`;
                expect(rows[0]!.value).toMatchObject({
                    status: 'calculated',
                    amountUsdMicros: expected!.toString(),
                });
            }
        });
        it('rejects incompatible text meters, monetary overflow and excessive aggregate rules', async () => {
            const mismatched = structuredClone(base);
            mismatched.variants[0]!.components = [
                {
                    meter: 'characters',
                    pricePerUnit: '1',
                    unitQuantity: 1,
                    chargeWhen: 'positive-usage',
                },
            ];
            const rejected =
                await client`select languon_native_text_reservation(${client.json({ meter: 'text-tokens', nativeRules: mismatched })},${client.json(facts)},1000,1000,5) as value`;
            expect(rejected[0]!.value.status).toBe('unknown');
            const overflow = structuredClone(base);
            overflow.reportedCreditUsdPerCredit = '999999999999';
            expect(
                (
                    await parity(overflow, {
                        requests: 1,
                        providerCreditsConsumed: '999999999999',
                    })
                ).status,
            ).toBe('unknown');
            const large = structuredClone(base);
            large.variants = Array.from({ length: 3 }, (_, i) => ({
                ...structuredClone(base.variants[0]!),
                id: `card-${i}`,
                applies: {
                    endpointIds: Array.from({ length: 110 }, () =>
                        'x'.repeat(195),
                    ),
                },
            }));
            expect((await parity(large)).status).toBe('unknown');
            const object = {
                name: 'é / space',
                array: [1, 2],
                nested: { string: 'a : b' },
            };
            const compact =
                await client`select languon_native_json_bytes(${client.json(object)}) as value`;
            expect(Number(compact[0]!.value)).toBe(
                new TextEncoder().encode(JSON.stringify(object)).length,
            );
        });
        it('retains exact rate precision independently of USD micro settlement', async () => {
            expect((await parity(base)).amountUsdMicros).toBe('2700');
            const precise = structuredClone(base);
            precise.variants[0]!.components = [
                {
                    meter: 'outputTokens',
                    pricePerUnit: '0.0833333333333333',
                    unitQuantity: 1_000_000,
                    chargeWhen: 'positive-usage',
                },
            ];
            expect(
                (
                    await parity(precise, {
                        outputTokens: 1_000_000,
                        requests: 1,
                    })
                ).amountUsdMicros,
            ).toBe('83334');
        });
        it('honors native currency rounding and minima before rational USD conversion', async () => {
            const rules = structuredClone(base);
            rules.currency = {
                code: 'UC',
                usdNumerator: '1',
                unitDenominator: '680000',
            };
            rules.variants[0]!.components = [
                {
                    meter: 'inputTokens',
                    pricePerUnit: '62',
                    unitQuantity: 1000,
                    minimum: '100',
                    chargeWhen: 'request',
                    rounding: { quantum: '1', mode: 'ceil' },
                },
                {
                    meter: 'outputTokens',
                    pricePerUnit: '306',
                    unitQuantity: 1000,
                    minimum: '100',
                    chargeWhen: 'request',
                    rounding: { quantum: '1', mode: 'ceil' },
                },
            ];
            expect(
                (
                    await parity(rules, {
                        inputTokens: 1620,
                        outputTokens: 331,
                        requests: 1,
                    })
                ).amountUsdMicros,
            ).toBe('299');
            expect(
                (
                    await parity(rules, {
                        inputTokens: 0,
                        outputTokens: 0,
                        requests: 1,
                    })
                ).amountUsdMicros,
            ).toBe('295');
        });
        it('separates component minima from a single request minimum', async () => {
            const rules = structuredClone(base);
            rules.variants[0]!.components.forEach((c) => {
                c.minimum = '1';
                c.unitQuantity = 1;
                c.pricePerUnit = '0.1';
            });
            expect(
                (
                    await parity(rules, {
                        inputTokens: 1,
                        outputTokens: 1,
                        requests: 1,
                    })
                ).amountUsdMicros,
            ).toBe('2000000');
        });
        it('uses exact context boundaries, endpoint ambiguity and maximum admission cards', async () => {
            const rules = structuredClone(base);
            const card = structuredClone(rules.variants[0]!);
            rules.variants = [
                {
                    ...card,
                    id: 'low',
                    applies: {
                        inputTokens: { minInclusive: 0, maxExclusive: 272001 },
                    },
                },
                {
                    ...card,
                    id: 'high',
                    applies: { inputTokens: { minInclusive: 272001 } },
                    components: card.components.map((c) => ({
                        ...c,
                        pricePerUnit: '2',
                    })),
                },
            ];
            await parity(rules, { ...usage, inputTokens: 272000 });
            await parity(rules, { ...usage, inputTokens: 272001 });
            await parity(
                rules,
                { ...usage, inputTokens: 300000 },
                facts,
                'upper-bound',
            );
            rules.variants = [
                { ...card, id: 'a', applies: { endpointIds: ['a'] } },
                {
                    ...card,
                    id: 'b',
                    applies: { endpointIds: ['b'] },
                    components: card.components.map((c) => ({
                        ...c,
                        pricePerUnit: '2',
                    })),
                },
            ];
            expect((await parity(rules)).status).toBe('unknown');
            await parity(rules, usage, { ...facts, endpointId: 'a' });
            await parity(rules, usage, facts, 'upper-bound');
        });
        it('prices schedule boundaries and rejects holes across authorized dispatch horizons', async () => {
            const rules = structuredClone(base);
            const card = rules.variants[0]!;
            rules.variants = [
                {
                    ...card,
                    id: 'before',
                    applies: {
                        dispatchWindows: [
                            {
                                from: '2026-10-28T00:00:00.000Z',
                                until: instant,
                            },
                        ],
                    },
                },
                {
                    ...card,
                    id: 'after',
                    applies: {
                        dispatchWindows: [
                            {
                                from: instant,
                                until: '2026-10-29T00:00:00.000Z',
                            },
                        ],
                    },
                },
            ];
            await parity(rules);
            await parity(
                rules,
                usage,
                {
                    dispatchedAt: '2026-10-28T11:59:59.999Z',
                    latestDispatchAt: '2026-10-28T12:00:00.001Z',
                },
                'upper-bound',
            );
            rules.variants[1]!.applies.dispatchWindows![0]!.from =
                '2026-10-28T12:00:00.001Z';
            expect(
                (
                    await parity(
                        rules,
                        usage,
                        {
                            dispatchedAt: '2026-10-28T11:59:59.999Z',
                            latestDispatchAt: '2026-10-28T12:00:00.001Z',
                        },
                        'upper-bound',
                    )
                ).status,
            ).toBe('unknown');
        });
        it('never substitutes missing token meters or reservation maxima as actual expense', async () => {
            const rules = structuredClone(base);
            rules.variants[0]!.components = [
                {
                    meter: 'uncachedInputTokens',
                    pricePerUnit: '1',
                    unitQuantity: 1_000_000,
                    chargeWhen: 'positive-usage',
                },
                {
                    meter: 'cacheReadTokens',
                    pricePerUnit: '0.1',
                    unitQuantity: 1_000_000,
                    chargeWhen: 'positive-usage',
                },
                {
                    meter: 'cacheWriteTokens',
                    pricePerUnit: '1.25',
                    unitQuantity: 1_000_000,
                    chargeWhen: 'positive-usage',
                },
            ];
            expect(
                (await parity(rules, { inputTokens: 1000, requests: 1 }))
                    .status,
            ).toBe('unknown');
            expect(
                (
                    await parity(
                        rules,
                        { inputTokens: 1000, requests: 1 },
                        facts,
                        'upper-bound',
                    )
                ).amountUsdMicros,
            ).toBe('2350');
            expect(
                (
                    await parity(rules, {
                        inputTokens: 1000,
                        cacheReadTokens: 400,
                        cacheWriteTokens: 100,
                        requests: 1,
                    })
                ).amountUsdMicros,
            ).toBe('665');
        });
        it('uses validated provider-reported costs only for actual settlement', async () => {
            const rules = {
                ...structuredClone(base),
                reportedCreditUsdPerCredit: '0.005',
            };
            expect(
                (
                    await parity(rules, {
                        requests: 1,
                        providerCreditsConsumed: '1.23',
                    })
                ).amountUsdMicros,
            ).toBe('6150');
            expect(
                (
                    await parity(rules, {
                        requests: 1,
                        providerCostUsd: '0.0012345',
                    })
                ).amountUsdMicros,
            ).toBe('1235');
            expect(
                (
                    await parity(rules, {
                        ...usage,
                        providerCreditsConsumed: '1.23',
                        providerCostUsd: '1',
                    })
                ).status,
            ).toBe('unknown');
            expect(
                (
                    await parity(
                        rules,
                        { ...usage, providerCostUsd: '99' },
                        facts,
                        'upper-bound',
                    )
                ).amountUsdMicros,
            ).toBe('2700');
        });
        it('fails closed for invalid versions, negative/unknown meters and forbidden submillisecond instants', async () => {
            await parity({
                ...base,
                version: 2,
            } as unknown as ProviderNativePricingRules);
            await parity(base, { ...usage, inputTokens: -1 });
            await parity(base, usage, {
                dispatchedAt: '2026-10-28T12:00:00.0001Z',
            });
            await parity({
                ...base,
                extra: 'untrusted',
            } as unknown as ProviderNativePricingRules);
            await parity(base, {
                ...usage,
                privatePrompt: 'must never persist',
            } as unknown as ProviderNativeUsage);
        });
    },
);
