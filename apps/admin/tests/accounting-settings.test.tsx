import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountingSettings } from '../src/pages/accounting/ui/accounting-settings/accounting-settings';
import { operatorBudgetOrderValid } from '../src/pages/accounting/lib/operator-budgets';
import { adminI18nProvider } from '../src/shared/i18n/admin-i18n-provider';
import { accessTokenStore } from '../src/shared/auth/access-token-store';

vi.mock('@refinedev/core', () => ({
    useTranslate: () => adminI18nProvider.translate,
}));
const initial = {
    version: 4,
    defaultMaxCreditsPerAction: null,
    maxProviderCostUsdPerAction: null,
    maxProviderCostUsdPerAccountDay: null,
    maxProviderCostUsdPerDay: null,
};
const response = (value: unknown) =>
    new Response(JSON.stringify(value), {
        headers: { 'Content-Type': 'application/json' },
    });
const labels = [
    'Maximum provider expense per action (USD)',
    'Maximum provider expense per account per UTC day (USD)',
    'Maximum provider expense per UTC day, all accounts (USD)',
];
beforeEach(() => {
    accessTokenStore.set('admin-token');
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    accessTokenStore.clear();
});
function renderSettings() {
    const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => response(initial));
    vi.stubGlobal('fetch', fetcher);
    render(<AccountingSettings />);
    return fetcher;
}
async function loaded() {
    await waitFor(() =>
        expect(screen.getByLabelText(labels[0]!)).toBeEnabled(),
    );
}
function set(label: string, value: string) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function submit() {
    set('Reason for change', 'Calibrate operator cost limits');
    fireEvent.click(
        screen.getByRole('button', { name: 'Publish action budget revision' }),
    );
}

describe('admin operator cost limits', () => {
    it('keeps all initial monetary values blank and publishes explicit nulls while uncalibrated', async () => {
        const fetcher = renderSettings();
        await loaded();
        for (const label of labels)
            expect(screen.getByLabelText(label)).toHaveValue('');
        submit();
        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
        expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
            expectedVersion: 4,
            defaultMaxCreditsPerAction: null,
            maxProviderCostUsdPerAction: null,
            maxProviderCostUsdPerAccountDay: null,
            maxProviderCostUsdPerDay: null,
            reason: 'Calibrate operator cost limits',
        });
    });
    it('publishes exact six-decimal USD caps independently of the credit budget', async () => {
        const fetcher = renderSettings();
        await loaded();
        set(labels[0]!, '0.000123');
        set(labels[1]!, '0.123456');
        set(labels[2]!, '1.234567');
        set(
            'Default maximum credits per action (blank = uncalibrated)',
            '0.125',
        );
        submit();
        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
        expect(
            JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)),
        ).toMatchObject({
            expectedVersion: 4,
            defaultMaxCreditsPerAction: '0.125',
            maxProviderCostUsdPerAction: '0.000123',
            maxProviderCostUsdPerAccountDay: '0.123456',
            maxProviderCostUsdPerDay: '1.234567',
        });
    });
    it('blocks inverted limits before publishing and preserves entered values', async () => {
        const fetcher = renderSettings();
        await loaded();
        set(labels[0]!, '1.000001');
        set(labels[1]!, '1');
        set(labels[2]!, '2');
        submit();
        expect(
            await screen.findByText(
                'Provider expense limits must increase from per action to per account per day to all accounts per day.',
            ),
        ).toBeInTheDocument();
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(screen.getByLabelText(labels[0]!)).toHaveValue('1.000001');
    });
    it('compares micro-dollar precision exactly and permits staged null calibration', () => {
        expect(
            operatorBudgetOrderValid({
                maxProviderCostUsdPerAction: '999999998.999999',
                maxProviderCostUsdPerAccountDay: '999999999',
                maxProviderCostUsdPerDay: '999999999.000001',
            }),
        ).toBe(true);
        expect(
            operatorBudgetOrderValid({
                maxProviderCostUsdPerAction: '0.000002',
                maxProviderCostUsdPerAccountDay: '',
                maxProviderCostUsdPerDay: '0.000001',
            }),
        ).toBe(false);
        expect(
            operatorBudgetOrderValid({
                maxProviderCostUsdPerAction: '',
                maxProviderCostUsdPerAccountDay: '',
                maxProviderCostUsdPerDay: '',
            }),
        ).toBe(true);
    });
});
