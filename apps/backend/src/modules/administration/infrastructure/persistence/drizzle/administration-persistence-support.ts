import type { AdminAuditEvent, AdminUserDetail } from '@languon/contracts';
import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import {
    AiCreditIdempotencyConflictError,
    AiCreditInsufficientBalanceError,
    AiCreditInvalidAmountError,
    AiCreditManagementConflictError,
} from '../../../../ai-credits/domain/ai-credit';
import { RecentAuthenticationRequiredError } from '../../../../authentication/application/authentication-errors';
import type { AccountDeletionRecoveryJournal } from '../../../../users/application/ports/account-deletion-recovery-journal';
import {
    userEmailsTable,
    usersTable,
} from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    AdminAccessDeniedError,
    AdminAiCreditTargetUnavailableError,
} from '../../../application/administration-errors';
import type {
    AdminAiCreditMutationRejection,
    AdminAuditWrite,
} from '../../../application/ports/administration-store';
import { adminAuditEventsTable, adminMembershipsTable } from './schema';

export type AdministrationDatabase = PostgresJsDatabase<typeof databaseSchema>;

export type AdministrationTransaction = Parameters<
    Parameters<AdministrationDatabase['transaction']>[0]
>[0];

export type QueryDatabase = AdministrationDatabase | AdministrationTransaction;

export const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isDictionaryAiCredentialConfigured(
    providerId: 'deepseek' | 'kie',
) {
    const variable =
        providerId === 'deepseek'
            ? 'DICTIONARY_AI_DEEPSEEK_CREDENTIAL_CONFIGURED'
            : 'DICTIONARY_AI_KIE_CREDENTIAL_CONFIGURED';

    return process.env[variable] === 'true';
}

export function userSummarySelection() {
    return {
        createdAt: usersTable.createdAt,
        email: userEmailsTable.email,
        id: usersTable.id,
        isOwner: sql<boolean>`${adminMembershipsTable.id} is not null`,
        status: usersTable.status,
        updatedAt: usersTable.updatedAt,
        verifiedAt: userEmailsTable.verifiedAt,
        version: usersTable.version,
    };
}

export function mapUserSummary(row: {
    createdAt: Date;
    email: string;
    id: string;
    isOwner: boolean;
    status: 'active' | 'disabled' | 'pending' | 'deletion_pending' | 'purged';
    updatedAt: Date;
    verifiedAt: Date | null;
    version: number;
}) {
    return {
        createdAt: row.createdAt.toISOString(),
        emailVerified: row.verifiedAt !== null,
        id: row.id,
        isOwner: row.isOwner,
        primaryEmail: row.email.toLowerCase(),
        status: row.status,
        updatedAt: row.updatedAt.toISOString(),
        version: row.version,
    };
}

export function auditSelection() {
    return {
        action: adminAuditEventsTable.action,
        actorEmail: sql<
            string | null
        >`(select ue.email from ${userEmailsTable} ue where ue.user_id = ${adminAuditEventsTable.actorUserId} and ue.is_primary = true limit 1)`,
        actorUserId: adminAuditEventsTable.actorUserId,
        afterStatus: adminAuditEventsTable.afterStatus,
        afterVersion: adminAuditEventsTable.afterVersion,
        beforeStatus: adminAuditEventsTable.beforeStatus,
        beforeVersion: adminAuditEventsTable.beforeVersion,
        correlationId: adminAuditEventsTable.correlationId,
        expiresAt: adminAuditEventsTable.expiresAt,
        id: adminAuditEventsTable.id,
        metadata: adminAuditEventsTable.metadata,
        occurredAt: adminAuditEventsTable.occurredAt,
        outcome: adminAuditEventsTable.outcome,
        reason: adminAuditEventsTable.reason,
        targetEmail: sql<
            string | null
        >`(select ue.email from ${userEmailsTable} ue where ue.user_id = ${adminAuditEventsTable.targetUserId} and ue.is_primary = true limit 1)`,
        targetUserId: adminAuditEventsTable.targetUserId,
    };
}

export function mapAuditEvent(
    row: ReturnType<typeof auditSelection> extends Record<string, never>
        ? never
        : {
              action: AdminAuditEvent['action'];
              actorEmail: string | null;
              actorUserId: string;
              afterStatus: AdminAuditEvent['afterStatus'];
              afterVersion: number | null;
              beforeStatus: AdminAuditEvent['beforeStatus'];
              beforeVersion: number | null;
              correlationId: string;
              expiresAt: Date;
              id: string;
              metadata: Record<string, unknown>;
              occurredAt: Date;
              outcome: AdminAuditEvent['outcome'];
              reason: string | null;
              targetEmail: string | null;
              targetUserId: string | null;
          },
): AdminAuditEvent {
    const { metadata, ...event } = row;

    return {
        ...event,
        actorEmail: row.actorEmail?.toLowerCase() ?? null,
        expiresAt: row.expiresAt.toISOString(),
        occurredAt: row.occurredAt.toISOString(),
        targetEmail: row.targetEmail?.toLowerCase() ?? null,
        targetId:
            typeof metadata.targetId === 'string'
                ? metadata.targetId
                : row.targetUserId,
        targetKind:
            metadata.targetKind === 'dictionary_ai_configuration' ||
            metadata.targetKind === 'ai_credit_account' ||
            metadata.targetKind === 'sentence_library'
                ? metadata.targetKind
                : row.targetUserId
                  ? 'user'
                  : null,
    };
}

export function isCreditManageableStatus(
    status: AdminUserDetail['status'],
): boolean {
    return status === 'pending' || status === 'active' || status === 'disabled';
}

export function aiCreditRejection(
    error: unknown,
): AdminAiCreditMutationRejection | null {
    if (
        error instanceof AiCreditManagementConflictError ||
        error instanceof AiCreditIdempotencyConflictError
    ) {
        return 'account_conflict';
    }

    if (error instanceof AiCreditInsufficientBalanceError) {
        return 'adjustment_exceeds_available';
    }

    if (error instanceof AiCreditInvalidAmountError) return 'invalid_request';
    if (error instanceof AdminAiCreditTargetUnavailableError) {
        return 'target_unavailable';
    }

    if (error instanceof RecentAuthenticationRequiredError) {
        return 'recent_authentication_required';
    }

    if (error instanceof AdminAccessDeniedError) return 'admin_access_denied';

    return null;
}

export function auditValues(input: AdminAuditWrite) {
    return {
        action: input.action,
        actorUserId: input.actorUserId,
        afterStatus: input.afterStatus ?? null,
        afterVersion: input.afterVersion ?? null,
        beforeStatus: input.beforeStatus ?? null,
        beforeVersion: input.beforeVersion ?? null,
        correlationId: input.correlationId,
        expiresAt: input.expiresAt,
        id: input.id,
        metadata: input.metadata ?? {},
        occurredAt: input.occurredAt,
        outcome: input.outcome,
        reason: input.reason ?? null,
        targetUserId: input.targetUserId ?? null,
    };
}

export interface AdministrationStoreContext {
    readonly database: AdministrationDatabase;
    readonly cancellationJournal: Pick<
        AccountDeletionRecoveryJournal,
        'recordCancellation'
    >;
}
