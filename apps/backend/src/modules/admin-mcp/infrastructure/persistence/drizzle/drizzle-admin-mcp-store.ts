import { and, eq, gt, isNull, sql, desc } from 'drizzle-orm';
import type {
    AdminMcpTokenMetadata,
    AdminMcpAuditQuery,
    AdminMcpAuditResponse,
} from '@languon/contracts';
import type { AdminMcpCredentialStore } from '../../../application/admin-mcp-credential-service';
import {
    AdminMcpError,
    type AdminMcpActor,
    type AdminMcpToken,
} from '../../../domain/admin-mcp';
import { adminMembershipsTable } from '../../../../administration/infrastructure/persistence/drizzle/schema';
import {
    usersTable,
    userEmailsTable,
} from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    audit,
    requireOwner,
    type AdminMcpDatabase,
} from './admin-mcp-persistence';
import { adminMcpTokensTable, adminMcpAuditTable } from './schema';
export function tokenMetadata(
    row: typeof adminMcpTokensTable.$inferSelect,
): AdminMcpTokenMetadata {
    return {
        id: row.id,
        ownerUserId: row.ownerUserId,
        name: row.name,
        permissions: row.permissions,
        allowedActions: row.allowedActions,
        limits: row.limits,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
        revokedAt: row.revokedAt?.toISOString() ?? null,
    };
}

export class DrizzleAdminMcpStore implements AdminMcpCredentialStore {
    public constructor(private readonly database: AdminMcpDatabase) {}

    public insertToken(
        token: AdminMcpToken,
        reason: string,
        at: Date,
    ): Promise<void> {
        return this.database.transaction(async (tx) => {
            await requireOwner(tx, token.ownerUserId);
            await tx.insert(adminMcpTokensTable).values({
                ...token,
                createdAt: new Date(token.createdAt),
                expiresAt: new Date(token.expiresAt),
                lastUsedAt: null,
                revokedAt: null,
            });

            await audit(
                tx,
                { tokenId: token.id, userId: token.ownerUserId },
                'token.issued',
                token.id,
                reason,
                at,
                { permissions: token.permissions },
            );
        });
    }

    public listTokens(ownerUserId: string): Promise<AdminMcpTokenMetadata[]> {
        return this.database.transaction(async (tx) => {
            await requireOwner(tx, ownerUserId);
            const rows = await tx
                .select()
                .from(adminMcpTokensTable)
                .where(eq(adminMcpTokensTable.ownerUserId, ownerUserId));

            return rows.map(tokenMetadata);
        });
    }

    public revokeToken(
        ownerUserId: string,
        tokenId: string,
        reason: string,
        at: Date,
    ): Promise<void> {
        return this.database.transaction(async (tx) => {
            await requireOwner(tx, ownerUserId);
            const [token] = await tx
                .select()
                .from(adminMcpTokensTable)
                .where(
                    and(
                        eq(adminMcpTokensTable.id, tokenId),
                        eq(adminMcpTokensTable.ownerUserId, ownerUserId),
                    ),
                )
                .for('update');

            if (!token)
                throw new AdminMcpError('not_found', 'Credential not found.');
            if (token.revokedAt) return;

            await tx
                .update(adminMcpTokensTable)
                .set({ revokedAt: at })
                .where(eq(adminMcpTokensTable.id, tokenId));

            await audit(
                tx,
                { tokenId, userId: ownerUserId },
                'token.revoked',
                tokenId,
                reason,
                at,
            );
        });
    }

    public audit(
        ownerUserId: string,
        query: AdminMcpAuditQuery,
    ): Promise<AdminMcpAuditResponse> {
        return this.database.transaction(async (tx) => {
            await requireOwner(tx, ownerUserId);
            const predicate = eq(adminMcpAuditTable.actorUserId, ownerUserId);
            const events = await tx
                .select()
                .from(adminMcpAuditTable)
                .where(predicate)
                .orderBy(
                    desc(adminMcpAuditTable.occurredAt),
                    desc(adminMcpAuditTable.id),
                )
                .limit(query.pageSize)
                .offset((query.page - 1) * query.pageSize);
            const [count] = await tx
                .select({ total: sql<number>`count(*)::integer` })
                .from(adminMcpAuditTable)
                .where(predicate);

            return {
                events: events.map(
                    ({ expiresAt: _expiresAt, occurredAt, ...event }) => ({
                        ...event,
                        occurredAt: occurredAt.toISOString(),
                    }),
                ),
                total: count?.total ?? 0,
                page: query.page,
                pageSize: query.pageSize,
            };
        });
    }

    public async authenticateHash(
        hash: string,
        at: Date,
    ): Promise<AdminMcpActor> {
        const [row] = await this.database
            .select({ token: adminMcpTokensTable })
            .from(adminMcpTokensTable)
            .innerJoin(
                usersTable,
                and(
                    eq(usersTable.id, adminMcpTokensTable.ownerUserId),
                    eq(usersTable.status, 'active'),
                    sql`exists (select 1 from ${userEmailsTable} where ${userEmailsTable.userId} = ${usersTable.id} and ${userEmailsTable.isPrimary} = true and ${userEmailsTable.verifiedAt} is not null)`,
                ),
            )
            .innerJoin(
                adminMembershipsTable,
                and(
                    eq(adminMembershipsTable.userId, usersTable.id),
                    eq(adminMembershipsTable.role, 'owner'),
                    isNull(adminMembershipsTable.revokedAt),
                ),
            )
            .where(
                and(
                    eq(adminMcpTokensTable.secretHash, hash),
                    isNull(adminMcpTokensTable.revokedAt),
                    gt(adminMcpTokensTable.expiresAt, at),
                ),
            );

        if (!row)
            throw new AdminMcpError(
                'unauthorized',
                'Invalid or inactive credential.',
            );

        await this.database
            .update(adminMcpTokensTable)
            .set({ lastUsedAt: at })
            .where(eq(adminMcpTokensTable.id, row.token.id));

        return {
            tokenId: row.token.id,
            userId: row.token.ownerUserId,
            permissions: row.token.permissions,
            allowedActions: row.token.allowedActions,
            limits: row.token.limits,
        };
    }
}
