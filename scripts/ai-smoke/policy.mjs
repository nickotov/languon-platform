import { z } from 'zod';

export const API = 'http://127.0.0.1:4000';
export const ORIGIN = 'http://localhost:3333';
export const EMAIL = 'ai-tester@testmail.test';
export const ROUTE = 'openrouter/openai/gpt-6-luna';
export const ACTION_MICROS = 100_000;
export const DAY_MICROS = 500_000;
export const TaskSchema = z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(100);
export const CredentialsSchema = z.object({
    AI_SMOKE_EMAIL: z.literal(EMAIL),
    AI_SMOKE_PASSWORD: z.string().min(15).max(1024),
    AI_SMOKE_USER_ID: z.uuid(),
});

export class SmokeError extends Error {
    constructor(code) {
        super(code);
        this.name = 'SmokeError';
    }
}

export function requireSafe(condition, code) {
    if (!condition) {
        throw new SmokeError(code);
    }
}

export function micros(value) {
    requireSafe(
        typeof value === 'string' && /^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value),
        'invalid-money',
    );

    const [whole, fraction = ''] = value.split('.');
    const result = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
    requireSafe(result <= BigInt(Number.MAX_SAFE_INTEGER), 'invalid-money');

    return Number(result);
}

export function assertSnapshot(snapshot, account, expectedUserId) {
    requireSafe(
        account?.id === expectedUserId &&
            account.email === EMAIL &&
            account.status === 'active' &&
            account.verified === true &&
            account.admin === false,
        'synthetic-account-mismatch',
    );

    const config = snapshot.routing?.configuration;
    const policy = config?.overrides?.conversation ?? config?.default;
    requireSafe(
        policy?.primaryRouteId === ROUTE &&
            Array.isArray(policy.fallbackRouteIds) &&
            policy.fallbackRouteIds.length === 0 &&
            config.enabledRouteIds.includes(ROUTE),
        'route-not-allowed',
    );

    for (const [key, maximum] of [
        ['max_provider_cost_usd_per_action', ACTION_MICROS],
        ['max_provider_cost_usd_per_account_day', 1_000_000],
        ['max_provider_cost_usd_per_day', 5_000_000],
    ]) {
        const amount = micros(snapshot.settings?.[key]);
        requireSafe(
            amount > 0 && amount <= maximum,
            'operator-limit-not-bounded',
        );
    }

    requireSafe(
        snapshot.learner &&
            !snapshot.learner.unlimited &&
            Number(snapshot.learner.max_credits_per_action) > 0 &&
            Number(snapshot.learner.max_credits_per_action) <= 50,
        'learner-budget-not-bounded',
    );

    requireSafe(
        BigInt(snapshot.learner.available_milli) >=
            BigInt(
                Math.ceil(
                    Number(snapshot.learner.max_credits_per_action) * 1000,
                ),
            ),
        'learner-balance-insufficient',
    );

    requireSafe(
        ['customer', 'operator'].includes(conversationFunding(snapshot)),
        'conversation-funding-unsupported',
    );
}

export function conversationFunding(snapshot) {
    return (
        snapshot.policies.find((item) => item.capability === 'conversation')
            ?.funding ?? 'customer'
    );
}
