import { selectedModel, workerSupports, customerFunded } from './worker.mjs';
// Add future critical AI capabilities here with their current worker formats.
// This registry describes prerequisites; it never claims a successful generation.
export const capabilityRequirements = [
    {
        id: 'dictionary',
        criticalFlow: 'dictionary-generation',
        formats: ['single-card:v2', 'card-authoring:v3'],
    },
    {
        id: 'texts',
        criticalFlow: 'text-generation',
        flag: 'TEXTS_AI_ENABLED',
        formats: ['text-detection:v2', 'text-translation:v3'],
    },
    {
        id: 'conversation',
        criticalFlow: 'chat-lifecycle',
        formats: ['conversation:v1'],
    },
    {
        id: 'interview',
        criticalFlow: 'free-interview',
        formats: ['portrait-interview:v1'],
    },
    {
        id: 'sentences',
        flag: 'LEARNING_SENTENCES_ENABLED',
        formats: ['sentence-generation:v2', 'sentence-check:v1'],
    },
];

export function selectCapabilities(
    env,
    requested = [],
    registry = capabilityRequirements,
) {
    const ids = requested.flatMap((value) => value.split(','));
    for (const id of ids) {
        if (!registry.some((capability) => capability.id === id))
            throw new Error(
                'Unknown readiness capability. Use dictionary, texts, conversation, interview or sentences.',
            );
    }
    return registry.filter((capability) =>
        ids.length
            ? ids.includes(capability.id)
            : !capability.flag || env[capability.flag] === 'true',
    );
}

export function validateLocalEnvironment(env) {
    if (
        !['development', 'test'].includes(env.APP_ENV) ||
        env.NODE_ENV === 'production'
    ) {
        throw new Error(
            'Use an explicit development or test APP_ENV. Production is refused.',
        );
    }
    let url;
    try {
        url = new URL(env.DATABASE_URL);
    } catch {
        throw new Error('DATABASE_URL must be a valid local PostgreSQL URL.');
    }
    if (
        !['postgres:', 'postgresql:'].includes(url.protocol) ||
        !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        url.search ||
        url.hash
    ) {
        throw new Error(
            'DATABASE_URL must use loopback PostgreSQL without query overrides.',
        );
    }
    const database = decodeURIComponent(url.pathname.slice(1));
    if (!database || (env.POSTGRES_DB && env.POSTGRES_DB !== database)) {
        throw new Error(
            'DATABASE_URL database must match POSTGRES_DB when supplied.',
        );
    }
    return { host: url.hostname, port: url.port || '5432', database };
}

