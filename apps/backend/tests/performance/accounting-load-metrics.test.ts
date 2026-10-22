import { describe, expect, it } from 'vitest';
import {
    percentile,
    validatePerformanceTargets,
} from './accounting-load-metrics';

describe('accounting performance evidence boundaries', () => {
    it('uses nearest-rank p95 including slow samples instead of averages', () => {
        expect(
            percentile(
                Array.from({ length: 100 }, (_, n) => n + 1),
                0.95,
            ),
        ).toBe(95);
        expect(percentile([4], 0.95)).toBe(4);
        expect(() => percentile([], 0.95)).toThrow();
    });
    it('requires explicit isolated targets before creating fixture data', () => {
        const valid = {
            ALLOW_ACCOUNTING_PERFORMANCE_TESTS: 'true',
            ACCOUNTING_PERF_DATABASE_URL:
                'postgres://fixture@localhost:55481/languon_auth_accounting_load_test',
            ACCOUNTING_PERF_DATABASE_CONFIRM:
                'languon_auth_accounting_load_test',
            ACCOUNTING_PERF_REDIS_URL: 'redis://localhost:56381/3',
        };
        expect(validatePerformanceTargets(valid).databaseName).toBe(
            valid.ACCOUNTING_PERF_DATABASE_CONFIRM,
        );
        for (const patch of [
            { ALLOW_ACCOUNTING_PERFORMANCE_TESTS: 'false' },
            {
                ACCOUNTING_PERF_DATABASE_URL:
                    'postgres://localhost:55481/languon_auth_accounting_test',
            },
            { ACCOUNTING_PERF_DATABASE_CONFIRM: 'other_test' },
            { ACCOUNTING_PERF_REDIS_URL: 'redis://localhost:56381/0' },
            { ACCOUNTING_PERF_REDIS_URL: 'redis://remote:56381/3' },
            {
                ACCOUNTING_PERF_DATABASE_URL:
                    'postgres://localhost:5432/languon_auth_accounting_load_test',
            },
        ])
            expect(() =>
                validatePerformanceTargets({ ...valid, ...patch }),
            ).toThrow();
    });
});
