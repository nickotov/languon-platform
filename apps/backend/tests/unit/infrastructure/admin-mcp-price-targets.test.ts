import { describe, expect, it } from 'vitest';
import { configuredPriceTargets } from '../../../src/infrastructure/admin-mcp/price-actualization';

describe('configured pricing targets', () => {
    it('does not fetch prices when no provider credentials are configured', () => {
        expect(configuredPriceTargets({})).toEqual([]);
    });
    it('discovers both text and speech without exposing retired or fixture models', () => {
        const targets = configuredPriceTargets({
            OPENROUTER_API_KEY: 'synthetic',
        });
        expect(targets.length).toBeGreaterThan(1);
        expect(
            targets.every((target) => target.providerId === 'openrouter'),
        ).toBe(true);
        expect(targets).toContainEqual({
            providerId: 'openrouter',
            modelId: 'qwen/qwen3.5-flash-02-23',
            meter: 'text-tokens',
        });
        expect(targets).toContainEqual({
            providerId: 'openrouter',
            modelId: 'elevenlabs/eleven-v4-turbo',
            meter: 'speech-characters',
        });
        const withKie = configuredPriceTargets({ KIE_API_KEY: 'synthetic' });
        expect(withKie.some((t) => t.modelId === 'gemini-2.5-pro')).toBe(false);
        expect(withKie.some((t) => t.meter === 'speech-characters')).toBe(true);
        expect(
            [...targets, ...withKie].some((t) => t.providerId === 'fixture'),
        ).toBe(false);
    });
});
