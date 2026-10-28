import type { ProviderPrice } from '@languon/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { adminI18nProvider } from '../../../../shared/i18n/admin-i18n-provider';
import { ProviderPriceDialog } from './provider-price-dialog';

vi.mock('@refinedev/core', () => ({
    useTranslate: () => adminI18nProvider.translate,
}));
beforeEach(() => {
    vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }),
    );
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});
const price: ProviderPrice = {
    id: '00000000-0000-4000-8000-000000000001',
    providerId: 'fixture',
    modelId: 'speech',
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
    nativeRules: {
        version: 1,
        validFrom: '2026-10-01T00:00:00Z',
        validUntil: null,
        currency: { code: 'UC', usdNumerator: '1', unitDenominator: '680000' },
        variants: [
            {
                id: 'standard',
                applies: { serviceTiers: ['standard'] },
                components: [
                    {
                        meter: 'audioOutputTokens',
                        pricePerUnit: '0.123456789012345678901234',
                        unitQuantity: 1000,
                        chargeWhen: 'request',
                        minimum: '100',
                        rounding: { quantum: '1', mode: 'ceil' },
                    },
                ],
            },
        ],
    },
};
it('routes native speech tokens away from the flat editor and retains exact amounts and native currency', () => {
    render(
        <ProviderPriceDialog
            price={price}
            pending={false}
            error={null}
            onSubmit={vi.fn()}
            onClose={vi.fn()}
            onReload={vi.fn()}
        />,
    );
    expect(
        screen.getByText(
            '0.123456789012345678901234 UC per 1000 audio output tokens',
        ),
    ).toBeInTheDocument();
    expect(screen.getByText('1 USD per 680000 UC')).toBeInTheDocument();
    expect(screen.getByText('No declared expiry')).toBeInTheDocument();
    expect(screen.getByText('Component minimum: 100 UC')).toBeInTheDocument();
    expect(
        screen.getByText(
            'Charged on every matching request, including zero usage',
        ),
    ).toBeInTheDocument();
    expect(screen.getByText('Round up to 1 UC')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(
        screen.queryByRole('button', {
            name: 'Publish provider cost revision',
        }),
    ).not.toBeInTheDocument();
    expect(
        screen.queryByText('Unknown', { exact: true }),
    ).not.toBeInTheDocument();
});
