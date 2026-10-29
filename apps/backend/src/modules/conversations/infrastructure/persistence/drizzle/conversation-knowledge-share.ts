import { and, eq, isNull } from 'drizzle-orm';
import type { ConversationSource } from '@languon/contracts';
import {
    knowledgeNotesTable,
    knowledgeSharesTable,
} from '../../../../knowledge/infrastructure/persistence/drizzle/schema';
import {
    knowledgeWorkbooksTable,
    knowledgeWorkbookNotesTable,
    knowledgeWorkbookSharesTable,
} from '../../../../knowledge/infrastructure/persistence/drizzle/workbook-schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    conversationUnavailable,
    type SourceAuthority,
} from '../../../domain/conversation';
import type { ConversationsTransaction } from './conversation-source';

export async function readSharedConversationNote(
    tx: ConversationsTransaction,
    source: ConversationSource,
    access: { key?: string; authority?: SourceAuthority },
    verify:
        | ((key: string, digest: string) => boolean | Promise<boolean>)
        | undefined,
) {
    const workbookSource = source.shareKind === 'workbook';
    if (
        source.shareKind &&
        !['knowledge', 'workbook'].includes(source.shareKind)
    )
        throw conversationUnavailable();
    const [candidate] = await tx
        .select()
        .from(knowledgeNotesTable)
        .where(eq(knowledgeNotesTable.id, source.id));

    if (!candidate) throw conversationUnavailable();
    const [owner] = await tx
        .select({ status: usersTable.status })
        .from(usersTable)
        .where(eq(usersTable.id, candidate.ownerId))
        .for('share');

    if (owner?.status !== 'active') throw conversationUnavailable();
    const known = access.authority?.share;
    let share: { id: string; digest: string; version: number } | undefined;
    if (workbookSource) {
        const [capability] = await tx
            .select()
            .from(knowledgeWorkbookSharesTable)
            .where(
                eq(
                    knowledgeWorkbookSharesTable.locator,
                    source.shareLocator ?? '',
                ),
            );

        if (!capability) throw conversationUnavailable();
        const [workbook] = await tx
            .select()
            .from(knowledgeWorkbooksTable)
            .where(
                and(
                    eq(knowledgeWorkbooksTable.id, capability.workbookId),
                    eq(knowledgeWorkbooksTable.ownerId, candidate.ownerId),
                    isNull(knowledgeWorkbooksTable.deletedAt),
                ),
            )
            .for('share');

        if (!workbook) throw conversationUnavailable();
        const [live] = await tx
            .select()
            .from(knowledgeWorkbookSharesTable)
            .where(
                and(
                    eq(knowledgeWorkbookSharesTable.workbookId, workbook.id),
                    eq(
                        knowledgeWorkbookSharesTable.locator,
                        source.shareLocator ?? '',
                    ),
                ),
            )
            .for('share');
        const [membership] = await tx
            .select({ id: knowledgeWorkbookNotesTable.noteId })
            .from(knowledgeWorkbookNotesTable)
            .where(
                and(
                    eq(knowledgeWorkbookNotesTable.workbookId, workbook.id),
                    eq(knowledgeWorkbookNotesTable.noteId, source.id),
                ),
            );

        if (!live || !membership) throw conversationUnavailable();
        share = {
            id: `workbook:${workbook.id}`,
            digest: live.keyDigest,
            version: 1,
        };
    }

    const [note] = await tx
        .select()
        .from(knowledgeNotesTable)
        .where(eq(knowledgeNotesTable.id, source.id))
        .for('share');

    if (!note || note.status !== 'saved' || note.ownerId !== candidate.ownerId)
        throw conversationUnavailable();
    if (!workbookSource) {
        const [live] = await tx
            .select()
            .from(knowledgeSharesTable)
            .where(
                and(
                    eq(knowledgeSharesTable.noteId, source.id),
                    eq(knowledgeSharesTable.locator, source.shareLocator ?? ''),
                ),
            )
            .for('share');

        if (!live) throw conversationUnavailable();
        share = {
            id: `knowledge:${source.id}`,
            digest: live.keyDigest,
            version: live.version,
        };
    }

    if (
        !share ||
        (known
            ? known.id !== share.id ||
              known.digest !== share.digest ||
              known.version !== share.version ||
              access.authority?.sourceOwnerId !== note.ownerId
            : !access.key ||
              !verify ||
              !(await verify(access.key, share.digest)))
    )
        throw conversationUnavailable();

    return {
        note,
        authority: {
            sourceOwnerId: note.ownerId,
            share,
        } satisfies SourceAuthority,
    };
}
