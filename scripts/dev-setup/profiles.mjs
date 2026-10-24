/** Reviewed local presets. Provider rates are estimates, never production defaults. */
const accounting = {
    defaultMaxCreditsPerAction: '10',
    maxProviderCostUsdPerAction: '0.10',
    maxProviderCostUsdPerAccountDay: '1',
    maxProviderCostUsdPerDay: '5',
};
const tariff = {
    providerId: 'deepseek',
    modelId: 'deepseek-flash',
    meter: 'text-tokens',
    creditsPer1000Characters: null,
    minimumCredits: null,
    inputCreditsPerMillionTokens: 100,
    outputCreditsPerMillionTokens: 300,
    cachedInputCreditsPerMillionTokens: 100,
    provisional: true,
};
const providerPrice = {
    providerId: 'deepseek',
    modelId: 'deepseek-flash',
    meter: 'text-tokens',
    inputUsdPerMillionTokens: '0.30',
    outputUsdPerMillionTokens: '1.20',
    cacheReadUsdPerMillionTokens: '0.006',
    cacheWriteUsdPerMillionTokens: null,
    usdPer1000Characters: null,
    sourceReference: 'deepseek-flash-peak-testing',
    sourceUrl: 'https://api-docs.deepseek.com/quick_start/pricing/',
};
export const setupProfiles = {
    'deepseek-local-testing': {
        description:
            'Conservative local testing estimates; review current provider rates before real usage.',
        accounting,
        tariff,
        providerPrice,
    },
    'deterministic-demo': {
        description:
            'Synthetic economics for the disposable deterministic test runtime only.',
        accounting,
        tariff,
        providerPrice: {
            ...providerPrice,
            sourceReference: 'synthetic-deterministic-demo',
            sourceUrl: null,
        },
    },
};

export async function loadContracts() {
    try {
        return await import('../../packages/contracts/dist/index.js');
    } catch {
        throw new Error(
            'Build contracts first: pnpm --filter @languon/contracts build',
        );
    }
}

export function validateProfile(profile, contracts) {
    const reason = 'Reviewed local development setup profile';
    contracts.AiAccountingSettingsPublishSchema.parse({
        ...profile.accounting,
        expectedVersion: 0,
        reason,
    });
    contracts.ModelPricePublishRequestSchema.parse({
        ...profile.tariff,
        expectedVersion: 0,
        reason,
    });
    contracts.ProviderPricePublishRequestSchema.parse({
        ...profile.providerPrice,
        expectedVersion: 0,
        effectiveAt: new Date().toISOString(),
        reason,
    });
    return profile;
}

export function renderProfileDocumentation() {
    return Object.entries(setupProfiles)
        .map(([name, profile]) => {
            const sections = [
                [
                    'Accounting',
                    '/admin/ai/accounting-settings',
                    profile.accounting,
                ],
                [
                    'AI settings → customer tariffs',
                    '/admin/ai/model-prices',
                    profile.tariff,
                ],
                [
                    'Accounting → provider prices',
                    '/admin/ai/accounting/provider-prices',
                    profile.providerPrice,
                ],
            ];
            return (
                `### ${name}\n\n${profile.description}\n\n` +
                sections
                    .map(
                        ([title, path, fields]) =>
                            `**${title}** (API: \`${path}\`)\n\n| Field | Value |\n| --- | --- |\n` +
                            Object.entries(fields)
                                .map(
                                    ([key, value]) =>
                                        `| ${key} | ${value === null ? 'Leave empty' : value} |`,
                                )
                                .join('\n') +
                            '\n',
                    )
                    .join('\n')
            );
        })
        .join('\n');
}
