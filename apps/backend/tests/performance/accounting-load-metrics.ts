export function percentile(
    samples: readonly number[],
    fraction: number,
): number {
    if (!samples.length || fraction <= 0 || fraction > 1)
        throw new RangeError(
            'Nonempty samples and fraction in (0,1] required.',
        );
    return [...samples].sort((a, b) => a - b)[
        Math.ceil(samples.length * fraction) - 1
    ]!;
}

/** Explicit target validation happens before any connection or fixture mutation. */
export function validatePerformanceTargets(env: NodeJS.ProcessEnv) {
    const database = new URL(env.ACCOUNTING_PERF_DATABASE_URL ?? '');
    const redis = new URL(env.ACCOUNTING_PERF_REDIS_URL ?? '');
    const name = database.pathname.slice(1);
    if (
        env.ALLOW_ACCOUNTING_PERFORMANCE_TESTS !== 'true' ||
        !['postgres:', 'postgresql:'].includes(database.protocol) ||
        !['localhost', '127.0.0.1'].includes(database.hostname) ||
        !database.port ||
        database.port === '5432' ||
        name !== 'languon_auth_accounting_load_test' ||
        env.ACCOUNTING_PERF_DATABASE_CONFIRM !== name ||
        redis.protocol !== 'redis:' ||
        !['localhost', '127.0.0.1'].includes(redis.hostname) ||
        !redis.port ||
        redis.port === '6379' ||
        redis.pathname !== '/3'
    )
        throw new Error(
            'An explicitly confirmed isolated performance database and loopback Redis DB3 on non-default ports are required.',
        );
    return {
        databaseUrl: database.toString(),
        redisUrl: redis.toString(),
        databaseName: name,
    };
}
