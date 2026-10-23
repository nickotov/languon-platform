import {
    KnowledgeNoteContentSchema,
    type KnowledgeNoteContent,
    type PublishKnowledgeDraftRequest,
} from '@languon/contracts';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { ConversationAccess } from '../../../application/ports/conversation-store';
import { conversationUnavailable } from '../../../domain/conversation';
import { conversationEvent } from './conversation-events';
import {
    conversationAuthorize,
    conversationTransaction,
} from './conversation-persistence-authority';
import {
    conflict,
    draftView,
    type ConversationPersistenceContext,
} from './conversation-persistence-context';
import { conversationDraftsTable as drafts } from './schema';

export async function conversationUpdateDraft(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    id: string,
    draftId: string,
    version: number,
    content: KnowledgeNoteContent,
) {
    return conversationTransaction(persistence, async (tx) => {
        await conversationAuthorize(persistence, tx, access, id);
        const [row] = await tx
            .update(drafts)
            .set({
                content: KnowledgeNoteContentSchema.parse(content),
                version: sql`${drafts.version}+1`,
                updatedAt: persistence.now(),
            })
            .where(
                and(
                    eq(drafts.id, draftId),
                    eq(drafts.conversationId, id),
                    eq(drafts.version, version),
                    isNull(drafts.publishedAt),
                ),
            )
            .returning();

        if (!row) throw conflict('The draft changed. Reload it before saving.');
        const result = draftView(row);
        await conversationEvent(persistence, tx, id, 'draft', result);

        return result;
    });
}

export async function conversationDiscardDraft(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    id: string,
    draftId: string,
) {
    await conversationTransaction(persistence, async (tx) => {
        await conversationAuthorize(persistence, tx, access, id);
        await tx
            .delete(drafts)
            .where(
                and(
                    eq(drafts.id, draftId),
                    eq(drafts.conversationId, id),
                    isNull(drafts.publishedAt),
                ),
            );

        await conversationEvent(persistence, tx, id, 'draft-deleted', {
            draftId,
        });
    });
}

export async function conversationPublishDraft(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    id: string,
    draftId: string,
    input: PublishKnowledgeDraftRequest,
) {
    return conversationTransaction(persistence, async (tx) => {
        await conversationAuthorize(persistence, tx, access, id);
        const [row] = await tx
            .select()
            .from(drafts)
            .where(and(eq(drafts.id, draftId), eq(drafts.conversationId, id)))
            .for('update');

        if (!row) throw conversationUnavailable();
        if (row.publishedAt && row.publicationOperationId !== input.operationId)
            throw conflict('This draft has already been saved.');
        if (row.version !== input.expectedVersion)
            throw conflict('The draft changed. Reload it before saving.');
        if (
            input.mode === 'update' &&
            (!row.targetNoteId ||
                row.expectedNoteVersion !== input.expectedNoteVersion)
        )
            throw conflict('Compare the changed note before updating it.');
        const note = await persistence.dependencies.publishNote(
            tx,
            access.ownerId,
            {
                operationId: input.operationId,
                content: row.content,
                ...(input.mode === 'update'
                    ? {
                          noteId: row.targetNoteId!,
                          expectedVersion: input.expectedNoteVersion!,
                      }
                    : {}),
            },
        );

        await tx
            .update(drafts)
            .set({
                publishedAt: persistence.now(),
                publicationOperationId: input.operationId,
            })
            .where(eq(drafts.id, draftId));

        await conversationEvent(persistence, tx, id, 'draft-deleted', {
            draftId,
        });

        return note;
    });
}
