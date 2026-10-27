import { sql } from 'drizzle-orm';
import {
    bigint,
    check,
    index,
    jsonb,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';
import type { AdminMcpLimits, AdminMcpPermission } from '@languon/contracts';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
const time = (name: string) =>
    timestamp(name, { mode: 'date', withTimezone: true });
export const adminMcpTokensTable = pgTable(
    'admin_mcp_tokens',
    {
        id: uuid('id').primaryKey(),
        ownerUserId: uuid('owner_user_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'restrict' }),
        name: text('name').notNull(),
        secretHash: text('secret_hash').notNull(),
        allowedActions: jsonb('allowed_actions')
            .$type<string[]>()
            .default([])
            .notNull(),
        permissions: jsonb('permissions')
            .$type<AdminMcpPermission[]>()
            .notNull(),
        limits: jsonb('limits').$type<AdminMcpLimits>().notNull(),
        createdAt: time('created_at').notNull(),
        expiresAt: time('expires_at').notNull(),
        lastUsedAt: time('last_used_at'),
        revokedAt: time('revoked_at'),
    },
    (t) => [
        uniqueIndex('admin_mcp_tokens_secret_hash_unique').on(t.secretHash),
        index('admin_mcp_tokens_owner_idx').on(t.ownerUserId),
        check(
            'admin_mcp_tokens_expiry_bounded',
            sql`${t.expiresAt} > ${t.createdAt} and ${t.expiresAt} <= ${t.createdAt} + interval '90 days'`,
        ),
        check(
            'admin_mcp_tokens_hash_format',
            sql`${t.secretHash} ~ '^[a-f0-9]{64}$'`,
        ),
    ],
);
export const adminMcpPreviewsTable = pgTable(
    'admin_mcp_previews',
    {
        id: uuid('id').primaryKey(),
        tokenId: uuid('token_id')
            .notNull()
            .references(() => adminMcpTokensTable.id, { onDelete: 'restrict' }),
        operation: text('operation').$type<AdminMcpPermission>().notNull(),
        target: text('target').notNull(),
        current: jsonb('current').$type<unknown>().notNull(),
        proposed: jsonb('proposed').$type<unknown>().notNull(),
        expectedVersion: text('expected_version').notNull(),
        reason: text('reason').notNull(),
        createdAt: time('created_at').notNull(),
        expiresAt: time('expires_at').notNull(),
        appliedAt: time('applied_at'),
    },
    (t) => [
        index('admin_mcp_previews_expiry_idx').on(t.expiresAt),
        check(
            'admin_mcp_previews_expiry_bounded',
            sql`${t.expiresAt} > ${t.createdAt} and ${t.expiresAt} <= ${t.createdAt} + interval '5 minutes'`,
        ),
    ],
);
export const adminMcpReceiptsTable = pgTable(
    'admin_mcp_receipts',
    {
        id: uuid('id').primaryKey(),
        tokenId: uuid('token_id')
            .notNull()
            .references(() => adminMcpTokensTable.id, { onDelete: 'restrict' }),
        operationKey: text('operation_key').notNull(),
        previewId: uuid('preview_id')
            .notNull()
            .references(() => adminMcpPreviewsTable.id),
        payloadHash: text('payload_hash').notNull(),
        result: jsonb('result').$type<unknown>().notNull(),
        createdAt: time('created_at').notNull(),
    },
    (t) => [
        uniqueIndex('admin_mcp_receipts_key_unique').on(
            t.tokenId,
            t.operationKey,
        ),
        uniqueIndex('admin_mcp_receipts_preview_unique').on(t.previewId),
    ],
);
export const adminMcpReservationsTable = pgTable(
    'admin_mcp_reservations',
    {
        id: uuid('id').primaryKey(),
        tokenId: uuid('token_id')
            .notNull()
            .references(() => adminMcpTokensTable.id, { onDelete: 'restrict' }),
        operationKey: text('operation_key').notNull(),
        payloadHash: text('payload_hash').notNull(),
        kind: text('kind')
            .$type<'model-check' | 'credit-grant' | 'credit-revoke'>()
            .notNull(),
        day: text('day').notNull(),
        result: jsonb('result').$type<unknown>(),
        state: text('state')
            .$type<'reserved' | 'settled' | 'unknown'>()
            .notNull(),
        reservedUnits: bigint('reserved_units', { mode: 'bigint' }).notNull(),
        settledUnits: bigint('settled_units', { mode: 'bigint' }),
        createdAt: time('created_at').notNull(),
        settledAt: time('settled_at'),
        dispatchAuthorizedAt: time('dispatch_authorized_at'),
    },
    (t) => [
        uniqueIndex('admin_mcp_reservations_key_unique').on(
            t.tokenId,
            t.operationKey,
        ),
        index('admin_mcp_reservations_day_idx').on(t.tokenId, t.kind, t.day),
        check(
            'admin_mcp_reservations_amounts',
            sql`${t.reservedUnits} > 0 and (${t.settledUnits} is null or ${t.settledUnits} >= 0)`,
        ),
    ],
);
export const adminMcpAuditTable = pgTable(
    'admin_mcp_audit_events',
    {
        id: uuid('id').primaryKey(),
        tokenId: uuid('token_id').references(() => adminMcpTokensTable.id),
        actorUserId: uuid('actor_user_id')
            .notNull()
            .references(() => usersTable.id),
        action: text('action').notNull(),
        outcome: text('outcome')
            .$type<'success' | 'rejected'>()
            .default('success')
            .notNull(),
        target: text('target').notNull(),
        reason: text('reason').notNull(),
        correlationId: uuid('correlation_id').notNull(),
        metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),
        occurredAt: time('occurred_at').notNull(),
        expiresAt: time('expires_at').notNull(),
    },
    (t) => [
        index('admin_mcp_audit_events_expiry_idx').on(t.expiresAt),
        index('admin_mcp_audit_events_actor_idx').on(
            t.actorUserId,
            t.occurredAt,
            t.id,
        ),
        index('admin_mcp_audit_events_token_idx').on(t.tokenId, t.occurredAt),
        check(
            'admin_mcp_audit_bounded',
            sql`octet_length(${t.metadata}::text) <= 4096`,
        ),
    ],
);
