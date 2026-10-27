import { randomUUID, createHash } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import { adminMembershipsTable } from '../../../../administration/infrastructure/persistence/drizzle/schema';
import {
    usersTable,
    userEmailsTable,
} from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    AdminMcpError,
    redactCredentialMaterial,
    type AdminMcpActor,
} from '../../../domain/admin-mcp';
import { adminMcpAuditTable, adminMcpTokensTable } from './schema';
export type AdminMcpDatabase = PostgresJsDatabase<typeof databaseSchema>;
export type AdminMcpTransaction = Parameters<
    Parameters<AdminMcpDatabase['transaction']>[0]
>[0];
export type AdminMcpQuery = AdminMcpDatabase | AdminMcpTransaction;
export async function requireOwner(
    tx: AdminMcpTransaction,
    userId: string,
): Promise<void> {
    const [owner] = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
            and(
                eq(usersTable.id, userId),
                eq(usersTable.status, 'active'),
                sql`exists (select 1 from ${userEmailsTable} where ${userEmailsTable.userId} = ${usersTable.id} and ${userEmailsTable.isPrimary} = true and ${userEmailsTable.verifiedAt} is not null)`,
            ),
        )
        .for('share');
    const [membership] = await tx
        .select({ id: adminMembershipsTable.id })
        .from(adminMembershipsTable)
        .where(
            and(
                eq(adminMembershipsTable.userId, userId),
                eq(adminMembershipsTable.role, 'owner'),
                isNull(adminMembershipsTable.revokedAt),
            ),
        )
        .for('share');

    if (!owner || !membership)
        throw new AdminMcpError(
            'unauthorized',
            'Active owner access is required.',
        );
}

export async function requireActor(
    tx: AdminMcpTransaction,
    actor: AdminMcpActor,
    at: Date,
): Promise<void> {
    await requireOwner(tx, actor.userId);
    const [token] = await tx
        .select()
        .from(adminMcpTokensTable)
        .where(
            and(
                eq(adminMcpTokensTable.id, actor.tokenId),
                eq(adminMcpTokensTable.ownerUserId, actor.userId),
                isNull(adminMcpTokensTable.revokedAt),
                gt(adminMcpTokensTable.expiresAt, at),
            ),
        )
        .for('update');

    if (!token)
        throw new AdminMcpError(
            'unauthorized',
            'Invalid or inactive credential.',
        );
    if (
        JSON.stringify(token.allowedActions) !==
            JSON.stringify(actor.allowedActions) ||
        JSON.stringify(token.permissions) !==
            JSON.stringify(actor.permissions) ||
        JSON.stringify(token.limits) !== JSON.stringify(actor.limits)
    )
        throw new AdminMcpError(
            'unauthorized',
            'Credential authority changed.',
        );
}

export function canonical(value: unknown): string {
    if (value === undefined)
        throw new Error('Undefined payload values are not supported.');
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    const object = value as Record<string, unknown>;

    return `{${Object.keys(object)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
        .join(',')}}`;
}

export function payloadHash(value: unknown): string {
    return createHash('sha256').update(canonical(value)).digest('hex');
}

export async function audit(
    tx: AdminMcpTransaction,
    actor: { userId: string; tokenId: string },
    action: string,
    target: string,
    reason: string,
    at: Date,
    metadata: Record<string, unknown> = {},
    outcome: 'success' | 'rejected' = 'success',
): Promise<void> {
    const safeMetadata = JSON.parse(
        redactCredentialMaterial(JSON.stringify(metadata)),
        (key: string, value: unknown) =>
            key === 'operationKey' ? undefined : value,
    ) as Record<string, unknown>;

    await tx.insert(adminMcpAuditTable).values({
        id: randomUUID(),
        tokenId: actor.tokenId,
        actorUserId: actor.userId,
        action: redactCredentialMaterial(action),
        outcome,
        target: redactCredentialMaterial(target),
        reason: redactCredentialMaterial(reason),
        correlationId: randomUUID(),
        metadata: safeMetadata,
        occurredAt: at,
        expiresAt: new Date(at.getTime() + 365 * 86_400_000),
    });
}

export async function lockOperation(
    tx: AdminMcpTransaction,
    tokenId: string,
    key: string,
): Promise<void> {
    await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`admin-mcp:${tokenId}:${key}`},0))`,
    );
}
