import {
    act,
    cleanup,
    fireEvent,
    renderHook,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionAllowanceQuote } from '@languon/contracts';
import { DictionaryApiError } from '@/fsd/entities/dictionary';
import {
    ActionConsentCancelledError,
    ActionConsentDialog,
    useActionConsent,
} from '@/fsd/entities/ai-action';
import {
    isUncertain,
    toApiError,
} from '@/fsd/features/sentence-training/lib/api-error';
import { render } from './render';

const offer = (id: string, maximumCredits = '0.125'): ActionAllowanceQuote => ({
    id,
    maximumCredits,
    approximateOutputTokens: 12,
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
});
const first = offer('00000000-0000-4000-8000-000000000001');
const second = offer('00000000-0000-4000-8000-000000000002', '0.025');
function quoteError(quote: ActionAllowanceQuote) {
    return new DictionaryApiError(409, {
        code: 'action_confirmation_required',
        correlationId: 'synthetic-quote',
        message: 'Review the smaller allowance.',
        details: { quote },
    });
}
afterEach(cleanup);

describe('paid action consent', () => {
    it('requires a fresh explicit Send for a reduced second quote and keeps frozen action identity', async () => {
        const { result } = renderHook(useActionConsent);
        const body = Object.freeze({
            operationId: 'stable-operation',
            text: 'unsent learner draft',
            expectedVersion: 3,
        });
        const sent: object[] = [];
        const request = vi.fn(async (confirmedQuoteId?: string) => {
            sent.push({
                ...body,
                ...(confirmedQuoteId ? { confirmedQuoteId } : {}),
            });
            if (!confirmedQuoteId) throw quoteError(first);
            if (confirmedQuoteId === first.id) throw quoteError(second);
            return { accepted: true };
        });
        let outcome!: Promise<{ accepted: boolean }>;
        act(() => {
            outcome = result.current.run(request);
        });
        await waitFor(() => expect(result.current.quote?.id).toBe(first.id));
        expect(request).toHaveBeenCalledTimes(1);
        act(() => {
            result.current.confirm();
            result.current.confirm();
        });
        await waitFor(() => expect(result.current.quote?.id).toBe(second.id));
        expect(request).toHaveBeenCalledTimes(2);
        act(() => result.current.confirm());
        await expect(outcome).resolves.toEqual({ accepted: true });
        expect(sent).toEqual([
            body,
            { ...body, confirmedQuoteId: first.id },
            { ...body, confirmedQuoteId: second.id },
        ]);
    });
    it('keeps cancelled confirmation out of automatic sentence network retries', async () => {
        const { result } = renderHook(useActionConsent);
        const request = vi.fn(async () => {
            throw quoteError(first);
        });
        let outcome!: Promise<unknown>;
        act(() => {
            outcome = result.current
                .run(request)
                .catch((error: unknown) => error);
        });
        await waitFor(() => expect(result.current.quote).not.toBeNull());
        act(() => result.current.cancel());
        const cancelled = await outcome;
        expect(cancelled).toBeInstanceOf(ActionConsentCancelledError);
        expect(isUncertain(toApiError(cancelled))).toBe(false);
        expect(request).toHaveBeenCalledTimes(1);
    });
    it('shows tiny nonzero maxima, exact details, Send and a Top up option preserving this page', () => {
        render(
            <ActionConsentDialog
                quote={offer(first.id, '0.001')}
                onSend={vi.fn()}
                onClose={vi.fn()}
            />,
        );
        expect(screen.getByText('Maximum credits: <0.01')).toBeVisible();
        fireEvent.click(screen.getByText('Exact value'));
        expect(screen.getByText('0.001')).toBeVisible();
        expect(screen.getByRole('link', { name: 'Top up' })).toHaveAttribute(
            'target',
            '_blank',
        );
        expect(
            screen.getByRole('button', { name: 'Send', exact: true }),
        ).toBeEnabled();
    });
    it('does not send an expired offer automatically', () => {
        render(
            <ActionConsentDialog
                quote={{
                    ...first,
                    expiresAt: new Date(Date.now() - 1).toISOString(),
                }}
                onSend={vi.fn()}
                onClose={vi.fn()}
            />,
        );
        expect(
            screen.getByRole('button', { name: 'Send', exact: true }),
        ).toBeDisabled();
    });
});
