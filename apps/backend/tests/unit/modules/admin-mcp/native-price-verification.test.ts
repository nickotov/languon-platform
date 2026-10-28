import { describe, expect, it, vi } from 'vitest';
import type {
    ProviderPrice,
    ProviderNativePricingRules,
} from '@languon/contracts';
import {
    AdminMcpPriceActualizationService,
    type PriceActualizationDependencies,
} from '../../../../src/modules/admin-mcp/application/admin-mcp-price-actualization-service';
import { adminMcpWriteSchemas } from '../../../../src/modules/admin-mcp/application/operation-schemas';
import type { AdminMcpActor } from '../../../../src/modules/admin-mcp/domain/admin-mcp';
import {
    createAdminMcpServer,
    type AdminMcpServerDependencies,
} from '../../../../src/modules/admin-mcp/interface/http/admin-mcp-server';
import type {
    ProviderPriceFetchResult,
    ProviderPriceTarget,
} from '../../../../src/modules/ai-credits/application/provider-price-source';

const at = '2026-10-28T12:00:00.000Z';
const target: ProviderPriceTarget = {
    providerId: 'openrouter',
    modelId: 'future/real-model',
    meter: 'text-tokens',
};
const rules: ProviderNativePricingRules = {
    version: 1,
    validFrom: at,
    validUntil: null,
    variants: [
        {
            id: 'standard',
            applies: {},
            components: [
                {
                    meter: 'inputTokens',
                    pricePerUnit: '0.000000065',
                    unitQuantity: 1,
                    chargeWhen: 'positive-usage',
                },
                {
                    meter: 'outputTokens',
                    pricePerUnit: '0.00000026',
                    unitQuantity: 1,
                    chargeWhen: 'positive-usage',
                },
            ],
        },
    ],
};
const price = {
    ...target,
    inputUsdPerMillionTokens: null,
    outputUsdPerMillionTokens: null,
    cacheReadUsdPerMillionTokens: null,
    cacheWriteUsdPerMillionTokens: null,
    usdPer1000Characters: null,
    minimumUsdPerRequest: null,
    nativeRules: rules,
    sourceUrl: 'https://openrouter.ai/api/v1/models',
    sourceReference: 'verified-source:v1',
};
const readActor: AdminMcpActor = {
    tokenId: 'token',
    userId: 'owner',
    permissions: ['providers.read'],
    allowedActions: ['providers.inspect', 'provider-prices.verify'],
    limits: {},
};
const writeActor: AdminMcpActor = {
    ...readActor,
    permissions: ['providers.read', 'provider-prices.write'],
    allowedActions: [
        ...readActor.allowedActions,
        'provider-prices.write',
        'provider-prices.native-write',
        'provider-prices.actualize-native.v1',
    ],
};
const input = { reason: 'Verify current official model pricing' };
function fixture(actor = readActor) {
    const fetchPrices = vi.fn(async (): Promise<ProviderPriceFetchResult[]> => [
        { target, status: 'available', price },
    ]);
    const deps: PriceActualizationDependencies = {
        sources: [{ providerId: target.providerId, fetchPrices }],
        targets: async () => [target],
        catalog: vi.fn(async () => [
            {
                target,
                configured: false,
                retired: false,
                executionBlockers: ['Provider credentials are not configured.'],
            },
        ]),
        prices: vi.fn(async () => []),
        administration: {
            preview: vi.fn(
                async (_actor, operation, proposed) =>
                    ({ id: 'preview', operation, proposed }) as never,
            ),
        },
        audit: {
            recordRead: vi.fn(async () => {}),
            recordRejected: vi.fn(async () => {}),
        },
        reauthenticate: vi.fn(async () => actor),
        now: () => new Date(at),
    };
    return {
        deps,
        fetchPrices,
        service: new AdminMcpPriceActualizationService(deps),
    };
}
describe('native model price verification authority and separation', () => {
    it('verifies unconfigured catalog entries with read authority and never creates a preview', async () => {
        const f = fixture();
        const result = await f.service.verify(readActor, input);
        expect(result).toMatchObject({
            mode: 'verify',
            applied: false,
            totalModels: 1,
            nextOffset: null,
            results: [
                {
                    status: 'verified',
                    verification: 'verified',
                    comparison: 'missing',
                    publication: 'ready',
                    catalog: { configured: false, retired: false },
                    pricing: { nativeRules: rules },
                    executionReadiness: {
                        assessedByPriceVerification: false,
                        knownBlockers: [
                            'Provider credentials are not configured.',
                        ],
                    },
                },
            ],
        });
        expect(f.deps.administration.preview).not.toHaveBeenCalled();
        expect(f.deps.audit.recordRead).toHaveBeenCalledWith(
            readActor,
            'provider-prices.verify',
            input,
            result,
            input.reason,
        );
    });
    it('reports retired exact identities without copying a replacement price', async () => {
        const f = fixture();
        vi.mocked(f.deps.catalog!).mockResolvedValue([
            {
                target,
                configured: true,
                retired: true,
                executionBlockers: ['Retired identity.'],
            },
        ]);
        f.fetchPrices.mockResolvedValue([
            {
                target,
                status: 'model-not-found',
                reason: 'The product page names a different exact model.',
            },
        ]);
        expect(
            (await f.service.verify(readActor, input)).results,
        ).toMatchObject([
            {
                status: 'model-not-found',
                verification: 'model-not-found',
                publication: 'retired',
            },
        ]);
        expect(f.deps.administration.preview).not.toHaveBeenCalled();
    });
    it('does not delegate verification or native writes to legacy action snapshots', async () => {
        const f = fixture();
        const oldReader = {
            ...readActor,
            allowedActions: ['providers.inspect'],
        };
        await expect(f.service.verify(oldReader, input)).rejects.toMatchObject({
            code: 'permission_denied',
        });
        const oldWriter: AdminMcpActor = {
            ...writeActor,
            allowedActions: [
                'provider-prices.write',
                'provider-prices.actualize',
            ],
        };
        await expect(
            f.service.actualize(oldWriter, input),
        ).rejects.toMatchObject({ code: 'permission_denied' });
        expect(f.fetchPrices).not.toHaveBeenCalled();
    });
    it('uses only the separately delegated native writer and rejects native data in the flat writer', async () => {
        const f = fixture(writeActor);
        const result = await f.service.actualize(writeActor, input);
        expect(result.results).toMatchObject([
            { status: 'preview', verification: 'verified' },
        ]);
        expect(f.deps.administration.preview).toHaveBeenCalledWith(
            writeActor,
            'provider-prices.native-write',
            expect.objectContaining({ nativeRules: rules }),
        );
        const body = {
            ...price,
            expectedVersion: 0,
            effectiveAt: at,
            reason: input.reason,
        };
        expect(
            adminMcpWriteSchemas['provider-prices.native-write'].safeParse(body)
                .success,
        ).toBe(true);
        expect(
            adminMcpWriteSchemas['provider-prices.write'].safeParse(body)
                .success,
        ).toBe(false);
    });
    it('ignores retrieval-only validFrom changes but preserves expired or changed native rules', async () => {
        const f = fixture(writeActor);
        const current: ProviderPrice = {
            ...price,
            id: '00000000-0000-4000-8000-000000000001',
            version: 3,
            createdBy: null,
            createdAt: at,
            effectiveAt: at,
            reason: input.reason,
            nativeRules: { ...rules, validFrom: '2026-10-27T00:00:00.000Z' },
        };
        vi.mocked(f.deps.prices).mockResolvedValue([current]);
        expect(
            (await f.service.actualize(writeActor, input)).results,
        ).toMatchObject([{ status: 'unchanged', comparison: 'matches' }]);
        expect(f.deps.administration.preview).not.toHaveBeenCalled();
        vi.mocked(f.deps.prices).mockResolvedValue([
            {
                ...current,
                nativeRules: {
                    ...current.nativeRules!,
                    validUntil: '2026-10-28T11:00:00.000Z',
                },
            },
        ]);
        expect(
            (await f.service.actualize(writeActor, input)).results,
        ).toMatchObject([{ status: 'preview', comparison: 'differs' }]);
    });
    it('rechecks credential authority after fetching even for verification without financial mutation', async () => {
        const f = fixture();
        vi.mocked(f.deps.reauthenticate).mockRejectedValue(
            new Error('Revoked'),
        );
        await expect(f.service.verify(readActor, input)).rejects.toThrow(
            'Revoked',
        );
        expect(f.deps.administration.preview).not.toHaveBeenCalled();
    });
});

