import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { ProviderPriceDialog } from '../src/pages/accounting/ui/provider-prices/provider-price-dialog';
import { AccountingRecordDialog } from '../src/pages/accounting/ui/accounting-record-dialog/accounting-record-dialog';
import type { AccountingReport } from '@languon/contracts';
import { AccountingReportPanel } from '../src/pages/accounting/ui/accounting-report/accounting-report';
import { adminApi, AdminApiError } from '../src/shared/api/admin-api';
import { reportWhenReady } from '../src/pages/accounting/lib/report-when-ready';
import { accessTokenStore } from '../src/shared/auth/access-token-store';
import { adminI18nProvider } from '../src/shared/i18n/admin-i18n-provider';

vi.mock('@refinedev/core', () => ({
    useTranslate: () => adminI18nProvider.translate,
}));
const id = '00000000-0000-4000-8000-000000000042';
const at = '2026-10-22T00:00:00.000Z';
const report: AccountingReport = {
    generatedAt: at,
    from: at,
    to: '2026-10-23T00:00:00.000Z',
    cash: {
        paymentsUsd: '10',
        refundsUsd: '0',
        feesUsd: '0',
        netReceiptsUsd: '10',
    },
    usage: {
        calculatedExpenseUsd: '0.000123',
        measuredCount: 1,
        estimatedCount: 2,
        unknownCount: 3,
        allocatedPurchaseValueUsd: '1',
        unusedPurchaseValueUsd: '9',
        refundedConsumedValueUsd: '0',
        manualUnallocatedAdjustmentUsd: '0',
        operationalMarginUsd: '0.999877',
        complete: false,
    },
    providers: [
        {
            providerId: 'provider',
            depositsUsd: '10',
            calculatedExpenseUsd: '0.000123',
            latestBalanceUsd: null,
            balanceObservedAt: null,
            estimatedRemainingUsd: '9.999877',
            bills: [],
        },
    ],
};
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
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    accessTokenStore.clear();
});
const response = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

