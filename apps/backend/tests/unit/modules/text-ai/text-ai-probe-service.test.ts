import { TextAiProbeUnavailableError } from '../../../../src/modules/text-ai/application/ports/text-ai-probe-store';
import { describe, expect, it, vi } from 'vitest';
import { TextAiProbeService } from '../../../../src/modules/text-ai/application/text-ai-probe-service';
import type {
    TextAiProbeExecutor,
    TextAiProbeStore,
    TextAiProbeReservation,
    TextAiProbeResult,
} from '../../../../src/modules/text-ai/application/ports/text-ai-probe-store';
import { probeCostMicros } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/drizzle-text-ai-probe-store';
import { TextAiProbeRequestSchema } from '@languon/contracts';

const limits = {
    maximumCostMicros: 10_000n,
    dailyMaximumCostMicros: 100_000n,
    cooldownSeconds: 10,
    evidenceHours: 24,
};
const price = {
    id: '00000000-0000-4000-8000-000000000001',
    providerId: 'deepseek',
    modelId: 'deepseek-flash',
    meter: 'text-tokens' as const,
    inputUsdPerMillionTokens: '0.3',
    outputUsdPerMillionTokens: '1.2',
    cacheReadUsdPerMillionTokens: '0.006',
    cacheWriteUsdPerMillionTokens: null,
    usdPer1000Characters: null,
    effectiveAt: '2026-10-01T00:00:00.000Z',
    createdAt: '2026-10-01T00:00:00.000Z',
    createdBy: null,
    version: 1,
    sourceReference: 'synthetic-test',
    sourceUrl: null,
    reason: 'Synthetic reviewed prices',
};
const reservation: TextAiProbeReservation = {
    id: '00000000-0000-4000-8000-000000000002',
    identity: {
        routeId: 'deepseek/deepseek-flash',
        providerId: 'deepseek',
        modelId: 'deepseek-flash',
        fingerprint: 'opaque',
    },
    request: {
        routeId: 'deepseek/deepseek-flash',
        approvedMaximumCostUsd: '0.01',
        kind: 'quick',
    },
    price,
    maximumCostMicros: 10_000n,
    startedAt: new Date('2026-10-25T00:00:00Z'),
};
const result: TextAiProbeResult = {
    valid: true,
    failure: null,
    elapsedMs: 20,
    inputTokens: 100,
    outputTokens: 10,
    measurement: 'measured',
};

