import {
    BrowserApiError,
    createBrowserApiClient,
    isAuthenticationRequiredError,
} from '@languon/browser-auth';
import {
    ProviderPricesResponseSchema,
    ProviderPriceSchema,
    ProviderPricePublishRequestSchema,
    AiAccountingSettingsSchema,
    AiAccountingSettingsPublishSchema,
    AccountingRefundContextSchema,
    AccountingRecordRequestSchema,
    AccountingRecordSchema,
    AccountingReportQuerySchema,
    AccountingReportSchema,
    CapabilityPolicySchema,
    CapabilityPolicyPublishSchema,
    AdminSpeechListQuerySchema,
    AdminSpeechListResponseSchema,
    AdminSpeechDeleteRequestSchema,
    AdminSpeechDeleteResponseSchema,
    ModelPricesResponseSchema,
    ModelPricePublishRequestSchema,
    ModelPriceSchema,
    AdminAuditEventsResponseSchema,
    AdminSentenceDictionariesQuerySchema,
    AdminSentenceDictionariesResponseSchema,
    AdminSentenceLibraryQuerySchema,
    AdminSentenceLibraryListResponseSchema,
    AdminSentenceLibraryDetailSchema,
    AdminSentenceLibrarySnapshotRequestSchema,
    AdminSentenceLibrarySnapshotResponseSchema,
    AdminSentenceLibraryMutationRequestSchema,
    AdminSentenceLibraryMutationResponseSchema,
    type AdminSentenceDictionariesQuery,
    type AdminSentenceLibraryQuery,
    type AdminSentenceLibrarySnapshotRequest,
    type AdminSentenceLibraryMutationRequest,
    AdminAiCreditAdjustmentRequestSchema,
    AdminAiCreditPolicyMutationRequestSchema,
    AdminAiCreditsResponseSchema,
    AdminAiSettingsMutationRequestSchema,
    AdminAiSettingsMutationResponseSchema,
    AdminAiSettingsResponseSchema,
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
    type AdminAiCreditAdjustmentRequest,
    type AdminAiCreditPolicyMutationRequest,
    type AdminAiCreditsQuery,
    type AdminAiSettingsMutationRequest,
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
        accessTokenStore.getUsable() ?? (await refreshAccessToken(signal));
    try {
        return await client.request(path, {
            accessToken,
            responseSchema,
            signal,
        });
    } catch (error) {
        if (!isAuthenticationRequiredError(error)) throw error;
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
    accessTokenStore.set(session.accessToken, session.accessTokenExpiresAt);
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
    aiCredits: (
        userId: string,
        query: AdminAiCreditsQuery,
        signal?: AbortSignal,
    ) =>
        authorized(
            `/admin/users/${encodeURIComponent(userId)}/ai-credits?${queryString(query)}`,
            AdminAiCreditsResponseSchema,
            signal,
        ),
    updateAiCreditPolicy: (
        userId: string,
        body: AdminAiCreditPolicyMutationRequest,
        signal?: AbortSignal,
    ) =>
        authorizedRequest(
            `/admin/users/${encodeURIComponent(userId)}/ai-credits/policy`,
            body,
            AdminAiCreditPolicyMutationRequestSchema,
            AdminAiCreditsResponseSchema,
            'PATCH',
            signal,
        ),
    adjustAiCredits: (
        userId: string,
        body: AdminAiCreditAdjustmentRequest,
        signal?: AbortSignal,
    ) =>
        authorizedRequest(
            `/admin/users/${encodeURIComponent(userId)}/ai-credits/adjustments`,
            body,
            AdminAiCreditAdjustmentRequestSchema,
            AdminAiCreditsResponseSchema,
            'POST',
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
    aiSettings: (signal?: AbortSignal) =>
        authorized('/admin/ai-settings', AdminAiSettingsResponseSchema, signal),
    mutateAiSettings: (
        body: AdminAiSettingsMutationRequest,
        signal?: AbortSignal,
    ) =>
        authorizedRequest(
            '/admin/ai-settings',
            body,
            AdminAiSettingsMutationRequestSchema,
            AdminAiSettingsMutationResponseSchema,
            'PATCH',
            signal,
        ),
    sentenceDictionaries: (
        userId: string,
        query: AdminSentenceDictionariesQuery,
        signal?: AbortSignal,
    ) =>
        authorized(
            `/admin/users/${encodeURIComponent(userId)}/sentence-dictionaries?${queryString(AdminSentenceDictionariesQuerySchema.parse(query))}`,
            AdminSentenceDictionariesResponseSchema,
            signal,
        ),
    sentences: (
        userId: string,
        dictionaryId: string,
        query: AdminSentenceLibraryQuery,
        signal?: AbortSignal,
    ) =>
        authorized(
            `${sentencePath(userId, dictionaryId)}?${queryString(AdminSentenceLibraryQuerySchema.parse(query))}`,
            AdminSentenceLibraryListResponseSchema,
            signal,
        ),
    sentence: (
        userId: string,
        dictionaryId: string,
        exerciseId: string,
        signal?: AbortSignal,
    ) =>
        authorized(
            `${sentencePath(userId, dictionaryId)}/${encodeURIComponent(exerciseId)}`,
            AdminSentenceLibraryDetailSchema,
            signal,
        ),
    snapshotSentences: (
        userId: string,
        dictionaryId: string,
        body: AdminSentenceLibrarySnapshotRequest,
        signal?: AbortSignal,
    ) =>
        authorizedRequest(
            `${sentencePath(userId, dictionaryId)}/snapshots`,
            body,
            AdminSentenceLibrarySnapshotRequestSchema,
            AdminSentenceLibrarySnapshotResponseSchema,
            'POST',
            signal,
        ),
    mutateSentences: (
        userId: string,
        dictionaryId: string,
        body: AdminSentenceLibraryMutationRequest,
        signal?: AbortSignal,
    ) =>
        authorizedRequest(
            `${sentencePath(userId, dictionaryId)}/mutations`,
            body,
            AdminSentenceLibraryMutationRequestSchema,
            AdminSentenceLibraryMutationResponseSchema,
            'POST',
            signal,
        ),
    speechRecordings: (
        query: (typeof AdminSpeechListQuerySchema)['_input'],
        signal?: AbortSignal,
    ) =>
        authorized(
            `/admin/speech/recordings?${queryString(AdminSpeechListQuerySchema.parse(query))}`,
            AdminSpeechListResponseSchema,
            signal,
        ),
    deleteSpeechRecordings: (
        body: (typeof AdminSpeechDeleteRequestSchema)['_input'],
        signal?: AbortSignal,
    ) =>
        authorizedSingleRequest(
            '/admin/speech/recordings/delete',
            AdminSpeechDeleteRequestSchema.parse(body),
            AdminSpeechDeleteRequestSchema,
            AdminSpeechDeleteResponseSchema,
            signal,
        ),
    speechRecordingContent: (id: string, signal?: AbortSignal) =>
        authorizedAudio(
            `/admin/speech/recordings/${encodeURIComponent(id)}/content`,
            signal,
        ),
    modelPrices: (signal?: AbortSignal) =>
        authorized('/admin/ai/model-prices', ModelPricesResponseSchema, signal),
    publishModelPrice: (
        body: (typeof ModelPricePublishRequestSchema)['_input'],
        signal?: AbortSignal,
    ) =>
        authorizedSingleRequest(
            '/admin/ai/model-prices',
            ModelPricePublishRequestSchema.parse(body),
            ModelPricePublishRequestSchema,
            ModelPriceSchema,
            signal,
        ),
    providerPrices: (signal?: AbortSignal) =>
        authorized(
            '/admin/ai/accounting/provider-prices',
            ProviderPricesResponseSchema,
            signal,
        ),
    publishProviderPrice: (
        body: (typeof ProviderPricePublishRequestSchema)['_input'],
        signal?: AbortSignal,
    ) =>
        authorizedSingleRequest(
            '/admin/ai/accounting/provider-prices',
            ProviderPricePublishRequestSchema.parse(body),
            ProviderPricePublishRequestSchema,
            ProviderPriceSchema,
            signal,
        ),
    accountingSettings: (signal?: AbortSignal) =>
        authorized(
            '/admin/ai/accounting-settings',
            AiAccountingSettingsSchema,
            signal,
        ),
    publishAccountingSettings: (
        body: (typeof AiAccountingSettingsPublishSchema)['_input'],
        signal?: AbortSignal,
    ) =>
        authorizedSingleRequest(
            '/admin/ai/accounting-settings',
            AiAccountingSettingsPublishSchema.parse(body),
            AiAccountingSettingsPublishSchema,
            AiAccountingSettingsSchema,
            signal,
            'PATCH',
        ),
    accountingReport: (
        query: (typeof AccountingReportQuerySchema)['_input'],
        signal?: AbortSignal,
    ) =>
        authorized(
            `/admin/ai/accounting/report?${queryString(AccountingReportQuerySchema.parse(query))}`,
            AccountingReportSchema,
            signal,
        ),
    accountingRefundContext: (paymentId: string, signal?: AbortSignal) =>
        authorized(
            `/admin/ai/accounting/records/${encodeURIComponent(paymentId)}/refund-context`,
            AccountingRefundContextSchema,
            signal,
        ),
    accountingRecords: (signal?: AbortSignal) =>
        authorized(
            '/admin/ai/accounting/records?limit=100',
            {
                parse: (value: unknown) => {
                    const records = (value as { records?: unknown } | null)
                        ?.records;
                    return {
                        records: AccountingRecordSchema.array().parse(records),
                    };
                },
            },
            signal,
        ),
    recordAccounting: (
        body: (typeof AccountingRecordRequestSchema)['_input'],
        signal?: AbortSignal,
    ) =>
        authorizedSingleRequest(
            '/admin/ai/accounting/records',
            AccountingRecordRequestSchema.parse(body),
            AccountingRecordRequestSchema,
            AccountingRecordSchema,
            signal,
        ),
    capabilityPolicies: (signal?: AbortSignal) =>
        authorized(
            '/admin/ai/capability-policies',
            {
                parse: (value: unknown) => {
                    const policies = (value as { policies?: unknown } | null)
                        ?.policies;
                    return {
                        policies:
                            CapabilityPolicySchema.array().parse(policies),
                    };
                },
            },
            signal,
        ),
    publishCapabilityPolicy: (
        body: (typeof CapabilityPolicyPublishSchema)['_input'],
        signal?: AbortSignal,
    ) =>
        authorizedSingleRequest(
            '/admin/ai/capability-policies',
            CapabilityPolicyPublishSchema.parse(body),
            CapabilityPolicyPublishSchema,
            CapabilityPolicySchema,
            signal,
        ),
    apiUrl,
};

function sentencePath(userId: string, dictionaryId: string) {
    return `/admin/users/${encodeURIComponent(userId)}/dictionaries/${encodeURIComponent(dictionaryId)}/sentences`;
}

async function authorizedMutation(
    path: string,
    body: AdminUserStatusMutationRequest,
    signal?: AbortSignal,
) {
    let accessToken =
        accessTokenStore.getUsable() ?? (await refreshAccessToken(signal));
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
        if (!isAuthenticationRequiredError(error)) throw error;
        accessTokenStore.clear();
        accessToken = await refreshAccessToken(signal);
        return request();
    }
}

async function authorizedRequest<TBody, TResponse>(
    path: string,
    body: TBody,
    bodySchema: { parse(value: unknown): TBody },
    responseSchema: { parse(value: unknown): TResponse },
    method: 'PATCH' | 'POST',
    signal?: AbortSignal,
) {
    let accessToken =
        accessTokenStore.getUsable() ?? (await refreshAccessToken(signal));
    const request = () =>
        client.request(path, {
            accessToken,
            body,
            bodySchema,
            method,
            responseSchema,
            signal,
        });
    try {
        return await request();
    } catch (error) {
        if (!isAuthenticationRequiredError(error)) throw error;
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

// Security-state changes must be reviewed again after reauthentication; never replay them.
async function authorizedSingleRequest<TBody, TResponse>(
    path: string,
    body: TBody,
    bodySchema: { parse(value: unknown): TBody },
    responseSchema: { parse(value: unknown): TResponse },
    signal?: AbortSignal,
    method: 'POST' | 'PATCH' = 'POST',
) {
    const accessToken =
        accessTokenStore.getUsable() ?? (await refreshAccessToken(signal));
    return client.request(path, {
        accessToken,
        body,
        bodySchema,
        method,
        responseSchema,
        signal,
    });
}

async function authorizedAudio(
    path: string,
    signal?: AbortSignal,
): Promise<Blob> {
    const accessToken =
        accessTokenStore.getUsable() ?? (await refreshAccessToken(signal));
    const response = await fetch(`${apiUrl}${path}`, {
        headers: {
            [resolveAdminAccessTokenHeader(import.meta.env.PROD)]:
                `Bearer ${accessToken}`,
        },
        credentials: 'include',
        ...(signal ? { signal } : {}),
        redirect: 'error',
        cache: 'no-store',
    });
    if (!response.ok) {
        const detail = AdminErrorResponseSchema.safeParse(
            await response.json().catch(() => null),
        );
        throw new AdminApiError(
            response.status,
            detail.success
                ? detail.data.error
                : {
                      code: 'admin_access_denied',
                      correlationId: 'audio-preview',
                      message:
                          'Audio preview is unavailable. Refresh the page or sign in again.',
                  },
        );
    }
    const blob = await response.blob();
    if (
        !blob.type.startsWith('audio/') ||
        blob.size > 5 * 1024 * 1024 ||
        blob.size === 0
    )
        throw new Error('The recording response is invalid.');
    return blob;
}