describe('MCP price verification discovery', () => {
    function server(actor: AdminMcpActor) {
        const verifyPrices = vi.fn(async () => ({
            mode: 'verify',
            applied: false,
            results: [],
        }));
        const app = createAdminMcpServer({
            port: 3002,
            credentials: { authenticate: async () => actor },
            administration: {},
            checks: {},
            verifyPrices,
            actualizePrices: async () => ({}),
        } as unknown as AdminMcpServerDependencies);
        const rpc = async (method: string, params = {}) => {
            const response = await app.request('http://127.0.0.1:3002/mcp', {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer synthetic',
                    'Content-Type': 'application/json',
                    Accept: 'application/json, text/event-stream',
                },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
            });
            const text = await response.text();
            const event = text
                .split('\n')
                .find((line) => line.startsWith('data: '));
            return JSON.parse(event ? event.slice(6) : text);
        };
        return { rpc, verifyPrices };
    }
    it('discovers and executes the read-only method for a newly delegated reader', async () => {
        const f = server(readActor);
        const listing = await f.rpc('tools/list');
        const tool = listing.result.tools.find(
            (tool: { name: string }) => tool.name === 'verify_model_prices',
        );
        expect(tool.annotations.readOnlyHint).toBe(true);
        expect(
            listing.result.tools.some(
                (tool: { name: string }) =>
                    tool.name === 'actualize_model_prices',
            ),
        ).toBe(false);
        const result = await f.rpc('tools/call', {
            name: 'verify_model_prices',
            arguments: input,
        });
        expect(result.result.isError).not.toBe(true);
        expect(f.verifyPrices).toHaveBeenCalledOnce();
    });
    it('keeps both new pricing operations hidden from old action snapshots', async () => {
        const f = server({
            ...writeActor,
            allowedActions: [
                'providers.inspect',
                'provider-prices.write',
                'provider-prices.actualize',
            ],
        });
        const names = (await f.rpc('tools/list')).result.tools.map(
            (tool: { name: string }) => tool.name,
        );
        expect(names).not.toContain('verify_model_prices');
        expect(names).not.toContain('actualize_model_prices');
        expect(names).not.toContain('preview_provider_prices_native_write');
        expect(names).toContain('preview_provider_prices_write');
    });
});
