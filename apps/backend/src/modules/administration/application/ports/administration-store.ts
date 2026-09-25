import type {
    AdminAuditAction,
    AdminAuditEvent,
    AdminAuditEventsQuery,
    AdminAiCreditAdjustmentRequest,
    AdminAiCreditPolicyMutationRequest,
    AdminAiCreditsQuery,
    AdminAiCreditsResponse,
    AdminAiSettingsMutationRequest,
    AdminAiSettingsResponse,
    AdminDashboardResponse,
    AdminRole,
    AdminUserDetail,
    AdminUsersQuery,
    AdminUsersResponse,
    AdminUserStatus,
} from '@languon/contracts';

export interface ActiveAdminMembership {
    grantedAt: Date;
    id: string;
    role: AdminRole;
    userId: string;
}

export interface AdminAuditWrite {
    action: AdminAuditAction;
    actorUserId: string;
    afterStatus?: AdminUserStatus | null;
    afterVersion?: number | null;
    beforeStatus?: AdminUserStatus | null;
    beforeVersion?: number | null;
    correlationId: string;
    expiresAt: Date;
    id: string;
    metadata?: Record<string, unknown>;
    occurredAt: Date;
    outcome: 'rejected' | 'success';
    reason?: string | null;
    targetUserId?: string | null;
}

export interface AdminUserMutationInput {
    actorSessionId: string;
    actorUserId: string;
    audit: Pick<
        AdminAuditWrite,
        'correlationId' | 'expiresAt' | 'id' | 'occurredAt'
    >;
    expectedVersion: number;
    reason: string;
    targetUserId: string;
}

export interface AdminAiSettingsMutationInput extends AdminAiSettingsMutationRequest {
    actorSessionId: string;
    actorUserId: string;
    audit: Pick<
        AdminAuditWrite,
        'correlationId' | 'expiresAt' | 'id' | 'occurredAt'
    >;
    revisionId: string;
}

interface AdminAiCreditMutationBase {
    actorSessionId: string;
    actorUserId: string;
    audit: Pick<
        AdminAuditWrite,
        'correlationId' | 'expiresAt' | 'id' | 'occurredAt'
    >;
    targetUserId: string;
}

export type AdminAiCreditPolicyMutationInput = AdminAiCreditMutationBase &
    AdminAiCreditPolicyMutationRequest;
export type AdminAiCreditAdjustmentMutationInput = AdminAiCreditMutationBase &
    AdminAiCreditAdjustmentRequest;

export type AdminAiCreditMutationRejection =
    | 'account_conflict'
    | 'adjustment_exceeds_available'
    | 'invalid_request'
    | 'recent_authentication_required'
    | 'target_unavailable'
    | 'admin_access_denied';

export type AdminAiCreditMutationResult =
    | { ok: true; response: AdminAiCreditsResponse }
    | { ok: false; rejection: AdminAiCreditMutationRejection };

export interface AdministrationStore {
    aiCredits(
        userId: string,
        query: AdminAiCreditsQuery,
        at: Date,
    ): Promise<AdminAiCreditsResponse>;
    adjustAiCredits(
        input: AdminAiCreditAdjustmentMutationInput,
    ): Promise<AdminAiCreditMutationResult>;
    aiSettings(): Promise<AdminAiSettingsResponse>;
    cancelUserDeletion(input: AdminUserMutationInput): Promise<AdminUserDetail>;
    dashboard(): Promise<AdminDashboardResponse>;
    disableUser(input: AdminUserMutationInput): Promise<AdminUserDetail>;
    findActiveMembership(userId: string): Promise<ActiveAdminMembership | null>;
    findUser(userId: string): Promise<AdminUserDetail | null>;
    listAuditEvents(input: AdminAuditEventsQuery): Promise<{
        data: AdminAuditEvent[];
        page: number;
        pageSize: number;
        total: number;
    }>;
    listUsers(input: AdminUsersQuery): Promise<AdminUsersResponse>;
    recordAudit(input: AdminAuditWrite): Promise<void>;
    restoreUser(input: AdminUserMutationInput): Promise<AdminUserDetail>;
    updateAiCreditPolicy(
        input: AdminAiCreditPolicyMutationInput,
    ): Promise<AdminAiCreditMutationResult>;
    updateAiSettings(
        input: AdminAiSettingsMutationInput,
    ): Promise<AdminAiSettingsResponse>;
}
