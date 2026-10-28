import type { ProviderPrice } from '@languon/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { adminI18nProvider } from '../../../../shared/i18n/admin-i18n-provider';
import { ProviderPrices } from './provider-prices';

const state = vi.hoisted(() => ({ prices: [] as ProviderPrice[] }));
vi.mock('@refinedev/core', () => ({
    useTranslate: () => adminI18nProvider.translate,
}));
vi.mock('../../hooks/use-provider-prices', () => ({
    useProviderPrices: () => ({
        prices: state.prices,
        loading: false,
        error: null,
        editing: null,
        add: vi.fn(),
        open: vi.fn(),
        reload: vi.fn(),
    }),
}));
beforeEach(() => {
    vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
            matches: false,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }),
    );
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});
const base: ProviderPrice = {
    id: '00000000-0000-4000-8000-000000000001',
    providerId: 'fixture',
    modelId: 'native-speech',
    meter: 'speech-tokens',
    version: 1,
    createdAt: '2026-10-01T00:00:00Z',
    createdBy: null,
    effectiveAt: '2026-10-01T00:00:00Z',
    sourceReference: 'synthetic source',
    sourceUrl: null,
    reason: 'Synthetic pricing evidence',
    inputUsdPerMillionTokens: null,
    outputUsdPerMillionTokens: null,
    cacheReadUsdPerMillionTokens: null,
    cacheWriteUsdPerMillionTokens: null,
    usdPer1000Characters: null,
    minimumUsdPerRequest: null,
};
function row(price: ProviderPrice) {
    state.prices = [price];
    render(<ProviderPrices />);
    return within(screen.getByText(price.modelId).closest('tr')!);
}
it('shows native speech-token billing currency and variants without unknown flat amounts', () => {
    const native = row({
        ...base,
        nativeRules: {
            version: 1,
            validFrom: base.effectiveAt,
            validUntil: null,
            currency: {
                code: 'UC',
                usdNumerator: '1',
                unitDenominator: '680000',
            },
            variants: [
                {
                    id: 'standard',
                    applies: {},
                    components: [
                        {
                            meter: 'audioOutputTokens',
                            pricePerUnit: '306',
                            unitQuantity: 1000,
                            chargeWhen: 'request',
                        },
                    ],
                },
            ],
        },
    });
    expect(
        native.getByText('Native billing rules', { exact: true }),
    ).toBeInTheDocument();
    expect(
        native.getByText('UC · 1 billing variants', { exact: true }),
    ).toBeInTheDocument();
    expect(native.queryByText(/Unknown/)).not.toBeInTheDocument();
    expect(
        native.getByRole('button', { name: 'View billing rules' }),
    ).toBeInTheDocument();
    expect(
        native.queryByRole('button', { name: /^Edit$/ }),
    ).not.toBeInTheDocument();
});
it('retains legacy text token, cache and minimum USD rates', () => {
    const legacy = row({
        ...base,
        modelId: 'legacy-text',
        meter: 'text-tokens',
        inputUsdPerMillionTokens: '0.12',
        outputUsdPerMillionTokens: '0.34',
        cacheReadUsdPerMillionTokens: '0.01',
        cacheWriteUsdPerMillionTokens: '0.02',
        minimumUsdPerRequest: '0.001',
    });
    expect(
        legacy.getByText('0.12 input / 0.34 output USD per 1M tokens', {
            exact: true,
        }),
    ).toBeInTheDocument();
    expect(
        legacy.getByText('Cache read 0.01 / write 0.02 USD per 1M tokens', {
            exact: true,
        }),
    ).toBeInTheDocument();
    expect(
        legacy.getByText('Minimum per request: USD 0.001', { exact: true }),
    ).toBeInTheDocument();
    expect(legacy.getByRole('button', { name: /^Edit$/ })).toBeInTheDocument();
    expect(legacy.queryByText('Native billing rules')).not.toBeInTheDocument();
});
it('retains legacy speech character USD rates', () => {
    const legacy = row({
        ...base,
        modelId: 'legacy-speech',
        meter: 'speech-characters',
        usdPer1000Characters: '0.03',
    });
    expect(
        legacy.getByText('0.03 USD per 1,000 characters', { exact: true }),
    ).toBeInTheDocument();
    expect(
        legacy.queryByText(/Unknown|Native billing rules/),
    ).not.toBeInTheDocument();
    expect(legacy.getByRole('button', { name: /^Edit$/ })).toBeInTheDocument();
});
