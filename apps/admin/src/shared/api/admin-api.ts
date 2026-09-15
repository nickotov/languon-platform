import { BrowserApiError, createBrowserApiClient } from '@languon/browser-auth';
import {
    AdminAuditEventsResponseSchema,
    AdminDashboardResponseSchema,
    AdminErrorResponseSchema,
    AdminMeResponseSchema,
    AdminUserResponseSchema,
    AdminUsersResponseSchema,
    AdminUserStatusMutationRequestSchema,
    AdminUserStatusMutationResponseSchema,
    LogoutRequestSchema,
    LogoutResponseSchema,
    PasskeyAuthenticationOptionsRequestSchema,
    PasskeyAuthenticationOptionsResponseSchema,
    PasskeyAuthenticationVerifyRequestSchema,
    PasskeyAuthenticationVerifyResponseSchema,
    PasswordLoginRequestSchema,
    PasswordLoginResponseSchema,
    RefreshRequestSchema,
    type AdminAuditEventsQuery,
    type AdminErrorResponse,
    type AdminUserStatusMutationRequest,
    type AdminUsersQuery,
    type PasskeyAuthenticationVerifyRequest,
    type PasswordLoginRequest,
} from '@languon/contracts';

import { accessTokenStore } from '../auth/access-token-store';
import { adminRefreshCoordinator } from '../auth/admin-refresh-coordinator';

export type AdminApiErrorDetail = AdminErrorResponse['error'];

export class AdminApiError extends BrowserApiError<AdminApiErrorDetail> {
    public override readonly name = 'AdminApiError';
    public readonly statusCode = this.status;
}

export function resolveAdminApiUrl(
    _production: boolean,
    configuredUrl: string | undefined,
) {
    return (configuredUrl ?? '/api').replace(/\/$/, '');
}

const apiUrl = resolveAdminApiUrl(
    import.meta.env.PROD,
    import.meta.env.VITE_API_URL,
);
export function resolveAdminAccessTokenHeader(production: boolean) {
    return production ? 'X-Languon-Admin-Authorization' : 'Authorization';
}
const client = createBrowserApiClient<AdminApiErrorDetail>({
    accessTokenHeader: resolveAdminAccessTokenHeader(import.meta.env.PROD),
    baseUrl: apiUrl,
    createError: (status, detail) => new AdminApiError(status, detail),
    errorResponseSchema: AdminErrorResponseSchema,
    invalidResponseMessage:
        'The administration service returned an invalid response.',
    networkErrorMessage:
        'The administration service is unavailable. Check your connection and retry.',
});

async function authorized<TResponse>(
    path: string,
    responseSchema: { parse(value: unknown): TResponse },
    signal?: AbortSignal,
) {
    let accessToken =
        accessTokenStore.get() ?? (await refreshAccessToken(signal));
    try {
        return await client.request(path, {
            accessToken,
            responseSchema,
            signal,
        });
    } catch (error) {
        if (!(error instanceof AdminApiError) || error.status !== 401) {
            throw error;
        }
        accessTokenStore.clear();
        accessToken = await refreshAccessToken(signal);
        return client.request(path, {
            accessToken,
            responseSchema,
            signal,
        });
    }
}

async function refreshAccessToken(signal?: AbortSignal): Promise<string> {
    return (await refreshSession(signal)).accessToken;
}

async function refreshSession(signal?: AbortSignal) {
    let refreshError: unknown;
    const session = await adminRefreshCoordinator.refresh(() =>
        client
            .request('/admin/auth/refresh', {
                body: {},
                bodySchema: RefreshRequestSchema,
                method: 'POST',
                responseSchema: PasskeyAuthenticationVerifyResponseSchema,
                signal,
            })
            .catch((error: unknown) => {
                refreshError = error;
                throw error;
            }),
    );
    if (refreshError) throw refreshError;
    if (!session) {
        throw new AdminApiError(401, {
            code: 'authentication_required',
            correlationId: 'refresh-unavailable',
            message: 'Authentication is required.',
        });
    }
    accessTokenStore.set(session.accessToken);
    return session;
}

export const adminApi = {
    passwordLogin: (body: PasswordLoginRequest, signal?: AbortSignal) =>
        client.request('/admin/auth/login/password', {
            body,
            bodySchema: PasswordLoginRequestSchema,
            method: 'POST',
            responseSchema: PasswordLoginResponseSchema,
            signal,
        }),
    passkeyOptions: (signal?: AbortSignal) =>
        client.request('/admin/auth/passkeys/authentication/options', {
            body: {},
            bodySchema: PasskeyAuthenticationOptionsRequestSchema,
            method: 'POST',
            responseSchema: PasskeyAuthenticationOptionsResponseSchema,
            signal,
        }),
    verifyPasskey: (
        body: PasskeyAuthenticationVerifyRequest,
        signal?: AbortSignal,
    ) =>
        client.request('/admin/auth/passkeys/authentication/verify', {
            body,
            bodySchema: PasskeyAuthenticationVerifyRequestSchema,
            method: 'POST',
            responseSchema: PasskeyAuthenticationVerifyResponseSchema,
            signal,
        }),
    refresh: (signal?: AbortSignal) => refreshSession(signal),
    logout: (signal?: AbortSignal) =>
        client.request('/admin/auth/logout', {
            body: {},
            bodySchema: LogoutRequestSchema,
            method: 'POST',
            responseSchema: LogoutResponseSchema,
            signal,
        }),
    me: (signal?: AbortSignal) =>
        authorized('/admin/me', AdminMeResponseSchema, signal),
    dashboard: (signal?: AbortSignal) =>
        authorized('/admin/dashboard', AdminDashboardResponseSchema, signal),
    users: (query: AdminUsersQuery, signal?: AbortSignal) =>
        authorized(
            `/admin/users?${queryString(query)}`,
            AdminUsersResponseSchema,
            signal,
        ),
    user: (userId: string, signal?: AbortSignal) =>
        authorized(
            `/admin/users/${encodeURIComponent(userId)}`,
            AdminUserResponseSchema,
            signal,
        ),
    mutateUser: (
        userId: string,
        operation: 'disable' | 'restore' | 'deletion/cancel',
        body: AdminUserStatusMutationRequest,
        signal?: AbortSignal,
    ) =>
        authorizedMutation(
            `/admin/users/${encodeURIComponent(userId)}/${operation}`,
            body,
            signal,
        ),
    auditEvents: (query: AdminAuditEventsQuery, signal?: AbortSignal) =>
        authorized(
            `/admin/audit-events?${queryString(query)}`,
            AdminAuditEventsResponseSchema,
            signal,
        ),
    apiUrl,
};

async function authorizedMutation(
    path: string,
    body: AdminUserStatusMutationRequest,
    signal?: AbortSignal,
) {
    let accessToken =
        accessTokenStore.get() ?? (await refreshAccessToken(signal));
    const request = () =>
        client.request(path, {
            accessToken,
            body,
            bodySchema: AdminUserStatusMutationRequestSchema,
            method: 'POST',
            responseSchema: AdminUserStatusMutationResponseSchema,
            signal,
        });
    try {
        return await request();
    } catch (error) {
        if (!(error instanceof AdminApiError) || error.status !== 401) {
            throw error;
        }
        accessTokenStore.clear();
        accessToken = await refreshAccessToken(signal);
        return request();
    }
}

function queryString(values: object): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
        if (value !== undefined && value !== '') query.set(key, String(value));
    }
    return query.toString();
}
