import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiCreditsPanel } from '../src/pages/users/ui/ai-credits-panel/ai-credits-panel';
import { accessTokenStore } from '../src/shared/auth/access-token-store';
import { adminI18nProvider } from '../src/shared/i18n/admin-i18n-provider';

const logout = vi.fn();

vi.mock('@refinedev/core', () => ({
    useLogout: () => ({ mutate: logout }),
    useTranslate: () => adminI18nProvider.translate,
}));

beforeAll(() => {
    vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
            addEventListener: vi.fn(),
            matches: false,
            removeEventListener: vi.fn(),
        }),
    );
});

beforeEach(() => {
    cleanup();
    accessTokenStore.clear();
    accessTokenStore.set('admin-access-token');
    logout.mockClear();
    vi.unstubAllGlobals();
    vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
            addEventListener: vi.fn(),
            matches: false,
            removeEventListener: vi.fn(),
        }),
    );
});

describe('AI credits panel', () => {
    it('shows inactive enforcement and the exhausted limited state', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                jsonResponse(
                    creditsResponse({
                        availableCredits: 0,
                        enforcementEnabled: false,
                    }),
                ),
            ),
        );

        render(<AiCreditsPanel mutable userId={userId} />);

        expect(await screen.findByText('Limited')).toBeInTheDocument();
        expect(
            screen.getByText(/Credit enforcement is inactive/),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/has no available credits/),
        ).toBeInTheDocument();
        expect(screen.getByText('2,500')).toBeInTheDocument();
        expect(screen.getByText('No credit activity yet.')).toBeInTheDocument();
    });

    it('submits a removal with the latest management version and no expiry', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse(creditsResponse()))
            .mockResolvedValueOnce(jsonResponse(creditsResponse()));
        vi.stubGlobal('fetch', fetchMock);
        const user = userEvent.setup();

        render(<AiCreditsPanel mutable userId={userId} />);
        await screen.findByText('Limited');
        await user.click(
            screen.getByRole('button', { name: 'Adjust credits' }),
        );
        await user.click(screen.getByRole('radio', { name: 'Remove credits' }));
        const amount = screen.getByRole('spinbutton', { name: 'Credits' });
        await user.clear(amount);
        await user.type(amount, '250');
        await user.type(
            screen.getByRole('textbox', { name: 'Reason' }),
            'Correct duplicate support grant',
        );
        await user.click(
            screen.getByRole('button', { name: 'Apply adjustment' }),
        );

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
        expect(request.method).toBe('POST');
        expect(JSON.parse(String(request.body))).toEqual({
            amountCredits: -250,
            expectedVersion: 3,
            expiresAt: null,
            reason: 'Correct duplicate support grant',
        });
    });

    it('keeps history readable but disables mutations for an ineligible target', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(jsonResponse(creditsResponse())),
        );

        render(<AiCreditsPanel mutable={false} userId={userId} />);

        expect(await screen.findByText('Limited')).toBeInTheDocument();
        expect(
            screen.getByText(/Credit changes are unavailable/),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Change policy' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Adjust credits' }),
        ).toBeDisabled();
    });

    it('clears wallet state and mutation controls when the target user changes', async () => {
        const secondUserId = '0198c600-52bb-7e53-8ac3-3102668e32ac';
        let resolveSecond!: (response: Response) => void;
        const secondResponse = new Promise<Response>((resolve) => {
            resolveSecond = resolve;
        });
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse(creditsResponse()))
            .mockReturnValueOnce(secondResponse);
        vi.stubGlobal('fetch', fetchMock);
        const view = render(<AiCreditsPanel mutable userId={userId} />);
        expect(await screen.findByText('2,500')).toBeInTheDocument();

        view.rerender(<AiCreditsPanel mutable userId={secondUserId} />);
        await waitFor(() =>
            expect(screen.queryByText('2,500')).not.toBeInTheDocument(),
        );
        expect(
            screen.queryByRole('button', { name: 'Adjust credits' }),
        ).not.toBeInTheDocument();

        resolveSecond(
            jsonResponse(
                creditsResponse({
                    availableCredits: 900,
                    lifetimeConsumedCredits: 100,
                    userId: secondUserId,
                }),
            ),
        );
        expect(await screen.findByText('900')).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});

const userId = '0198c600-52bb-7e53-8ac3-3102668e32ab';

function creditsResponse(
    accountOverrides: Partial<ReturnType<typeof creditAccount>> = {},
) {
    return {
        account: { ...creditAccount(), ...accountOverrides },
        history: [],
        page: 1,
        pageSize: 10,
        total: 0,
    };
}

function creditAccount() {
    return {
        availableCredits: 2_000,
        configuredMode: 'limited' as const,
        effectiveMode: 'limited' as const,
        enforcementEnabled: true,
        lifetimeConsumedCredits: 2_500,
        managementVersion: 3,
        nextExpirationAt: null,
        reservedCredits: 250,
        unlimitedUntil: null,
        userId,
    };
}

function jsonResponse(body: unknown) {
    return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
    });
}
