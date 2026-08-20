import { sql } from 'drizzle-orm';
import {
    check,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';

import {
    usersTable,
    userStatusEnum,
} from '../../../../users/infrastructure/persistence/drizzle/schema';

export const adminMembershipRoleEnum = pgEnum('admin_membership_role', [
    'owner',
]);
export const adminAuditOutcomeEnum = pgEnum('admin_audit_outcome', [
    'success',
    'rejected',
]);
export const adminAuditActionEnum = pgEnum('admin_audit_action', [
    'membership_granted',
    'membership_revoked',
    'user_disabled',
    'user_restored',
    'access_denied',
    'audit_pruned',
]);

export const adminMembershipsTable = pgTable(
    'admin_memberships',
    {
        grantedAt: timestamp('granted_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        grantedByUserId: uuid('granted_by_user_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'restrict' }),
        id: uuid('id').primaryKey(),
        grantReason: text('grant_reason').notNull(),
        revokedAt: timestamp('revoked_at', {
            mode: 'date',
            withTimezone: true,
        }),
        revokedByUserId: uuid('revoked_by_user_id').references(
            () => usersTable.id,
            {
                onDelete: 'restrict',
            },
        ),
        revokeReason: text('revoke_reason'),
        role: adminMembershipRoleEnum('role').default('owner').notNull(),
        updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        userId: uuid('user_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'restrict' }),
    },
    (table) => [
        check(
            'admin_memberships_reason_length',
            sql`char_length(${table.grantReason}) between 5 and 500 and (${table.revokeReason} is null or char_length(${table.revokeReason}) between 5 and 500)`,
        ),
        check(
            'admin_memberships_time_order',
            sql`${table.updatedAt} >= ${table.grantedAt} and (${table.revokedAt} is null or ${table.revokedAt} >= ${table.grantedAt})`,
        ),
        check(
            'admin_memberships_revocation_pair',
            sql`(${table.revokedAt} is null) = (${table.revokedByUserId} is null) and (${table.revokedAt} is null) = (${table.revokeReason} is null)`,
        ),
        uniqueIndex('admin_memberships_one_active_per_user')
            .on(table.userId)
            .where(sql`${table.revokedAt} is null`),
        index('admin_memberships_active_role_idx')
            .on(table.role, table.grantedAt)
            .where(sql`${table.revokedAt} is null`),
        index('admin_memberships_user_history_idx').on(
            table.userId,
            table.grantedAt,
        ),
    ],
);

export const adminAuditEventsTable = pgTable(
    'admin_audit_events',
    {
        action: adminAuditActionEnum('action').notNull(),
        actorUserId: uuid('actor_user_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'restrict' }),
        afterStatus: userStatusEnum('after_status'),
        afterVersion: integer('after_version'),
        beforeStatus: userStatusEnum('before_status'),
        beforeVersion: integer('before_version'),
        correlationId: uuid('correlation_id').notNull(),
        expiresAt: timestamp('expires_at', {
            mode: 'date',
            withTimezone: true,
        }).notNull(),
        id: uuid('id').primaryKey(),
        metadata: jsonb('metadata')
            .$type<Record<string, unknown>>()
            .default({})
            .notNull(),
        occurredAt: timestamp('occurred_at', {
            mode: 'date',
            withTimezone: true,
        })
            .defaultNow()
            .notNull(),
        outcome: adminAuditOutcomeEnum('outcome').notNull(),
        reason: text('reason'),
        targetUserId: uuid('target_user_id').references(() => usersTable.id, {
            onDelete: 'restrict',
        }),
    },
    (table) => [
        check(
            'admin_audit_events_reason_length',
            sql`${table.reason} is null or char_length(${table.reason}) between 5 and 500`,
        ),
        check(
            'admin_audit_events_version_positive',
            sql`(${table.beforeVersion} is null or ${table.beforeVersion} > 0) and (${table.afterVersion} is null or ${table.afterVersion} > 0)`,
        ),
        check(
            'admin_audit_events_expiry_after_occurrence',
            sql`${table.expiresAt} > ${table.occurredAt}`,
        ),
        check(
            'admin_audit_events_metadata_bounded',
            sql`jsonb_typeof(${table.metadata}) = 'object' and octet_length(${table.metadata}::text) <= 4096`,
        ),
        index('admin_audit_events_correlation_idx').on(table.correlationId),
        index('admin_audit_events_occurred_idx').on(table.occurredAt),
        index('admin_audit_events_actor_occurred_idx').on(
            table.actorUserId,
            table.occurredAt,
        ),
        index('admin_audit_events_target_occurred_idx').on(
            table.targetUserId,
            table.occurredAt,
        ),
        index('admin_audit_events_expiry_idx').on(table.expiresAt),
    ],
);
