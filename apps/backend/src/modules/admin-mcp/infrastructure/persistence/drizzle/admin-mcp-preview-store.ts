import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { AdminMcpPermission } from '@languon/contracts';
import {
    AdminMcpError,
    requirePermission,
    requireAction,
    requireOperationKey,
    assertSafeAuditContext,
    type AdminMcpActor,
    type AdminMcpPreview,
} from '../../../domain/admin-mcp';
import {
    audit,
    payloadHash,
    requireActor,
    type AdminMcpDatabase,
    type AdminMcpTransaction,
} from './admin-mcp-persistence';
import { adminMcpPreviewsTable, adminMcpReceiptsTable } from './schema';
export interface AdminMcpPreviewInput {
    operation: AdminMcpPermission;
    target: string;
    current: unknown;
    proposed: unknown;
    expectedVersion: string;
    reason: string;
}
export class AdminMcpPreviewStore {
    public constructor(
        private readonly database: AdminMcpDatabase,
        private readonly now: () => Date = () => new Date(),
    ) {}

    public async create(
        actor: AdminMcpActor,
        input: AdminMcpPreviewInput,
    ): Promise<AdminMcpPreview> {
        requirePermission(actor, input.operation);
        requireAction(actor, input.operation);
        if (input.operation.endsWith('.read'))
            throw new AdminMcpError(
                'permission_denied',
                'Read operations do not create write previews.',
            );
        if (input.reason.trim().length < 5 || input.reason.length > 500)
            throw new Error('A bounded reason is required.');
        assertSafeAuditContext(input);
        const at = this.now();
        const preview: AdminMcpPreview = {
            ...input,
            reason: input.reason.trim(),
            id: randomUUID(),
            tokenId: actor.tokenId,
            createdAt: at,
            expiresAt: new Date(at.getTime() + 300_000),
        };

        await this.database.transaction(async (tx) => {
            await requireActor(tx, actor, at);
            await tx.insert(adminMcpPreviewsTable).values(preview);
            await audit(
                tx,
                actor,
                `preview.${preview.operation}`,
                preview.target,
                preview.reason,
                at,
                {
                    previewId: preview.id,
                    expectedVersion: preview.expectedVersion,
                },
            );
        });

        return preview;
    }

    /** Callback must validate expectedVersion and mutate using this exact transaction. */
    public executePreview(
        actor: AdminMcpActor,
        previewId: string,
        operationKey: string,
        apply: (
            tx: AdminMcpTransaction,
            preview: AdminMcpPreview,
        ) => Promise<unknown>,
    ): Promise<unknown> {
        requireOperationKey(operationKey);

        return this.database.transaction(async (tx) => {
            const at = this.now();
            await requireActor(tx, actor, at);
            const [preview] = await tx
                .select()
                .from(adminMcpPreviewsTable)
                .where(
                    and(
                        eq(adminMcpPreviewsTable.id, previewId),
                        eq(adminMcpPreviewsTable.tokenId, actor.tokenId),
                    ),
                )
                .for('update');

            if (!preview)
                throw new AdminMcpError('not_found', 'Preview not found.');
            requirePermission(actor, preview.operation);
            requireAction(actor, preview.operation);
            const hash = payloadHash({
                previewId,
                operation: preview.operation,
                target: preview.target,
                proposed: preview.proposed,
                expectedVersion: preview.expectedVersion,
            });
            const [receipt] = await tx
                .select()
                .from(adminMcpReceiptsTable)
                .where(
                    and(
                        eq(adminMcpReceiptsTable.tokenId, actor.tokenId),
                        eq(adminMcpReceiptsTable.operationKey, operationKey),
                    ),
                );

            if (receipt) {
                if (receipt.payloadHash !== hash)
                    throw new AdminMcpError(
                        'idempotency_conflict',
                        'Operation key already used for a different change.',
                    );

                return receipt.result;
            }

            if (preview.appliedAt)
                throw new AdminMcpError(
                    'idempotency_conflict',
                    'Preview was already applied with a different operation key.',
                );
            // The lock wait may have consumed the entire disclosure lifetime.
            await requireActor(tx, actor, this.now());
            if (preview.expiresAt <= this.now())
                throw new AdminMcpError(
                    'preview_expired',
                    'Preview expired; create a fresh preview.',
                );

            const result = await apply(tx, preview);
            // Locks on owner, membership and token prevent concurrent invalidation during commit.
            await requireActor(tx, actor, this.now());
            const committedAt = this.now();
            if (preview.expiresAt <= committedAt)
                throw new AdminMcpError(
                    'preview_expired',
                    'Preview expired before commit; create a fresh preview.',
                );
            await tx.insert(adminMcpReceiptsTable).values({
                id: randomUUID(),
                tokenId: actor.tokenId,
                operationKey,
                previewId,
                payloadHash: hash,
                result,
                createdAt: committedAt,
            });

            await tx
                .update(adminMcpPreviewsTable)
                .set({ appliedAt: committedAt })
                .where(eq(adminMcpPreviewsTable.id, previewId));

            await audit(
                tx,
                actor,
                preview.operation,
                preview.target,
                preview.reason,
                committedAt,
                { previewId, operationKeyHash: payloadHash(operationKey) },
            );

            return result;
        });
    }
}
