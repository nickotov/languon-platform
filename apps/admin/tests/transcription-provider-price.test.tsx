import type { ProviderPricePublishRequest } from '@languon/contracts';
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminI18nProvider } from '../src/shared/i18n/admin-i18n-provider';
import { ProviderPriceDialog } from '../src/pages/accounting/ui/provider-prices/provider-price-dialog';
vi.mock('@refinedev/core', () => ({
    useTranslate: () => adminI18nProvider.translate,
}));
beforeAll(() =>
    vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
            matches: false,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }),
    ),
);
afterEach(cleanup);
const rules = {
    version: 1,
    validFrom: '2026-10-01T00:00:00Z',
    validUntil: '2027-01-01T00:00:00Z',
    variants: [
        {
            id: 'test-only',
            applies: {},
            components: [
                {
                    meter: 'audioInputMilliseconds',
                    pricePerUnit: '0.0045',
                    unitQuantity: 60_000,
                    chargeWhen: 'positive-usage',
                },
            ],
        },
    ],
};
async function durationForm() {
    const submit = vi.fn<(input: ProviderPricePublishRequest) => Promise<void>>(
        async () => {},
    );
    render(
        <ProviderPriceDialog
            price={null}
            pending={false}
            error={null}
            onSubmit={submit}
            onClose={vi.fn()}
            onReload={vi.fn()}
        />,
    );
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Meter' }));
    fireEvent.click(
        await screen.findByText('Audio duration (native rules only)', {
            exact: true,
        }),
    );
    return submit;
}
describe('manual native duration price publication', () => {
    it('requires reviewed native rules without prefilling rates or legacy fields', async () => {
        const submit = await durationForm();
        expect(
            screen.getByLabelText('Reviewed native pricing rules (JSON)'),
        ).toHaveValue('');
        expect(
            screen.queryByLabelText('USD per million input tokens'),
        ).not.toBeInTheDocument();
        expect(submit).not.toHaveBeenCalled();
    });
    it('publishes only operator-entered native rules with null legacy dimensions', async () => {
        const submit = await durationForm();
        fireEvent.change(screen.getByLabelText('Provider', { exact: true }), {
            target: { value: 'openai' },
        });
        fireEvent.change(screen.getByLabelText('Model', { exact: true }), {
            target: { value: 'gpt-transcribe' },
        });
        fireEvent.change(
            screen.getByLabelText('Reviewed native pricing rules (JSON)'),
            { target: { value: JSON.stringify(rules) } },
        );
        fireEvent.change(screen.getByLabelText('Price source reference'), {
            target: { value: 'Synthetic reviewed duration contract' },
        });
        fireEvent.change(screen.getByLabelText('Price source URL (HTTPS)'), {
            target: {
                value: 'https://developers.openai.com/api/docs/models/gpt-transcribe',
            },
        });
        fireEvent.change(screen.getByLabelText('Reason for change'), {
            target: { value: 'Synthetic explicit duration publication' },
        });
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Publish provider cost revision',
            }),
        );
        await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
        expect(submit.mock.calls[0]![0]).toMatchObject({
            meter: 'audio-duration',
            nativeRules: rules,
            inputUsdPerMillionTokens: null,
            outputUsdPerMillionTokens: null,
            usdPer1000Characters: null,
            minimumUsdPerRequest: null,
        });
        expect(submit.mock.calls[0]![0]).not.toHaveProperty('nativeRulesJson');
    });
});
