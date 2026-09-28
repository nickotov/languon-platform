import type { AuthenticationSuccessResponse } from '@languon/contracts';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DictionaryApiError } from '@/fsd/entities/dictionary';
import { useSessionStore } from '@/fsd/entities/session';
import { AuthProvider, useAuth } from '@/fsd/features/auth';
import { authApi } from '@/fsd/shared/api/auth-api';

import { render } from './render';

const expiredSession = authenticationResponse('expired-access-token');
const refreshedSession = authenticationResponse('refreshed-access-token');

function authenticationResponse(
    accessToken: string,
): AuthenticationSuccessResponse {
    return {
        accessToken,
        accessTokenExpiresAt: '2026-09-28T12:15:00.000Z',
        session: {
            authenticatedAt: '2026-09-28T12:00:00.000Z',
            createdAt: '2026-09-28T12:00:00.000Z',
            expiresAt: '2026-10-12T12:00:00.000Z',
            id: '10000000-0000-4000-8000-000000000002',
            recentAuthenticationExpiresAt: '2026-09-28T12:05:00.000Z',
        },
        status: 'authenticated',
        tokenType: 'Bearer',
        user: {
            createdAt: '2026-09-28T11:00:00.000Z',
            emailVerified: true,
            id: '10000000-0000-4000-8000-000000000001',
            primaryEmail: 'refresh-test@example.test',
            status: 'active',
        },
    };
}

function RequestHarness({
    operation,
}: {
    operation(accessToken: string): Promise<string>;
}) {
    const { requestWithSession } = useAuth();
    const [result, setResult] = useState('idle');

    async function runRequest() {
        try {
            setResult(await requestWithSession(operation));
        } catch {
            setResult('failed');
        }
    }

    return (
        <>
            <button onClick={runRequest} type='button'>
                Run protected request
            </button>
            <output>{result}</output>
        </>
    );
}

describe('web access-token refresh', () => {
    beforeEach(() => {
        useSessionStore.getState().signOut();
        vi.spyOn(authApi, 'capabilities').mockResolvedValue({
            email: { passwordRecovery: true, signUp: true, verification: true },
            passkeys: { authentication: false, registration: false },
            passwordAuthentication: true,
        });
        vi.spyOn(authApi, 'refresh').mockRejectedValue(
            new Error('bootstrap has no session'),
        );
    });

    it('refreshes and retries a dictionary request rejected as authentication required', async () => {
        const operation = vi
            .fn<(accessToken: string) => Promise<string>>()
            .mockRejectedValueOnce(
                new DictionaryApiError(403, {
                    code: 'authentication_required',
                    correlationId: 'expired-access-token',
                    message: 'Authentication is required.',
                }),
            )
            .mockResolvedValueOnce('request completed');
        const user = userEvent.setup();

        render(
            <AuthProvider>
                <RequestHarness operation={operation} />
            </AuthProvider>,
        );
        await waitFor(() => expect(authApi.refresh).toHaveBeenCalledTimes(1));
        useSessionStore.getState().authenticate(expiredSession);
        vi.mocked(authApi.refresh).mockResolvedValueOnce(refreshedSession);

        await user.click(
            screen.getByRole('button', { name: 'Run protected request' }),
        );

        await expect(
            screen.findByText('request completed'),
        ).resolves.toBeVisible();
        expect(operation).toHaveBeenNthCalledWith(1, 'expired-access-token');
        expect(operation).toHaveBeenNthCalledWith(2, 'refreshed-access-token');
        expect(authApi.refresh).toHaveBeenCalledTimes(2);
    });

    it('does not refresh a genuine forbidden dictionary response', async () => {
        const operation = vi.fn(async () => {
            throw new DictionaryApiError(403, {
                code: 'recent_authentication_required',
                correlationId: 'recent-auth-required',
                message: 'Recent authentication is required.',
            });
        });
        const user = userEvent.setup();

        render(
            <AuthProvider>
                <RequestHarness operation={operation} />
            </AuthProvider>,
        );
        await waitFor(() => expect(authApi.refresh).toHaveBeenCalledTimes(1));
        useSessionStore.getState().authenticate(expiredSession);

        await user.click(
            screen.getByRole('button', { name: 'Run protected request' }),
        );

        await expect(screen.findByText('failed')).resolves.toBeVisible();
        expect(operation).toHaveBeenCalledTimes(1);
        expect(authApi.refresh).toHaveBeenCalledTimes(1);
    });
});
