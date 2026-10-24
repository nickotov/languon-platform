import { setupProfiles, validateProfile } from './profiles.mjs';

export function localOrigin(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error('Supply an explicit local HTTP origin.');
    }
    if (
        url.protocol !== 'http:' ||
        !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
    ) {
        throw new Error(
            'Only credential-free loopback HTTP origins are allowed.',
        );
    }
    return url.origin;
}

// Compare decimal spellings exactly without floating point conversion.
function normalize(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return normalize(String(value));
    if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value))
        return value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    return value;
}
function matches(current, desired) {
    return (
        current &&
        Object.entries(desired).every(
            ([key, value]) => normalize(current[key]) === normalize(value),
        )
    );
}
export function createAdminClient({
    origin,
    adminOrigin,
    token,
    fetchImpl = fetch,
}) {
    const target = localOrigin(origin);
    const browserOrigin = localOrigin(adminOrigin);
    if (!token || /[\r\n]/.test(token))
        throw new Error(
            'Set LANGUON_DEV_ADMIN_TOKEN to a recent admin access token.',
        );
    return async (path, schema, method = 'GET', body) => {
        const response = await fetchImpl(`${target}${path}`, {
            method,
            redirect: 'error',
            signal: AbortSignal.timeout(15000),
            headers: {
                Authorization: `Bearer ${token}`,
                Origin: browserOrigin,
                'Content-Type': 'application/json',
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
        if (!response.ok) {
            // Never echo arbitrary response content, tokens, or supplied credentials.
            throw new Error(
                `${method} ${path} failed (HTTP ${response.status}). Reauthenticate for 401/403; inspect current revisions for 409. No automatic retry was made.`,
            );
        }
        return schema.parse(await response.json());
    };
}

export async function configure({
    profileName,
    contracts: c,
    request,
    apply = false,
    runtimeEnvironment = {},
    log = console.log,
}) {
    const profile = setupProfiles[profileName];
    if (!profile)
        throw new Error(
            'Unknown profile. Choose deterministic-demo or deepseek-local-testing.',
        );
    validateProfile(profile, c);
    if (
        profileName === 'deterministic-demo' &&
        (runtimeEnvironment.APP_ENV !== 'test' ||
            runtimeEnvironment.DICTIONARY_AI_PROVIDER_FIXTURE_MODE !==
                'deterministic')
    ) {
        throw new Error(
            'deterministic-demo requires the same isolated test runtime environment: APP_ENV=test and DICTIONARY_AI_PROVIDER_FIXTURE_MODE=deterministic. The CLI does not switch server adapters.',
        );
    }
    const [ai, accounting, tariffs, prices] = await Promise.all([
        request('/admin/ai-settings', c.AdminAiSettingsResponseSchema),
        request('/admin/ai/accounting-settings', c.AiAccountingSettingsSchema),
        request('/admin/ai/model-prices', c.ModelPricesResponseSchema),
        request(
            '/admin/ai/accounting/provider-prices',
            c.ProviderPricesResponseSchema,
        ),
    ]);
    const reason = `Local development setup: ${profileName}`;
    const model = profile.tariff.modelId;
    const desiredAi = {
        activeProvider: profile.tariff.providerId,
        defaultModel: model,
        enabledModels: [...new Set([...ai.settings.enabledModels, model])],
    };
    const sameAi =
        ai.settings.activeProvider === desiredAi.activeProvider &&
        ai.settings.defaultModel === model &&
        ai.settings.enabledModels.includes(model);
    const tariff = tariffs.prices.find(
        (item) =>
            item.modelId === model &&
            item.providerId === profile.tariff.providerId &&
            item.meter === profile.tariff.meter,
    );
    const price = prices.prices.find(
        (item) =>
            item.modelId === model &&
            item.providerId === profile.providerPrice.providerId &&
            item.meter === profile.providerPrice.meter,
    );
    const operations = [
        {
            name: 'Accounting limits',
            unchanged: matches(accounting, profile.accounting),
            path: '/admin/ai/accounting-settings',
            method: 'PATCH',
            input: c.AiAccountingSettingsPublishSchema,
            output: c.AiAccountingSettingsSchema,
            body: {
                ...profile.accounting,
                expectedVersion: accounting.version,
                reason,
            },
        },
        {
            name: 'Customer tariff',
            unchanged: matches(tariff, profile.tariff),
            path: '/admin/ai/model-prices',
            method: 'POST',
            input: c.ModelPricePublishRequestSchema,
            output: c.ModelPriceSchema,
            body: {
                ...profile.tariff,
                expectedVersion: tariff?.version ?? 0,
                reason,
            },
        },
        {
            name: 'Provider USD prices',
            unchanged:
                matches(price, profile.providerPrice) &&
                Date.parse(price.effectiveAt) <= Date.now(),
            path: '/admin/ai/accounting/provider-prices',
            method: 'POST',
            input: c.ProviderPricePublishRequestSchema,
            output: c.ProviderPriceSchema,
            body: {
                ...profile.providerPrice,
                expectedVersion: price?.version ?? 0,
                effectiveAt: new Date().toISOString(),
                reason,
            },
        },
        {
            name: 'Default model (preserve other enabled models)',
            unchanged: sameAi,
            path: '/admin/ai-settings',
            method: 'PATCH',
            input: c.AdminAiSettingsMutationRequestSchema,
            output: c.AdminAiSettingsResponseSchema,
            body: {
                ...desiredAi,
                expectedVersion: ai.settings.version,
                reason,
            },
        },
    ];
    // Validate every proposed mutation before making any changes.
    for (const operation of operations)
        operation.body = operation.input.parse(operation.body);
    for (const operation of operations) {
        log(
            `${operation.name}: ${operation.unchanged ? 'already matches' : apply ? 'applying' : 'would update'}`,
        );
        if (!operation.unchanged) {
            log(JSON.stringify(operation.body));
            if (apply)
                await request(
                    operation.path,
                    operation.output,
                    operation.method,
                    operation.body,
                );
        }
    }
    return operations.filter((operation) => !operation.unchanged).length;
}