describe('accounting administration', () => {
    it('starts provider tariffs blank and publishes exact six-decimal USD independently of credit pricing', async () => {
        const submit = vi.fn().mockResolvedValue(undefined);
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
        expect(
            screen.getByLabelText('USD per million input tokens'),
        ).toHaveValue('');
        const values = {
            Provider: 'provider',
            Model: 'model',
            'USD per million input tokens': '0.000123',
            'USD per million output tokens': '1.234567',
            'Price source reference': 'Verified provider pricing 2026-10-22',
            'Reason for change': 'Calibrate measured provider expense',
        };
        for (const [label, value] of Object.entries(values))
            fireEvent.change(screen.getByLabelText(label), {
                target: { value },
            });
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Publish provider cost revision',
            }),
        );
        await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
        expect(submit.mock.calls[0]?.[0]).toMatchObject({
            expectedVersion: 0,
            meter: 'text-tokens',
            inputUsdPerMillionTokens: '0.000123',
            outputUsdPerMillionTokens: '1.234567',
            usdPer1000Characters: null,
            cacheReadUsdPerMillionTokens: null,
            cacheWriteUsdPerMillionTokens: null,
            sourceUrl: null,
        });
    });

    it('waits for the background reporting snapshot and stops immediately when aborted', async () => {
        vi.useFakeTimers();
        const pending = new AdminApiError(503, {
            code: 'service_unavailable',
            correlationId: id,
            message: 'Preparing snapshot.',
        });
        const request = vi
            .spyOn(adminApi, 'accountingReport')
            .mockRejectedValueOnce(pending)
            .mockResolvedValueOnce(report);
        const result = reportWhenReady({ from: at, to: report.to });
        await vi.advanceTimersByTimeAsync(2_000);
        expect(await result).toBe(report);
        expect(request).toHaveBeenCalledTimes(2);
        request.mockRejectedValue(pending);
        const controller = new AbortController();
        const aborted = reportWhenReady(
            { from: at, to: report.to },
            controller.signal,
        );
        const assertion = expect(aborted).rejects.toBeDefined();
        await vi.advanceTimersByTimeAsync(0);
        controller.abort();
        await assertion;
        await vi.advanceTimersByTimeAsync(60_000);
        expect(request).toHaveBeenCalledTimes(3);
    });
    it('publishes an uncalibrated action budget explicitly without inventing a number', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValue(
                response({ version: 2, defaultMaxCreditsPerAction: null }),
            );
        vi.stubGlobal('fetch', fetcher);
        await adminApi.publishAccountingSettings({
            expectedVersion: 1,
            defaultMaxCreditsPerAction: null,
            reason: 'Await economic calibration',
        });
        expect(fetcher.mock.calls[0]?.[1]?.method).toBe('PATCH');
        expect(
            JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)),
        ).toMatchObject({
            expectedVersion: 1,
            defaultMaxCreditsPerAction: null,
        });
    });

    it('submits a payment form with exact decimal credits and USD without irrelevant fields', async () => {
        const submit = vi.fn().mockResolvedValue(undefined);
        const user = userEvent.setup();
        render(
            <AccountingRecordDialog
                records={[]}
                pending={false}
                onSubmit={submit}
                onClose={vi.fn()}
            />,
        );
        fireEvent.change(screen.getByLabelText('External reference'), {
            target: { value: 'bank-42' },
        });
        fireEvent.change(
            screen.getByLabelText('Amount (USD, up to 6 decimals)'),
            { target: { value: '0.000123' } },
        );
        fireEvent.change(screen.getByLabelText('Customer user ID'), {
            target: { value: id },
        });
        fireEvent.change(
            screen.getByLabelText('Purchased credits (up to 3 decimals)'),
            { target: { value: '0.125' } },
        );
        fireEvent.change(screen.getByLabelText('Reason for change'), {
            target: { value: 'Received external payment' },
        });
        await user.click(
            screen.getByRole('button', { name: 'Save manual record' }),
        );
        await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
        expect(submit.mock.calls[0]?.[0]).toMatchObject({
            kind: 'payment',
            amountUsd: '0.000123',
            credits: '0.125',
            originalCurrency: null,
            originalAmount: null,
        });
        expect(submit.mock.calls[0]?.[0]).not.toHaveProperty(
            'revokeAvailableCredits',
        );
    });
    it('shows unknown cost and balance explicitly and hides incomplete margin', () => {
        render(<AccountingReportPanel report={report} />);
        expect(
            screen.getByText(/1 measured · 2 estimated · 3 unknown/),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Known usage expense (USD, incomplete)'),
        ).toBeInTheDocument();
        expect(screen.getAllByText('Unknown')).toHaveLength(2);
        expect(screen.queryByText('0.999877')).not.toBeInTheDocument();
        expect(
            screen.getByText('Stale report — refresh required'),
        ).toBeInTheDocument();
    });
    it('preserves precise USD and credit strings and the idempotency key across explicit retries', async () => {
        const body = {
            kind: 'payment' as const,
            source: 'manual' as const,
            idempotencyKey: id,
            occurredAt: at,
            reference: 'external-42',
            reason: 'Record received payment',
            ownerId: id,
            amountUsd: '0.000123',
            feeUsd: '0.000001',
            credits: '0.125',
            originalCurrency: null,
            originalAmount: null,
        };
        const fetcher = vi
            .fn<typeof fetch>()
            .mockRejectedValueOnce(new TypeError('Network failure'))
            .mockResolvedValueOnce(
                response({
                    id,
                    createdAt: at,
                    createdBy: id,
                    grantId: id,
                    data: body,
                }),
            );
        vi.stubGlobal('fetch', fetcher);
        await expect(adminApi.recordAccounting(body)).rejects.toThrow();
        expect(fetcher).toHaveBeenCalledTimes(1);
        await adminApi.recordAccounting(body);
        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(fetcher.mock.calls[0]?.[1]?.body).toBe(
            fetcher.mock.calls[1]?.[1]?.body,
        );
        expect(
            JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)),
        ).toMatchObject({
            amountUsd: '0.000123',
            credits: '0.125',
            idempotencyKey: id,
        });
    });
    it('never automatically replays a policy mutation after authentication failure', async () => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
            response(
                {
                    error: {
                        code: 'recent_authentication_required',
                        correlationId: id,
                        message: 'Sign in again.',
                    },
                },
                401,
            ),
        );
        vi.stubGlobal('fetch', fetcher);
        await expect(
            adminApi.publishCapabilityPolicy({
                capability: 'portrait-interview',
                expectedVersion: 2,
                funding: 'operator',
                reason: 'Keep interviews free',
            }),
        ).rejects.toThrow();
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it('rejects invalid manual USD and report periods before a request', () => {
        const fetcher = vi.fn<typeof fetch>();
        vi.stubGlobal('fetch', fetcher);
        expect(() =>
            adminApi.recordAccounting({
                kind: 'provider_deposit',
                source: 'manual',
                idempotencyKey: id,
                occurredAt: at,
                reference: 'deposit',
                reason: 'Record deposit',
                providerId: 'provider',
                amountUsd: '1e3',
            }),
        ).toThrow();
        expect(() => adminApi.accountingReport({ from: at, to: at })).toThrow();
        expect(fetcher).not.toHaveBeenCalled();
    });
});
