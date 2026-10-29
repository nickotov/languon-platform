import { selectKnowledgeBlocksForCopy } from './block-copy-selection';
import { and, asc, eq, inArray } from 'drizzle-orm';
import {
    CopyKnowledgeBlocksResponseSchema,
    KnowledgeWorkingContentSchema,
    type CopyKnowledgeBlocksRequest,
} from '@languon/contracts';
import type { KnowledgeBlockCopyStore } from '../../../application/block-copy-store';
import { KnowledgeDomainError } from '../../../domain/knowledge';
import type { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import {
    knowledgeNotesTable,
    knowledgeWorkingBranchesTable as branches,
} from './schema';
import {
    getOwnedKnowledgeRow,
    knowledgeFingerprint,
    knowledgeUnavailable,
    lockKnowledgeOwner,
    readKnowledgeReceipt,
    writeKnowledgeReceipt,
    type KnowledgeDatabase,
    type KnowledgeTransaction,
} from './knowledge-transaction';
import { readLearnerNote } from './learner-access';
import {
    knowledgeWorkbooksTable,
    knowledgeWorkbookSharesTable,
} from './workbook-schema';
import { copyWorkbookBody } from './workbook-copy';
import {
    prepareMediaCopy,
    assertKnowledgeMediaGrants,
    knowledgeAudioAssetIds,
} from './media-grants';

function stale(): never {
    throw new KnowledgeDomainError(
        'version_conflict',
        'A source or destination changed. Refresh before copying.',
    );
}

export class DrizzleKnowledgeBlockCopyStore implements KnowledgeBlockCopyStore {
    constructor(
        private readonly database: KnowledgeDatabase,
        private readonly crypto: KnowledgeShareCrypto,
    ) {}

    private async source(
        tx: KnowledgeTransaction,
        ownerId: string,
        input: CopyKnowledgeBlocksRequest,
    ) {
        const source = input.source;
        if (source.kind === 'saved') {
            const note = await readLearnerNote(
                tx,
                this.crypto,
                ownerId,
                source.noteId,
                source.access,
            );

            if (note.version !== source.expectedVersion) stale();

            return note.body;
        }

        await getOwnedKnowledgeRow(tx, ownerId, source.noteId);
        const [branch] = await tx
            .select()
            .from(branches)
            .where(
                and(
                    eq(branches.id, source.branchId),
                    eq(branches.noteId, source.noteId),
                ),
            )
            .for('share');

        if (!branch || branch.version !== source.expectedVersion) stale();

        return branch.content.body;
    }

    async copy(
        ownerId: string,
        noteId: string,
        input: CopyKnowledgeBlocksRequest,
    ) {
        return this.database.transaction(async (tx) => {
            await lockKnowledgeOwner(tx, ownerId);
            const fingerprint = knowledgeFingerprint({
                operation: 'block-copy',
                noteId,
                ...input,
                preview: false,
            });
            const receipt = await readKnowledgeReceipt(
                tx,
                ownerId,
                input.operationId,
                fingerprint,
            );
            // Workbook mutations lock the group before its note rows. Preserve that
            // order before taking the globally ordered source/destination note locks.
            const access =
                input.source.kind === 'saved' ? input.source.access : undefined;

            if (!receipt && access?.kind === 'workbook') {
                const [share] = await tx
                    .select()
                    .from(knowledgeWorkbookSharesTable)
                    .where(
                        eq(
                            knowledgeWorkbookSharesTable.locator,
                            access.locator,
                        ),
                    );

                if (!share || !this.crypto.verify(access.key, share.keyDigest))
                    throw knowledgeUnavailable();
                await tx
                    .select({ id: knowledgeWorkbooksTable.id })
                    .from(knowledgeWorkbooksTable)
                    .where(eq(knowledgeWorkbooksTable.id, share.workbookId))
                    .for('share');
            }

            await tx
                .select({ id: knowledgeNotesTable.id })
                .from(knowledgeNotesTable)
                .where(
                    inArray(
                        knowledgeNotesTable.id,
                        receipt ? [noteId] : [noteId, input.source.noteId],
                    ),
                )
                .orderBy(asc(knowledgeNotesTable.id))
                .for('update');

            await getOwnedKnowledgeRow(tx, ownerId, noteId);
            const [destination] = await tx
                .select()
                .from(branches)
                .where(
                    and(
                        eq(branches.id, input.branchId),
                        eq(branches.noteId, noteId),
                    ),
                )
                .for('update');

            if (!destination) throw knowledgeUnavailable();
            if (receipt) {
                // The completed independent destination remains readable after source revocation.
                const count = input.blockIds.length;

                return CopyKnowledgeBlocksResponseSchema.parse({
                    branch: {
                        ...destination,
                        updatedAt: destination.updatedAt.toISOString(),
                    },
                    selectedCount: count,
                    blockCount: null,
                    dependencyCount: null,
                    mediaCount: null,
                    replayed: true,
                });
            }

            if (destination.version !== input.expectedBranchVersion) stale();
            const source = selectKnowledgeBlocksForCopy(
                await this.source(tx, ownerId, input),
                input.blockIds,
            );

            await assertKnowledgeMediaGrants(tx, input.source.noteId, source);
            const count = source.document.content!.length,
                summary = {
                    selectedCount: input.blockIds.length,
                    blockCount: count,
                    dependencyCount: count - input.blockIds.length,
                    mediaCount: knowledgeAudioAssetIds(source).length,
                    replayed: false,
                };

            if (input.preview) return { ...summary, branch: null };
            const media = await prepareMediaCopy(
                tx,
                input.source.noteId,
                source,
            );
            const copied = copyWorkbookBody(source, media.assetIds);
            const content = KnowledgeWorkingContentSchema.parse({
                ...destination.content,
                body: {
                    schemaVersion: 2,
                    document: {
                        type: 'doc',
                        content: [
                            ...(destination.content.body.document.content ??
                                []),
                            ...(copied.document.content ?? []),
                        ],
                    },
                },
            });

            await media.grant(noteId);
            await assertKnowledgeMediaGrants(tx, noteId, content.body);
            const now = new Date();
            const [updated] = await tx
                .update(branches)
                .set({
                    content,
                    version: destination.version + 1,
                    updatedAt: now,
                })
                .where(eq(branches.id, destination.id))
                .returning();

            await tx
                .update(knowledgeNotesTable)
                .set({ preferredBranchId: destination.id, updatedAt: now })
                .where(eq(knowledgeNotesTable.id, noteId));

            await writeKnowledgeReceipt(tx, {
                ownerId,
                operationId: input.operationId,
                operation: 'update',
                fingerprint,
                noteId: destination.id,
                version: updated!.version,
                createdAt: now,
            });

            return CopyKnowledgeBlocksResponseSchema.parse({
                ...summary,
                branch: { ...updated!, updatedAt: now.toISOString() },
            });
        });
    }
}
