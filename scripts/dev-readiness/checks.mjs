import {
    selectedModel,
    workerSupports,
    customerFunded,
    probeEvidence,
} from './worker.mjs';
// Add future critical AI capabilities here with their current worker formats.
// This registry describes prerequisites; it never claims a successful generation.
export const capabilityRequirements = [
    {
        id: 'dictionary',
        criticalFlow: 'dictionary-generation',
        formats: [
            'single-card:v2',
            'card-authoring:v3',
            'pasted-terms:v2',
            'import-pairs:v2',
            'document-terms:v2',
        ],
    },
    {
        id: 'texts',
        criticalFlow: 'text-generation',
        flag: 'TEXTS_AI_ENABLED',
        formats: [
            'text-detection:v2',
            'text-translation:v3',
            'text-selection-card:v1',
        ],
    },
    {
        id: 'knowledge-actions',
        criticalFlow: 'interactive-workbooks',
        flag: 'TEXTS_AI_ENABLED',
        formats: ['text-translation:v4'],
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

function capabilityEnabled(capability, env) {
    if (!capability.flag) return true;
    const fallback =
        capability.flag === 'LEARNING_SENTENCES_ENABLED' &&
        ['development', 'test'].includes(env.APP_ENV);
    return (
        env[capability.flag] === 'true' ||
        (env[capability.flag] === undefined && fallback)
    );
}

export function selectCapabilities(
    env,
    requested = [],
    registry = capabilityRequirements,
) {
    const ids = requested.flatMap((value) => value.split(','));
    for (const id of ids) {
        if (!registry.some((capability) => capability.id === id))
            throw new Error(
                'Unknown readiness capability. Use dictionary, texts, knowledge-actions, conversation, interview or sentences.',
            );
    }
    return registry.filter((capability) =>
        ids.length
            ? ids.includes(capability.id)
            : capabilityEnabled(capability, env),
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
            for (const format of capability.formats) {
                const flow = format.split(':')[0];
                const configuration = snapshot.routing?.configuration;
                const policy =
                    configuration?.overrides?.[flow] ?? configuration?.default;
                const routes = policy
                    ? [policy.primaryRouteId, ...policy.fallbackRouteIds]
                    : [null];
                for (const routeId of routes) {
                    const item = { ...capability, formats: [format], routeId };
                    const key = `${routeId ?? 'unconfigured'}/${flow}`;
                    groups.set(key, [...(groups.get(key) ?? []), item]);
                }
            }
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
    const configuration = snapshot.routing?.configuration;
    check(
        'model',
        Boolean(configuration),
        'Admin routing is published.',
        'Admin → AI routing: publish a default route and flow overrides after successful checks. Legacy learner/default model settings do not authorize new work.',
    );
    const model = selectedModel(snapshot, registry[0]);
    const modelId = model?.id;
    const providerId = model?.providerId;
    const routeId = model ? `${providerId}/${modelId}` : null;
    check(
        'selected-model',
        Boolean(
            model &&
            !model.retired &&
            model.providerId !== 'evolink' &&
            registry.every((capability) =>
                capability.formats.every((format) =>
                    model.supportedFormats.includes(format),
                ),
            ) &&
            configuration?.enabledRouteIds.includes(routeId),
        ),
        'Selected flow route is enabled and reviewed.',
        'Admin → AI routing: enable a reviewed compatible primary/fallback route; retired routes cannot run. EvoLink learner processing remains blocked pending its processing/privacy review.',
    );
    if (model)
        check(
            'credential',
            Boolean(env[model.credentialReference]?.trim()) ||
                (env.APP_ENV === 'test' &&
                    env.DICTIONARY_AI_PROVIDER_FIXTURE_MODE ===
                        'deterministic'),
            'Provider credential is configured (value hidden).',
            `Configure ${model.credentialReference} in the ignored backend/worker environment and restart. Never paste keys into reports.`,
        );
    const evidence = probeEvidence(snapshot, env, registry[0], model);
    check(
        'flow-check',
        evidence.ready,
        evidence.stale
            ? 'Unchanged active flow check is aged: dispatch remains allowed; rerun the selected-flow check before any routing publication.'
            : 'Matching selected-flow check permits dispatch.',
        'Admin → AI routing: run Test selected flow with this route and current credentials; quick checks alone cannot activate a flow. Review hard failures and rerun before publishing. Transient failures require bounded recovery.',
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
        registry.every(
            (capability) =>
                !customerFunded(snapshot, capability) ||
                Boolean(
                    configuration?.flowTariffs?.[
                        capability.formats[0].split(':')[0]
                    ],
                ),
        ),
        'Paid flow customer tariff exists; free flows need no learner tariff.',
        'Admin → AI routing: publish a per-flow customer tariff for every paid flow. Model-specific legacy tariffs do not satisfy this requirement.',
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
                capabilityEnabled(capability, env),
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
