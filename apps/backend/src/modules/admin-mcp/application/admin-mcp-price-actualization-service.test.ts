import { describe, it, expect, vi } from 'vitest';
import type { ProviderPrice } from '@languon/contracts';
import type { AdminMcpActor } from '../domain/admin-mcp';
import type {
    ProviderPriceFetchResult,
    ProviderPriceTarget,
} from '../../ai-credits/application/provider-price-source';
import {
    AdminMcpPriceActualizationService,
    type PriceActualizationDependencies,
} from './admin-mcp-price-actualization-service';

const target: ProviderPriceTarget = {
    providerId: 'new-provider',
    modelId: 'future-model',
    meter: 'text-tokens',
};
const rate = {
    ...target,
    inputUsdPerMillionTokens: '0.3',
    outputUsdPerMillionTokens: '1.2',
    cacheReadUsdPerMillionTokens: null,
    cacheWriteUsdPerMillionTokens: null,
    usdPer1000Characters: null,
    minimumUsdPerRequest: null,
    sourceUrl: 'https://example.test/catalog',
    sourceReference: 'official-prices:v1',
};
const actor: AdminMcpActor = {
    tokenId: 'token',
    userId: 'owner',
    permissions: ['provider-prices.write'],
    allowedActions: ['provider-prices.write', 'provider-prices.actualize'],
    limits: {},
};
const now = new Date('2026-10-28T12:00:00Z');
function current(overrides: Partial<ProviderPrice> = {}): ProviderPrice {
    return {
        ...rate,
        id: '00000000-0000-4000-8000-000000000001',
        version: 7,
        createdAt: now.toISOString(),
        createdBy: null,
        effectiveAt: now.toISOString(),
        reason: 'Prior reviewed rates',
        ...overrides,
    };
}
function fixture() {
    const fetchPrices = vi.fn(
        async (
            targets: ProviderPriceTarget[],
        ): Promise<ProviderPriceFetchResult[]> =>
            targets.map((target) => ({
                target,
                status: 'available',
                price: { ...rate, ...target },
            })),
    );
    const deps: PriceActualizationDependencies = {
        sources: [{ providerId: target.providerId, fetchPrices }],
        targets: vi.fn(async () => [target]),
        prices: vi.fn(async () => []),
        administration: {
            preview: vi.fn(
                async (_actor, _operation, raw) =>
                    ({ id: 'preview', proposed: raw }) as never,
            ),
        },
        audit: {
            recordRead: vi.fn(async () => {}),
            recordRejected: vi.fn(async () => {}),
        },
        reauthenticate: vi.fn(async () => actor),
        now: () => now,
    };
    return {
        deps,
        fetchPrices,
        service: new AdminMcpPriceActualizationService(deps),
    };
}
const input = { reason: 'Refresh official provider costs' };
describe('model price actualization coordination', () => {
    it('supports future providers through registration, discovers catalog models and creates exact previews only', async () => {
        const f = fixture();
        const response = await f.service.actualize(actor, input);
        expect(response).toMatchObject({
            applied: false,
            results: [
                { target, status: 'preview', preview: { id: 'preview' } },
            ],
        });
        expect(f.fetchPrices).toHaveBeenCalledWith(
            [target],
            expect.any(AbortSignal),
        );
        expect(f.deps.administration.preview).toHaveBeenCalledWith(
            actor,
            'provider-prices.write',
            {
                ...rate,
                expectedVersion: 0,
                reason: input.reason,
                effectiveAt: now.toISOString(),
            },
        );
        expect(f.deps.audit.recordRead).toHaveBeenCalledOnce();
    });
    it('compares exact decimal values rather than formatting or source timestamp', async () => {
        const f = fixture();
        vi.mocked(f.deps.prices).mockResolvedValue([
            current({
                inputUsdPerMillionTokens: '0.300000',
                outputUsdPerMillionTokens: '1.200',
            }),
        ]);
        const response = await f.service.actualize(actor, input);
        expect(response.results).toMatchObject([{ status: 'unchanged' }]);
        expect(f.deps.administration.preview).not.toHaveBeenCalled();
    });
    it('uses latest expected version and preserves a scheduled publication', async () => {
        const f = fixture();
        vi.mocked(f.deps.prices).mockResolvedValue([
            current({ outputUsdPerMillionTokens: '2' }),
        ]);
        await f.service.actualize(actor, input);
        expect(f.deps.administration.preview).toHaveBeenCalledWith(
            actor,
            'provider-prices.write',
            expect.objectContaining({ expectedVersion: 7 }),
        );
        vi.mocked(f.deps.administration.preview).mockClear();
        vi.mocked(f.deps.prices).mockResolvedValue([
            current({ effectiveAt: '2026-11-01T00:00:00Z' }),
        ]);
        expect((await f.service.actualize(actor, input)).results).toMatchObject(
            [{ status: 'skipped' }],
        );
        expect(f.deps.administration.preview).not.toHaveBeenCalled();
    });
    it('never silently grants a new action to legacy tokens or read-only clients', async () => {
        const f = fixture();
        for (const old of [
            { ...actor, allowedActions: ['provider-prices.write'] },
            { ...actor, permissions: [] },
        ]) {
            await expect(f.service.actualize(old, input)).rejects.toMatchObject(
                { code: 'permission_denied' },
            );
        }
        expect(f.fetchPrices).not.toHaveBeenCalled();
        expect(f.deps.audit.recordRejected).toHaveBeenCalledTimes(2);
    });
    it('rejects arbitrary URLs, unknown targets and secret-shaped audit reasons before fetching', async () => {
        const f = fixture();
        await expect(
            f.service.actualize(actor, { ...input, url: 'http://localhost' }),
        ).rejects.toThrow();
        await expect(
            f.service.actualize(actor, {
                ...input,
                models: [{ ...target, modelId: 'uncataloged' }],
            }),
        ).rejects.toMatchObject({ code: 'not_found' });
        await expect(
            f.service.actualize(actor, {
                reason: `Do not persist Bearer synthetic-secret`,
            }),
        ).rejects.toThrow();
        expect(f.fetchPrices).not.toHaveBeenCalled();
    });
    it('isolates unavailable providers and reports unregistered providers without prices', async () => {
        const f = fixture();
        const unknown = { ...target, providerId: 'unregistered' };
        vi.mocked(f.deps.targets).mockResolvedValue([target, unknown]);
        f.fetchPrices.mockRejectedValue(new Error('private external failure'));
        const response = await f.service.actualize(actor, input);
        expect(response.results).toMatchObject([
            { status: 'unavailable' },
            { status: 'unsupported' },
        ]);
        expect(JSON.stringify(response)).not.toContain(
            'private external failure',
        );
        expect(f.deps.administration.preview).not.toHaveBeenCalled();
    });
    it('reauthenticates after network work and does not create previews after revocation', async () => {
        const f = fixture();
        vi.mocked(f.deps.reauthenticate).mockRejectedValue(
            new Error('revoked'),
        );
        await expect(f.service.actualize(actor, input)).rejects.toThrow(
            'revoked',
        );
        expect(f.fetchPrices).toHaveBeenCalledOnce();
        expect(f.deps.administration.preview).not.toHaveBeenCalled();
    });
    it('deduplicates selections and rejects responses for the wrong model or missing/duplicate entries', async () => {
        const f = fixture();
        await f.service.actualize(actor, {
            ...input,
            models: [target, target],
        });
        expect(f.fetchPrices).toHaveBeenCalledWith(
            [target],
            expect.any(AbortSignal),
        );
        vi.mocked(f.deps.administration.preview).mockClear();
        f.fetchPrices.mockResolvedValue([
            {
                target,
                status: 'available',
                price: { ...rate, modelId: 'wrong-model' },
            },
        ]);
        expect((await f.service.actualize(actor, input)).results).toMatchObject(
            [{ status: 'unavailable' }],
        );
        f.fetchPrices.mockResolvedValue([]);
        expect((await f.service.actualize(actor, input)).results).toMatchObject(
            [{ status: 'unavailable' }],
        );
        f.fetchPrices.mockResolvedValue([
            { target, status: 'available', price: rate },
            { target, status: 'available', price: rate },
        ]);
        expect((await f.service.actualize(actor, input)).results).toMatchObject(
            [{ status: 'unavailable' }],
        );
        expect(f.deps.administration.preview).not.toHaveBeenCalled();
    });
    it('rejects duplicate sources, overlarge explicit selections and ambiguous pagination', async () => {
        const f = fixture();
        expect(
            () =>
                new AdminMcpPriceActualizationService({
                    ...f.deps,
                    sources: [...f.deps.sources, ...f.deps.sources],
                }),
        ).toThrow('Duplicate');
        const selections = Array.from({ length: 51 }, (_, i) => ({
            ...target,
            modelId: `model-${i}`,
        }));
        vi.mocked(f.deps.targets).mockResolvedValue(selections);
        await expect(
            f.service.actualize(actor, { ...input, models: selections }),
        ).rejects.toThrow();
        await expect(
            f.service.actualize(actor, {
                ...input,
                models: [target],
                offset: 0,
            }),
        ).rejects.toThrow();
        await expect(
            f.service.actualize(actor, { ...input, offset: -1 }),
        ).rejects.toThrow();
        expect(f.fetchPrices).not.toHaveBeenCalled();
    });
    it('covers a growing catalog completely through bounded continuation pages', async () => {
        const f = fixture();
        const selections = Array.from({ length: 101 }, (_, i) => ({
            ...target,
            modelId: `model-${i}`,
        }));
        vi.mocked(f.deps.targets).mockResolvedValue(selections);
        const seen: string[] = [];
        let offset: number | null = 0;
        do {
            const page = await f.service.actualize(actor, { ...input, offset });
            expect(page.totalModels).toBe(101);
            expect(page.results.length).toBeLessThanOrEqual(50);
            expect(
                page.results.every((item) => item.status === 'preview'),
            ).toBe(true);
            seen.push(...page.results.map((item) => item.target.modelId));
            offset = page.nextOffset;
        } while (offset !== null);
        expect(seen).toEqual(selections.map((item) => item.modelId));
        expect(new Set(seen).size).toBe(101);
        expect(f.fetchPrices.mock.calls.map(([batch]) => batch.length)).toEqual(
            [50, 50, 1],
        );
        expect(
            (await f.service.actualize(actor, { ...input, offset: 101 }))
                .results,
        ).toEqual([]);
        expect(f.fetchPrices).toHaveBeenCalledTimes(3);
    });
    it('stops on cancellation without previewing fetched values', async () => {
        const f = fixture();
        const control = new AbortController();
        f.fetchPrices.mockImplementation(async () => {
            control.abort();
            return [{ target, status: 'available', price: rate }];
        });
        await expect(
            f.service.actualize(actor, input, control.signal),
        ).rejects.toThrow();
        expect(f.deps.administration.preview).not.toHaveBeenCalled();
    });
});
