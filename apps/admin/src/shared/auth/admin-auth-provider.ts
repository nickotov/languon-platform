import { getPasskey } from '@languon/browser-auth';
import type { AdminActor } from '@languon/contracts';
import type { AuthProvider } from '@refinedev/core';

import { AdminApiError, adminApi } from '../api/admin-api';
import { accessTokenStore } from './access-token-store';
import { adminRefreshCoordinator } from './admin-refresh-coordinator';

let actor: AdminActor | null = null;

export const adminAuthProvider: AuthProvider = {
    login: async (params: {
        email?: string;
        password?: string;
        providerName?: 'passkey';
    }) => {
        try {
            const response = await adminRefreshCoordinator.runExclusive(() =>
                params.providerName === 'passkey'
                    ? passkeyLogin()
                    : adminApi.passwordLogin({
                          email: params.email ?? '',
                          password: params.password ?? '',
                      }),
            );
            if (response.status !== 'authenticated') {
                return {
                    error: new Error('A verified account is required.'),
                    success: false,
                };
            }
            accessTokenStore.set(response.accessToken);
            adminRefreshCoordinator.publishAuthenticated(response);
            actor = (await adminApi.me()).actor;
            return { redirectTo: '/', success: true };
        } catch (error) {
            accessTokenStore.clear();
            return {
                error: normalizeError(error),
                success: false,
            };
        }
    },
    logout: async () => {
        try {
            await adminRefreshCoordinator.runExclusive(() => adminApi.logout());
        } finally {
            actor = null;
            accessTokenStore.clear();
            adminRefreshCoordinator.publishSignedOut();
        }
        return { redirectTo: '/login', success: true };
    },
    check: async () => {
        try {
            actor = (await adminApi.me()).actor;
            return { authenticated: true };
        } catch (error) {
            if (
                accessTokenStore.get() &&
                error instanceof AdminApiError &&
                error.status === 0
            ) {
                return { authenticated: true, error };
            }
            actor = null;
            accessTokenStore.clear();
            adminRefreshCoordinator.publishSignedOut();
            return {
                authenticated: false,
                logout: true,
                redirectTo: '/login',
            };
        }
    },
    getIdentity: async () => actor,
    getPermissions: async () => actor?.role ?? null,
    onError: async (error: unknown) => {
        if (
            error instanceof AdminApiError &&
            (error.status === 401 ||
                error.detail.code === 'admin_access_denied')
        ) {
            actor = null;
            accessTokenStore.clear();
            adminRefreshCoordinator.publishSignedOut();
            return { logout: true, redirectTo: '/login' };
        }
        return {};
    },
};

async function passkeyLogin() {
    const challenge = await adminApi.passkeyOptions();
    const credential = await getPasskey(challenge.options);
    return adminApi.verifyPasskey({ credential, flowId: challenge.flowId });
}

function normalizeError(error: unknown): Error {
    if (error instanceof AdminApiError) return new Error(error.detail.message);
    if (error instanceof Error) return error;
    return new Error('Authentication failed. Please try again.');
}