export function evaluateReadiness(
    snapshot,
    env,
    phase = 'runtime',
    registry = selectCapabilities(env),
    grouped = false,
) {
    if (!grouped) {
        const groups = new Map();
        for (const capability of registry) {
            const model = selectedModel(snapshot, capability);
            const key = model?.id ?? 'unknown';
            groups.set(key, [...(groups.get(key) ?? []), capability]);
        }
        return [...groups.entries()].flatMap(([model, capabilities]) =>
            evaluateReadiness(snapshot, env, phase, capabilities, true).map(
                (check) => ({
                    ...check,
                    id: groups.size > 1 ? `${model}/${check.id}` : check.id,
                }),
            ),
        );
    }
    const results = [];
    const check = (id, ok, message, remedy) =>
        results.push({
            id,
            status: ok ? 'pass' : 'blocked',
            message: ok ? message : remedy,
        });
    check(
        'routing',
        env.DICTIONARY_AI_MANAGED_ROUTING_ENABLED === 'true',
        'Managed AI routing enabled.',
        'Set DICTIONARY_AI_MANAGED_ROUTING_ENABLED=true and restart backend and workers.',
    );
    const configuration = snapshot.configuration;
    check(
        'model',
        Boolean(
            configuration?.modelId &&
            configuration.enabledModelIds?.includes(configuration.modelId),
        ),
        'Default model is enabled.',
        'Admin → AI settings: enable a model and select an enabled default.',
    );
    const model = selectedModel(snapshot, registry[0]);
    const modelId = model?.id;
    const providerId = model?.providerId;
    check(
        'selected-model',
        Boolean(model && configuration?.enabledModelIds?.includes(modelId)),
        'Selected capability model is enabled.',
        'Admin → AI settings: enable the capability-selected model. Auto conversation/interview uses DeepSeek Flash; explicit learner selection must be enabled.',
    );
    const credentialFlag =
        providerId === 'deepseek'
            ? 'DICTIONARY_AI_DEEPSEEK_CREDENTIAL_CONFIGURED'
            : providerId === 'kie'
              ? 'DICTIONARY_AI_KIE_CREDENTIAL_CONFIGURED'
              : null;
    if (credentialFlag)
        check(
            'credential-advertisement',
            env[credentialFlag] === 'true',
            'API advertises provider credentials configured.',
            `Set ${credentialFlag}=true only after configuring its worker credential or the deterministic test adapter.`,
        );
    const price = snapshot.prices.find(
        (p) => p.model_id === modelId && p.provider_id === providerId,
    );
    check(
        'provider-price',
        price?.data?.inputUsdPerMillionTokens != null &&
            price?.data?.outputUsdPerMillionTokens != null &&
            (providerId !== 'deepseek' ||
                price?.data?.cacheReadUsdPerMillionTokens != null),
        'Effective provider input/output/cache prices exist.',
        'Admin → Accounting → Provider prices: publish current text-token input/output and required cache-read prices for the selected model. Future-dated prices are not active.',
    );
    check(
        'customer-tariff',
        snapshot.tariffs.some(
            (p) => p.model_id === modelId && p.provider_id === providerId,
        ),
        'Customer tariff exists.',
        'Admin → AI settings: publish a text-token customer tariff for the selected model.',
    );
    const settings = snapshot.settings;
    check(
        'budgets',
        settings &&
            [
                ...(registry.some((capability) =>
                    customerFunded(snapshot, capability),
                ) && !snapshot.learner?.unlimited
                    ? ['default_max_credits_per_action']
                    : []),
                'max_provider_cost_usd_per_action',
                'max_provider_cost_usd_per_account_day',
                'max_provider_cost_usd_per_day',
            ].every((k) => Number(settings[k]) > 0),
        'Application and operator budgets configured.',
        'Admin → Accounting: set default action credits and all three positive operator USD limits.',
    );
    const override = env.DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS?.trim();
    const configuredFormats = override ? override.split(',') : [];
    for (const capability of registry) {
        if (capability.flag)
            check(
                `${capability.id}:enabled`,
                env[capability.flag] === 'true',
                'Capability admission enabled.',
                `Set ${capability.flag}=true to enable the requested capability.`,
            );
        const missing = capability.formats.filter(
            (f) => !configuredFormats.includes(f),
        );
        check(
            `${capability.id}:environment`,
            missing.length === 0,
            'Worker format override permits this capability.',
            `DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS lacks ${missing.join(', ')}. Add these formats to the comma-separated list without spaces; restart workers.`,
        );
        if (phase === 'runtime') {
            const absent = capability.formats.filter(
                (format) =>
                    !snapshot.workers.some((worker) =>
                        workerSupports(worker, model, capability, format),
                    ),
            );
            check(
                `${capability.id}:worker`,
                absent.length === 0,
                'Fresh worker advertises required formats.',
                `No fresh worker with matching provider, adapter, execution identity and revisions for ${absent.join(', ')} on the selected model. Start/restart the dictionary worker and check provider credential presence and its startup logs.`,
            );
        }
    }
    if (snapshot.learnerRequested) {
        check(
            'learner',
            Boolean(snapshot.learner),
            'Requested learner exists.',
            'Create the requested local learner account first.',
        );
        if (
            snapshot.learner &&
            !snapshot.learner.unlimited &&
            registry.some((capability) => customerFunded(snapshot, capability))
        ) {
            check(
                'learner-budget',
                Number(
                    snapshot.learner.max_credits_per_action ??
                        settings?.default_max_credits_per_action,
                ) > 0,
                'Learner action budget permits paid work.',
                'Learner → AI settings: set a positive maximum credits per action.',
            );
            const milli = BigInt(snapshot.learner.available_milli ?? '0');
            check(
                'learner-balance',
                snapshot.learner.unlimited || milli > 0n,
                snapshot.learner.unlimited
                    ? 'Learner has unlimited credits.'
                    : `Available balance: ${milli / 1000n}.${String(milli % 1000n).padStart(3, '0')} credits.`,
                'Admin → User credits: grant test credits. Free capabilities do not need learner credits.',
            );
        }
    }
    return results;
}
