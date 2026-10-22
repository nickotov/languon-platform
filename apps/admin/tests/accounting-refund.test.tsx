import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountingRecordDialog } from '../src/pages/accounting/ui/accounting-record-dialog/accounting-record-dialog';
import { adminI18nProvider } from '../src/shared/i18n/admin-i18n-provider';
import { accessTokenStore } from '../src/shared/auth/access-token-store';
vi.mock('@refinedev/core', () => ({
    useTranslate: () => adminI18nProvider.translate,
}));
const paymentId = '00000000-0000-4000-8000-000000000042';
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
describe('cash-only refunds after account removal', () => {
    it('shows unavailable credit balances, prevents revocation and confirms cash refund without an account ID', async () => {
        const user = userEvent.setup();
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
            new Response(
                JSON.stringify({
                    paymentId,
                    ownerId: null,
                    grantId: null,
                    paidUsd: '10',
                    refundedUsd: '2',
                    availableCredits: null,
                    reservedCredits: null,
                    consumedCredits: null,
                    revokedCredits: null,
                }),
                { headers: { 'Content-Type': 'application/json' } },
            ),
        );
        vi.stubGlobal('fetch', fetcher);
        const submit = vi.fn().mockResolvedValue(undefined);
        render(
            <AccountingRecordDialog
                records={[]}
                pending={false}
                onSubmit={submit}
                onClose={vi.fn()}
            />,
        );
        await user.click(screen.getByRole('combobox', { name: 'Record type' }));
        await user.click(screen.getByText('External refund'));
        fireEvent.change(screen.getByLabelText('Original payment record ID'), {
            target: { value: paymentId },
        });
        await waitFor(() =>
            expect(
                screen.getAllByText('Unavailable after account removal'),
            ).toHaveLength(4),
        );
        expect(screen.getByText('10')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();
        expect(
            screen.getByLabelText('Available credits to revoke'),
        ).toHaveValue('0');
        expect(
            screen.getByLabelText('Available credits to revoke'),
        ).toBeDisabled();
        expect(
            screen.queryByLabelText('Customer user ID'),
        ).not.toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('External reference'), {
            target: { value: 'external-refund-42' },
        });
        fireEvent.change(
            screen.getByLabelText('Amount (USD, up to 6 decimals)'),
            { target: { value: '1.25' } },
        );
        fireEvent.change(screen.getByLabelText('Reason for change'), {
            target: { value: 'Record external refund after account removal' },
        });
        fireEvent.click(
            screen.getByRole('button', { name: 'Save manual record' }),
        );
        await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
        expect(submit.mock.calls[0]?.[0]).toMatchObject({
            kind: 'refund',
            paymentId,
            amountUsd: '1.25',
            revokeAvailableCredits: '0',
        });
        expect(submit.mock.calls[0]?.[0]).not.toHaveProperty('ownerId');
    });
});
