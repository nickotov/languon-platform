import { randomUUID } from 'node:crypto';
import { eq, inArray, or } from 'drizzle-orm';
import { payloadHash, type AdminMcpTransaction } from './admin-mcp-persistence';
import {
    adminMcpAuditTable,
    adminMcpPreviewsTable,
    adminMcpReceiptsTable,
    adminMcpReservationsTable,
    adminMcpTokensTable,
} from './schema';

/** Account-purge participant. Caller owns the existing fenced purge transaction. */
export async function purgeAdminMcpForOwner(
    tx: AdminMcpTransaction,
    ownerUserId: string,
    at = new Date(),
): Promise<void> {
    const tokens = await tx
        .select({ id: adminMcpTokensTable.id })
        .from(adminMcpTokensTable)
        .where(eq(adminMcpTokensTable.ownerUserId, ownerUserId))
        .for('update');
    const tokenIds = tokens.map((token) => token.id);
    const targetMatches = or(
        eq(adminMcpPreviewsTable.target, ownerUserId),
        eq(adminMcpPreviewsTable.target, `user-action-budget:${ownerUserId}`),
    );
    const previews = await tx
        .select({ id: adminMcpPreviewsTable.id })
        .from(adminMcpPreviewsTable)
        .where(
            tokenIds.length
                ? or(
                      inArray(adminMcpPreviewsTable.tokenId, tokenIds),
                      targetMatches,
                  )
                : targetMatches,
        )
        .for('update');
    const previewIds = previews.map((preview) => preview.id);

    // Delete caller content and replay payloads in foreign-key order.
    if (previewIds.length) {
        await tx
            .delete(adminMcpReceiptsTable)
            .where(inArray(adminMcpReceiptsTable.previewId, previewIds));

        await tx
            .delete(adminMcpPreviewsTable)
            .where(inArray(adminMcpPreviewsTable.id, previewIds));
    }

    if (tokenIds.length) {
        await tx
            .delete(adminMcpReservationsTable)
            .where(inArray(adminMcpReservationsTable.tokenId, tokenIds));

        // Retain only opaque references, with all client-defined metadata erased.
        await tx
            .update(adminMcpTokensTable)
            .set({
                name: 'Account purged',
                secretHash: payloadHash(randomUUID()),
                permissions: [],
                allowedActions: [],
                limits: {},
                revokedAt: at,
                lastUsedAt: null,
            })
            .where(inArray(adminMcpTokensTable.id, tokenIds));
    }

    const events = await tx
        .select({
            id: adminMcpAuditTable.id,
            metadata: adminMcpAuditTable.metadata,
        })
        .from(adminMcpAuditTable)
        .where(
            or(
                eq(adminMcpAuditTable.actorUserId, ownerUserId),
                eq(adminMcpAuditTable.target, ownerUserId),
                eq(
                    adminMcpAuditTable.target,
                    `user-action-budget:${ownerUserId}`,
                ),
            ),
        );

    for (const event of events) {
        const references: Record<string, unknown> = {};
        for (const key of [
            'providerExpenseId',
            'reservationId',
            'probeId',
            'actionId',
        ]) {
            const value = event.metadata[key];
            if (typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value))
                references[key] = value;
        }

        const expenses = event.metadata.providerExpenseIds;
        if (Array.isArray(expenses))
            references.providerExpenseIds = expenses.filter(
                (value): value is string =>
                    typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value),
            );
        await tx
            .update(adminMcpAuditTable)
            .set({
                reason: 'Account purged',
                target: 'purged-account',
                metadata: references,
            })
            .where(eq(adminMcpAuditTable.id, event.id));
    }
}