describe('operator-only model checks', () => {
    it('does not dispatch when delegation is revoked while reservation is waiting', async () => {
        const controller = new AbortController();
        const store = {
            reserve: vi.fn(async () => {
                controller.abort();
                return reservation;
            }),
            finish: vi.fn(async () => ({ id: reservation.id })),
        } as unknown as TextAiProbeStore;
        const executor: TextAiProbeExecutor = {
            identity: () => reservation.identity,
            execute: vi.fn(),
        };
        await new TextAiProbeService(store, executor, limits).run(
            'admin-id',
            reservation.request,
            controller.signal,
        );
        expect(executor.execute).not.toHaveBeenCalled();
        expect(store.finish).toHaveBeenCalledWith(
            reservation,
            expect.objectContaining({
                valid: false,
                measurement: 'measured',
                inputTokens: 0,
                outputTokens: 0,
            }),
            expect.any(Date),
        );
    });
    it('checks live dispatch authority after reserve and persists a known zero expense when authorization fails', async () => {
        const order: string[] = [];
        const store = {
            reserve: vi.fn(async () => {
                order.push('reserve');
                return reservation;
            }),
            finish: vi.fn(async () => ({ id: reservation.id })),
        } as unknown as TextAiProbeStore;
        const executor: TextAiProbeExecutor = {
            identity: () => reservation.identity,
            execute: vi.fn(),
        };
        const authorize = vi.fn(async () => {
            order.push('authorize');
            throw new Error('Delegation revoked');
        });
        await new TextAiProbeService(store, executor, limits).run(
            'admin-id',
            reservation.request,
            undefined,
            authorize,
        );
        expect(order).toEqual(['reserve', 'authorize']);
        expect(executor.execute).not.toHaveBeenCalled();
        expect(store.finish).toHaveBeenCalledWith(
            reservation,
            expect.objectContaining({
                valid: false,
                measurement: 'measured',
                inputTokens: 0,
                outputTokens: 0,
                failure: 'budget_insufficient',
            }),
            expect.any(Date),
        );
    });
    it('refuses revoked delegation before reservation and propagates revocation after dispatch', async () => {
        const finish = vi.fn(async () => ({ id: reservation.id }));
        const reserve = vi.fn(async () => reservation);
        const store = { reserve, finish } as unknown as TextAiProbeStore;
        const revoked = new AbortController();
        revoked.abort();
        const executor: TextAiProbeExecutor = {
            identity: () => reservation.identity,
            execute: vi.fn(),
        };
        const service = new TextAiProbeService(store, executor, limits);
        await expect(
            service.run('admin-id', reservation.request, revoked.signal),
        ).rejects.toThrow();
        expect(reserve).not.toHaveBeenCalled();

        const active = new AbortController();
        executor.execute = async (_reservation, signal) => {
            active.abort();
            signal.throwIfAborted();
            return result;
        };
        await service.run('admin-id', reservation.request, active.signal);
        expect(finish).toHaveBeenCalledWith(
            reservation,
            expect.objectContaining({
                valid: false,
                measurement: 'unknown',
                inputTokens: null,
                outputTokens: null,
            }),
            expect.any(Date),
        );
    });
    it('requires an explicit selected flow and rejects arbitrary fields', () => {
        expect(
            TextAiProbeRequestSchema.safeParse({
                routeId: 'deepseek/deepseek-flash',
                approvedMaximumCostUsd: '0.01',
                kind: 'flow',
            }).success,
        ).toBe(false);
        expect(
            TextAiProbeRequestSchema.safeParse({
                routeId: 'deepseek/deepseek-flash',
                approvedMaximumCostUsd: '0.01',
                kind: 'quick',
                url: 'https://attacker.test',
            }).success,
        ).toBe(false);
    });
    it('reserves before dispatch and finishes exactly once without learner authority', async () => {
        const order: string[] = [];
        const store = {
            reserve: vi.fn(async () => {
                order.push('reserve');
                return reservation;
            }),
            finish: vi.fn(async () => {
                order.push('finish');
                return { id: reservation.id };
            }),
            list: vi.fn(async () => []),
            recover: vi.fn(),
        } as unknown as TextAiProbeStore;
        const executor: TextAiProbeExecutor = {
            identity: () => reservation.identity,
            execute: async () => {
                order.push('execute');
                return result;
            },
        };
        await new TextAiProbeService(store, executor, limits).run(
            'admin-id',
            reservation.request,
        );
        expect(order).toEqual(['reserve', 'execute', 'finish']);
        expect(store.reserve).toHaveBeenCalledWith(
            expect.objectContaining({ actorId: 'admin-id', limits }),
        );
    });
    it('requires approval again when the displayed maximum changed', async () => {
        const reserve = vi.fn();
        const execute = vi.fn();
        const store = {
            reserve,
            finish: vi.fn(),
            list: vi.fn(),
            recover: vi.fn(),
        } as TextAiProbeStore;
        await expect(
            new TextAiProbeService(
                store,
                { identity: () => reservation.identity, execute },
                limits,
            ).run('admin-id', {
                ...reservation.request,
                approvedMaximumCostUsd: '0.005',
            }),
        ).rejects.toThrow('probe_limit_changed');
        expect(reserve).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });
    it('accepts a lower approved maximum and reserves that exact operator budget for one deterministic probe', async () => {
        const reducedMaximum = 5_000n;
        const reserve = vi.fn(
            async (input: Parameters<TextAiProbeStore['reserve']>[0]) => ({
                ...reservation,
                request: input.request,
                maximumCostMicros: input.limits.maximumCostMicros,
            }),
        );
        const execute = vi.fn(async (accepted: TextAiProbeReservation) => {
            expect(accepted.maximumCostMicros).toBe(reducedMaximum);
            return result;
        });
        const store = {
            reserve,
            finish: vi.fn(async () => ({ id: reservation.id })),
            list: vi.fn(async () => []),
            recover: vi.fn(),
        } as unknown as TextAiProbeStore;

        await new TextAiProbeService(
            store,
            { identity: () => reservation.identity, execute },
            limits,
        ).run(
            'admin-id',
            { ...reservation.request, approvedMaximumCostUsd: '0.005' },
            undefined,
            undefined,
            reducedMaximum,
        );

        expect(reserve).toHaveBeenCalledWith(
            expect.objectContaining({
                actorId: 'admin-id',
                limits: expect.objectContaining({
                    maximumCostMicros: reducedMaximum,
                }),
            }),
        );
        expect(execute).toHaveBeenCalledTimes(1);
    });
    it('never calls a provider when the atomic reservation rejects', async () => {
        const execute = vi.fn();
        const store = {
            reserve: vi.fn().mockRejectedValue(new Error('daily cap')),
            finish: vi.fn(),
            list: vi.fn(),
            recover: vi.fn(),
        } as TextAiProbeStore;
        await expect(
            new TextAiProbeService(
                store,
                { identity: () => reservation.identity, execute },
                limits,
            ).run('admin-id', reservation.request),
        ).rejects.toThrow('daily cap');
        expect(execute).not.toHaveBeenCalled();
    });
    it('records unknown expense rather than zero and hides raw errors', async () => {
        const finish = vi.fn(async () => ({ id: reservation.id }));
        const store = {
            reserve: async () => reservation,
            finish,
            list: async () => [],
            recover: vi.fn(),
        } as unknown as TextAiProbeStore;
        await new TextAiProbeService(
            store,
            {
                identity: () => reservation.identity,
                execute: async () => {
                    throw new Error('secret api key');
                },
            },
            limits,
        ).run('admin-id', reservation.request);
        expect(finish).toHaveBeenCalledWith(
            reservation,
            expect.objectContaining({
                valid: false,
                failure: 'execution_unknown',
                measurement: 'unknown',
                inputTokens: null,
                outputTokens: null,
            }),
            expect.any(Date),
        );
        expect(
            JSON.stringify(finish.mock.calls, (_key, value) =>
                typeof value === 'bigint' ? value.toString() : value,
            ),
        ).not.toContain('secret api key');
    });
    it('records known zero usage for a budget rejection before any provider dispatch', async () => {
        const finish = vi.fn(async () => ({ id: reservation.id }));
        const store = {
            reserve: async () => reservation,
            finish,
            list: async () => [],
            recover: vi.fn(),
        } as unknown as TextAiProbeStore;
        await new TextAiProbeService(
            store,
            {
                identity: () => reservation.identity,
                execute: async () => {
                    throw new TextAiProbeUnavailableError(
                        'probe_limit_reached',
                    );
                },
            },
            limits,
        ).run('admin-id', reservation.request);
        expect(finish).toHaveBeenCalledWith(
            reservation,
            expect.objectContaining({
                valid: false,
                failure: 'budget_insufficient',
                measurement: 'measured',
                inputTokens: 0,
                outputTokens: 0,
            }),
            expect.any(Date),
        );
    });
    it('does not retry dispatch when persistence settlement fails', async () => {
        const execute = vi.fn(async () => result);
        const finish = vi.fn().mockRejectedValue(new Error('database down'));
        const store = {
            reserve: async () => reservation,
            finish,
            list: async () => [],
            recover: vi.fn(),
        } as TextAiProbeStore;
        await expect(
            new TextAiProbeService(
                store,
                { identity: () => reservation.identity, execute },
                limits,
            ).run('admin-id', reservation.request),
        ).rejects.toThrow('database down');
        expect(execute).toHaveBeenCalledTimes(1);
        expect(finish).toHaveBeenCalledTimes(1);
    });
    it('rounds exact aggregate USD once, preserves cache categories', () => {
        expect(
            probeCostMicros(price, {
                ...result,
                inputTokens: 101,
                outputTokens: 3,
            }),
        ).toBe(34n);
        expect(
            probeCostMicros(price, {
                ...result,
                inputTokens: 100,
                outputTokens: 0,
                cacheReadTokens: 100,
            }),
        ).toBe(1n);
        expect(
            probeCostMicros(price, {
                ...result,
                inputTokens: null,
                measurement: 'unknown',
            }),
        ).toBeNull();
        expect(
            probeCostMicros(price, { ...result, cacheWriteTokens: 1 }),
        ).toBeNull();
    });
    it('applies reviewed request minimums only to dispatched work and never calls unknown cost zero', () => {
        const minimumPrice = { ...price, minimumUsdPerRequest: '0.001' };
        expect(probeCostMicros(minimumPrice, result)).toBe(1000n);
        expect(
            probeCostMicros(
                { ...minimumPrice, minimumUsdPerRequest: '0.000001' },
                result,
            ),
        ).toBe(42n);
        expect(
            probeCostMicros(minimumPrice, {
                ...result,
                valid: false,
                failure: 'budget_insufficient',
                inputTokens: 0,
                outputTokens: 0,
            }),
        ).toBe(0n);
        expect(
            probeCostMicros(minimumPrice, {
                ...result,
                measurement: 'unknown',
                inputTokens: null,
                outputTokens: null,
            }),
        ).toBeNull();
    });
});
