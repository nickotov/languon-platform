import { describe, expect, it, vi } from 'vitest';
import { loadTextAiProbeEnvironment } from '../../../src/config/text-ai-probe-environment';
import { adminProbeFixtureEnabled } from '../../../src/config/admin-probe-fixture-environment';

describe('operator probe environment boundaries', () => {
    it('uses documented bounded defaults and warns without supplied values', () => {
        const warn = vi.fn();
        const result = loadTextAiProbeEnvironment({}, { warn, error: vi.fn() });
        expect(result.limits.maximumCostMicros).toBe(10_000n);
        expect(result.limits.dailyMaximumCostMicros).toBe(100_000n);
        expect(result.limits.cooldownSeconds).toBe(10);
        expect(result.limits.evidenceHours).toBe(24);
        expect(warn).toHaveBeenCalled();
        expect(JSON.stringify(warn.mock.calls)).not.toContain('secret');
    });
    it('rejects invalid required bounded values without echoing credentials', () => {
        expect(() =>
            loadTextAiProbeEnvironment(
                {
                    AI_ADMIN_PROBE_MAX_COST_MICROS: '-1',
                    OPENROUTER_API_KEY: 'secret',
                },
                { warn: vi.fn(), error: vi.fn() },
            ),
        ).toThrow();
    });
    it('keeps the synthetic fixture disabled by default', () => {
        expect(adminProbeFixtureEnabled({})).toBe(false);
    });
    it('requires a disposable loopback database and synthetic credentials', () => {
        const base = {
            ADMIN_E2E_SYNTHETIC_PROBES: 'true',
            APP_ENV: 'development',
            DATABASE_URL:
                'postgres://fixture:fixture@127.0.0.1:55432/languon_admin_e2e_test',
            DEEPSEEK_API_KEY: 'synthetic-test-key',
        };
        expect(adminProbeFixtureEnabled(base)).toBe(true);
        for (const change of [
            { NODE_ENV: 'production' },
            { APP_ENV: 'production' },
            {
                DATABASE_URL:
                    'postgres://fixture:fixture@127.0.0.1:5432/languon_admin_e2e_test',
            },
            {
                DATABASE_URL:
                    'postgres://fixture:fixture@127.0.0.1:55432/languon',
            },
            {
                DATABASE_URL:
                    'postgres://fixture:fixture@example.test:55432/languon_admin_e2e_test',
            },
            { DEEPSEEK_API_KEY: 'real-credential' },
        ]) {
            expect(() =>
                adminProbeFixtureEnabled({ ...base, ...change }),
            ).toThrow();
        }
    });
});
