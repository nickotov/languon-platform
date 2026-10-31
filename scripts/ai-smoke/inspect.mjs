import {
    readSnapshot,
    expectedMigrations,
    migrationStatus,
} from '../dev-readiness/database.mjs';
import {
    evaluateReadiness,
    selectCapabilities,
    validateLocalEnvironment,
} from '../dev-readiness/checks.mjs';
import {
    ORIGIN,
    EMAIL,
    ROUTE,
    ACTION_MICROS,
    assertSnapshot,
    conversationFunding,
    requireSafe,
} from './policy.mjs';
import { exposureSql } from './expense.mjs';

export async function openInspection(root, env, userId) {
    validateLocalEnvironment(env);
    requireSafe(
        env.APP_ENV === 'development' &&
            !env.DICTIONARY_AI_PROVIDER_FIXTURE_MODE,
        'real-development-required',
    );

    requireSafe(
        (env.AUTH_ALLOWED_ORIGINS ?? '')
            .split(',')
            .map((origin) => origin.trim())
            .includes(ORIGIN),
        'synthetic-origin-not-configured',
    );

    const { createPostgresClient } =
        await import('../../packages/database/dist/index.js');
    const client = createPostgresClient({
        databaseUrl: env.DATABASE_URL,
        maxConnections: 1,
        connectTimeoutSeconds: 3,
    });
    const expected = await expectedMigrations(root);

    return {
        close: () => client.end({ timeout: 2 }),
        inspect: () =>
            client.begin('read only', async (sql) => {
                await sql`set local statement_timeout='5000ms'`;
                const applied =
                    await sql`select created_at,hash from languon_migrations.history order by created_at`;

                requireSafe(
                    migrationStatus(applied, expected).status === 'pass',
                    'migration-mismatch',
                );

                const snapshot = await readSnapshot(sql, EMAIL);
                const [account] =
                    await sql`select u.id,u.status,e.canonical_email as email,(e.verified_at is not null) as verified,
                exists(select 1 from admin_memberships m where m.user_id=u.id and m.revoked_at is null) as admin
                from users u join user_emails e on e.user_id=u.id and e.is_primary where u.id=${userId}`;

                assertSnapshot(snapshot, account, userId);
                const checks = evaluateReadiness(
                    snapshot,
                    env,
                    'runtime',
                    selectCapabilities(env, ['conversation']),
                );

                requireSafe(
                    checks.every((check) => check.status === 'pass'),
                    'conversation-readiness-blocked',
                );

                const [amounts] = await sql`select
                to_char(now() at time zone 'UTC','YYYY-MM-DD') as day,
                extract(epoch from now())::text as epoch,
                (select count(*)::text from ai_operator_action_budgets where owner_id=${userId} and state='active') as active,
                (select count(*)::text from ai_operator_action_budgets where owner_id=${userId}) as history`;
                const [expense] = await sql.unsafe(exposureSql, [amounts.day]);
                requireSafe(
                    amounts.active === '0',
                    'synthetic-account-active-action',
                );

                requireSafe(
                    Math.abs(Date.now() / 1000 - Number(amounts.epoch)) < 30,
                    'database-clock-mismatch',
                );

                requireSafe(
                    Number.isSafeInteger(Number(expense.exposure)) &&
                        Number(expense.exposure) >= 0,
                    'invalid-expense-snapshot',
                );

                return {
                    day: amounts.day,
                    globalExposureMicros: Number(expense.exposure),
                    historicalActions: Number(amounts.history),
                    actionCredits: snapshot.learner.max_credits_per_action,
                    routingRevision: snapshot.routing.id,
                    funding: conversationFunding(snapshot),
                };
            }),
        verifyExpense: (turnId, funding) =>
            client.begin('read only', async (sql) => {
                await sql`set local statement_timeout='5000ms'`;
                const [action] =
                    await sql`select a.state,a.outcome,a.funding,o.state as operator_state,o.consumed_micros::text as consumed
                from ai_credit_actions a join ai_operator_action_budgets o on o.action_id=a.id
                where a.id=${turnId} and a.owner_id=${userId} and o.owner_id=${userId} and a.capability='conversation'`;
                const expenses =
                    await sql`select provider_id,model_id,cost_source,amount_usd_micros::text as amount
                from ai_provider_expense_records where action_id=${turnId}`;

                requireSafe(
                    action?.state === 'settled' &&
                        action.outcome === 'success' &&
                        action.funding === funding &&
                        action.operator_state === 'settled',
                    'provider-action-not-settled',
                );

                requireSafe(
                    expenses.length > 0 &&
                        expenses.every(
                            (expense) =>
                                `${expense.provider_id}/${expense.model_id}` ===
                                    ROUTE &&
                                expense.cost_source !== 'unknown' &&
                                expense.amount !== null,
                        ),
                    'provider-expense-missing-or-route-mismatch',
                );

                const total = expenses.reduce(
                    (sum, expense) => sum + BigInt(expense.amount),
                    0n,
                );

                requireSafe(
                    total > 0n &&
                        total <= BigInt(ACTION_MICROS) &&
                        BigInt(action.consumed) >= total &&
                        BigInt(action.consumed) <= BigInt(ACTION_MICROS),
                    'provider-expense-outside-allowance',
                );

                return Number(total);
            }),
        bindSession: (login) =>
            client.begin('read only', async (sql) => {
                await sql`set local statement_timeout='5000ms'`;
                const [session] =
                    await sql`select id from auth_sessions where id=${login.session.id} and user_id=${userId} and revoked_at is null and absolute_expires_at>now()`;

                requireSafe(Boolean(session), 'api-database-session-mismatch');
            }),
    };
}
