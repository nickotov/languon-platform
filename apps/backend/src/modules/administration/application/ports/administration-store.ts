import type {
    AdminAuditAction,
    AdminAuditEvent,
    AdminAuditEventsQuery,
    AdminDashboardResponse,
    AdminRole,
    AdminUserDetail,
    AdminUsersQuery,
    AdminUsersResponse,
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
    afterStatus?: 'active' | 'disabled' | 'pending' | null;
    afterVersion?: number | null;
    beforeStatus?: 'active' | 'disabled' | 'pending' | null;
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

export interface AdministrationStore {
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
}
