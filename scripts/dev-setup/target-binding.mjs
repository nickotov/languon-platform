import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { validateLocalEnvironment } from '../dev-readiness/checks.mjs';
import { localOrigin } from './configure.mjs';

export function validateApplyEnvironment(env, confirmedDatabase) {
    const identity = validateLocalEnvironment(env);
    if (!confirmedDatabase || identity.database !== confirmedDatabase)
        throw new Error(
            '--confirm-database must exactly match the explicit env-file database name.',
        );
    return identity;
}

export function assertAdminBinding(admin, actor) {
    if (
        !admin ||
        admin.id !== actor.id ||
        admin.status !== 'active' ||
        admin.email !== actor.primaryEmail ||
        admin.role !== actor.role
    )
        throw new Error(
            'The API admin identity does not belong to the confirmed local database.',
        );
}

export async function openTargetBinding({
    envFile,
    confirmedDatabase,
    origin,
    request,
    contracts: c,
    fetchImpl = fetch,
}) {
    if (!envFile)
        throw new Error('--apply requires --env-file and --confirm-database.');
    const env = parseEnv(await readFile(envFile, 'utf8'));
    validateApplyEnvironment(env, confirmedDatabase);
    const target = localOrigin(origin);
    const { createPostgresClient } =
        await import('../../packages/database/dist/index.js');
    const sql = createPostgresClient({
        databaseUrl: env.DATABASE_URL,
        maxConnections: 1,
        connectTimeoutSeconds: 3,
    });
    const verify = async () => {
        const response = await fetchImpl(`${target}/livez`, {
            redirect: 'error',
            signal: AbortSignal.timeout(5000),
        });
        const live = response.ok ? await response.json() : null;
        if (
            live?.service !== 'backend' ||
            live.status !== 'ok' ||
            live.release !== (env.RELEASE_SHA || 'development')
        )
            throw new Error(
                'The API does not match the expected local backend release.',
            );
        const [{ actor }, ai, accounting, tariffs, providers] =
            await Promise.all([
                request('/admin/me', c.AdminMeResponseSchema),
                request('/admin/ai-settings', c.AdminAiSettingsResponseSchema),
                request(
                    '/admin/ai/accounting-settings',
                    c.AiAccountingSettingsSchema,
                ),
                request('/admin/ai/model-prices', c.ModelPricesResponseSchema),
                request(
                    '/admin/ai/accounting/provider-prices',
                    c.ProviderPricesResponseSchema,
                ),
            ]);
        await sql.begin('read only', async (db) => {
            await db`set local statement_timeout='5000ms'`;
            const [admin] =
                await db`select u.id,u.status,e.email,m.role from users u join user_emails e on e.user_id=u.id and e.is_primary join admin_memberships m on m.user_id=u.id and m.revoked_at is null where u.id=${actor.id} and u.status='active'`;
            assertAdminBinding(admin, actor);
            const [configuration] =
                await db`select c.version,r.catalog_snapshot as snapshot from dictionary_ai_configuration c left join dictionary_ai_configuration_revisions r on r.id=c.active_revision_id where c.id='global'`;
            const [settings] =
                await db`select version, default_max_credits_per_action as "defaultMaxCreditsPerAction", max_provider_cost_usd_per_action as "maxProviderCostUsdPerAction", max_provider_cost_usd_per_account_day as "maxProviderCostUsdPerAccountDay", max_provider_cost_usd_per_day as "maxProviderCostUsdPerDay" from ai_accounting_settings_revisions order by version desc limit 1`;
            const customer =
                await db`select distinct on (provider_id,model_id) id,provider_id,model_id,version from model_price_revisions order by provider_id,model_id,version desc`;
            const provider =
                await db`select distinct on (provider_id,model_id,meter) id,provider_id,model_id,meter,version from ai_provider_price_revisions order by provider_id,model_id,meter,version desc`;
            assertRevisionBinding(
                { configuration, settings, customer, provider },
                { ai, accounting, tariffs, providers },
            );
        });
    };
    return { env, verify, close: () => sql.end({ timeout: 2 }) };
}

export function assertRevisionBinding(db, api) {
    const same = (left, right) =>
        JSON.stringify(left) === JSON.stringify(right);
    const sorted = (rows) => rows.sort((a, b) => a.id.localeCompare(b.id));
    const customerDb = sorted(
        db.customer.map((row) => ({ id: row.id, version: row.version })),
    );
    const customerApi = sorted(
        api.tariffs.prices
            .filter((row) => row.rateRevisionId)
            .map((row) => ({ id: row.rateRevisionId, version: row.version })),
    );
    const providerDb = sorted(
        db.provider.map((row) => ({ id: row.id, version: row.version })),
    );
    const providerApi = sorted(
        api.providers.prices.map((row) => ({
            id: row.id,
            version: row.version,
        })),
    );
    const snapshot = db.configuration?.snapshot;
    const configValuesMatch =
        !snapshot ||
        (snapshot.providerId === api.ai.settings.activeProvider &&
            snapshot.modelId === api.ai.settings.defaultModel &&
            same(
                [...snapshot.enabledModelIds].sort(),
                [...api.ai.settings.enabledModels].sort(),
            ));
    const settingsMatch =
        !db.settings ||
        Object.entries(db.settings).every(
            ([key, value]) => api.accounting[key] === value,
        );
    if (
        (db.configuration?.version ?? 0) !== api.ai.settings.version ||
        (db.settings?.version ?? 0) !== api.accounting.version ||
        !same(customerDb, customerApi) ||
        !same(providerDb, providerApi) ||
        !configValuesMatch ||
        !settingsMatch
    )
        throw new Error(
            'API configuration revisions differ from the confirmed local database. No further changes are allowed; inspect the selected target or rerun after concurrent changes.',
        );
}
