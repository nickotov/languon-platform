import { describe, expect, it, vi } from 'vitest';
import { createProviderPriceSources } from './provider-price-sources';
import { KNOWLEDGE_TRANSCRIPTION_MODEL as model } from '../../../knowledge/domain/transcription-model';
import { modelPriceCatalog } from '../../../../infrastructure/admin-mcp/price-actualization';
import { actualizeModelPricesSchema } from '../../../admin-mcp/application/admin-mcp-price-actualization-service';

const target = {
    providerId: model.providerId,
    modelId: model.modelId,
    meter: model.meter,
};
// Synthetic protocol fixture: no assertion that this supplies a full provider billing policy.
const evidence =
    'Model ID: `gpt-transcribe`\n### Transcription audio duration\n| Metric | Price | Unit |\n| Price | $0.0045 | minute |\n## Endpoints\n| Transcription | `v1/audio/transcriptions` | Supported |\n';
const source = (fetch: typeof globalThis.fetch) =>
    createProviderPriceSources({ fetch }).find(
        (item) => item.providerId === model.providerId,
    )!;
describe('registered OpenAI transcription pricing preparation', () => {
    it('discovers the actual executor identity without generation credentials and supports explicit MCP selection', () => {
        const entries = modelPriceCatalog({}).filter(
            (entry) => entry.target.providerId === model.providerId,
        );
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
            target,
            configured: false,
            retired: false,
        });
        expect(entries[0]!.executionBlockers.join(' ')).toContain('rounding');
        expect(
            actualizeModelPricesSchema.parse({
                models: [target],
                reason: 'Check the source metadata',
            }).models,
        ).toEqual([target]);
        expect(
            modelPriceCatalog({}, { OPENAI_API_KEY: 'synthetic' }).find(
                (entry) => entry.target.modelId === model.modelId,
            )?.configured,
        ).toBe(true);
    });
    it('verifies nominal duration price while refusing to invent unknown minimum and rounding rules', async () => {
        const fetch = vi.fn<typeof globalThis.fetch>(async (url, options) => {
            expect(String(url)).toBe(model.officialModelUrl);
            expect(options?.redirect).toBe('error');
            expect(options?.headers).not.toHaveProperty('Authorization');
            return new Response(evidence);
        });
        const [result] = await source(fetch).fetchPrices([target]);
        expect(result).toMatchObject({ target, status: 'source-changed' });
        expect(result).not.toHaveProperty('price');
        if (result?.status !== 'available') {
            expect(result!.reason).toContain('USD 0.0045 per minute');
            expect(result!.reason).toContain('unverified');
        }
        expect(fetch).toHaveBeenCalledTimes(1);
    });
    it('rejects neighbouring identities, changed endpoints, and unavailable official metadata', async () => {
        const changed = vi.fn<typeof globalThis.fetch>(
            async () =>
                new Response(evidence.replace('Supported', 'Not supported')),
        );
        expect((await source(changed).fetchPrices([target]))[0]?.status).toBe(
            'source-changed',
        );
        const missing = vi.fn<typeof globalThis.fetch>(
            async () => new Response('', { status: 503 }),
        );
        expect((await source(missing).fetchPrices([target]))[0]?.status).toBe(
            'unavailable',
        );
        const unsupported = vi.fn<typeof globalThis.fetch>();
        expect(
            (
                await source(unsupported).fetchPrices([
                    { ...target, modelId: 'unknown' },
                ])
            )[0]?.status,
        ).toBe('unsupported');
        expect(unsupported).not.toHaveBeenCalled();
    });
});
