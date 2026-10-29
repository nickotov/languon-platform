import {
    KnowledgeNoteContentSchema,
    KnowledgeNoteRevisionSchema,
    type CreateKnowledgeNoteRequest,
    type DeleteKnowledgeNoteRequest,
    type ListKnowledgeQuery,
    type RestoreKnowledgeNoteRequest,
    type UpdateKnowledgeNoteRequest,
} from '@languon/contracts';
import { and, arrayContains, count, desc, eq, ilike, or } from 'drizzle-orm';
import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { deleteUnreferencedKnowledgeMedia } from './media-grants';
import { eraseKnowledgeSpeech } from '../../../../speech/infrastructure/knowledge-speech-lifecycle';
import { KnowledgeDomainError } from '../../../domain/knowledge';
import { type KnowledgeStoreContext } from './knowledge-persistence-support';
import {
    DrizzleKnowledgeTransactionParticipant,
    getOwnedKnowledgeNote,
    getOwnedKnowledgeRow,
    knowledgeFingerprint,
    knowledgeNote,
    knowledgeUnavailable,
    lockKnowledgeOwner,
    readKnowledgeReceipt,
    replaceKnowledgeContent,
    replayKnowledgeNote,
    writeKnowledgeReceipt,
} from './knowledge-transaction';
import { knowledgeNoteRevisionsTable, knowledgeNotesTable } from './schema';

export function list(
    persistence: KnowledgeStoreContext,
    ownerId: string,
    query: ListKnowledgeQuery,
) {
    return persistence.database.transaction(async (tx) => {
        await lockKnowledgeOwner(tx, ownerId);
        const search = query.q
            ? `%${query.q.replace(/[\\%_]/gu, '\\$&')}%`
            : undefined;
        const condition = and(
            eq(knowledgeNotesTable.ownerId, ownerId),
            eq(knowledgeNotesTable.status, 'saved'),
            query.category
                ? arrayContains(knowledgeNotesTable.categories, [
                      query.category,
                  ])
                : undefined,
            query.studiedLanguage
                ? eq(knowledgeNotesTable.studiedLanguage, query.studiedLanguage)
                : undefined,
            search
                ? or(
                      ilike(knowledgeNotesTable.title, search),
                      ilike(knowledgeNotesTable.summary, search),
                      ilike(knowledgeNotesTable.plainText, search),
                  )
                : undefined,
        );
        const [total] = await tx
            .select({ value: count() })
            .from(knowledgeNotesTable)
            .where(condition);
        const rows = await tx
            .select()
            .from(knowledgeNotesTable)
            .where(condition)
            .orderBy(
                desc(knowledgeNotesTable.updatedAt),
                desc(knowledgeNotesTable.id),
            )
            .offset(query.offset)
            .limit(query.limit);

        return {
            notes: rows.map(knowledgeNote),
            total: total?.value ?? 0,
            offset: query.offset,
            limit: query.limit,
        };
    });
}

export function get(
    persistence: KnowledgeStoreContext,
    ownerId: string,
    noteId: string,
) {
    return persistence.database.transaction((tx) =>
        getOwnedKnowledgeNote(tx, ownerId, noteId),
    );
}

export function create(
    persistence: KnowledgeStoreContext,
    ownerId: string,
    input: CreateKnowledgeNoteRequest,
) {
    return persistence.database.transaction((tx) =>
        new DrizzleKnowledgeTransactionParticipant(tx).publish(ownerId, input),
    );
}

export function update(
    persistence: KnowledgeStoreContext,
    ownerId: string,
    noteId: string,
    input: UpdateKnowledgeNoteRequest,
) {
    return persistence.database.transaction((tx) =>
        new DrizzleKnowledgeTransactionParticipant(tx).publish(ownerId, {
            ...input,
            noteId,
        }),
    );
}

export function revisions(
    persistence: KnowledgeStoreContext,
    ownerId: string,
    noteId: string,
) {
    return persistence.database.transaction(async (tx) => {
        await getOwnedKnowledgeNote(tx, ownerId, noteId);
        const rows = await tx
            .select()
            .from(knowledgeNoteRevisionsTable)
            .where(eq(knowledgeNoteRevisionsTable.noteId, noteId))
            .orderBy(desc(knowledgeNoteRevisionsTable.version));

        return rows.map((row) =>
            KnowledgeNoteRevisionSchema.parse({
                ...row,
                createdAt: row.createdAt.toISOString(),
            }),
        );
    });
}

export function restore(
    persistence: KnowledgeStoreContext,
    ownerId: string,
    noteId: string,
    input: RestoreKnowledgeNoteRequest,
) {
    return persistence.database.transaction(async (tx) => {
        await lockKnowledgeOwner(tx, ownerId);
        const fingerprint = knowledgeFingerprint({
            operation: 'restore',
            noteId,
            ...input,
        });
        const receipt = await readKnowledgeReceipt(
            tx,
            ownerId,
            input.operationId,
            fingerprint,
        );

        if (receipt) return replayKnowledgeNote(tx, ownerId, receipt);
        await getOwnedKnowledgeNote(tx, ownerId, noteId);
        const [revision] = await tx
            .select()
            .from(knowledgeNoteRevisionsTable)
            .where(
                and(
                    eq(knowledgeNoteRevisionsTable.noteId, noteId),
                    eq(
                        knowledgeNoteRevisionsTable.version,
                        input.revisionVersion,
                    ),
                ),
            );

        if (!revision) throw knowledgeUnavailable();
        const now = new Date();
        const note = await replaceKnowledgeContent(
            tx,
            ownerId,
            noteId,
            input.expectedVersion,
            KnowledgeNoteContentSchema.parse(revision.content),
            now,
        );

        await writeKnowledgeReceipt(tx, {
            ownerId,
            operationId: input.operationId,
            operation: 'restore',
            fingerprint,
            noteId,
            version: note.version,
            createdAt: now,
        });

        return note;
    });
}

export async function deleteNote(
    persistence: KnowledgeStoreContext,
    ownerId: string,
    noteId: string,
    input: DeleteKnowledgeNoteRequest,
): Promise<void> {
    await persistence.database.transaction(async (tx) => {
        await lockTextAiCapacity(tx);
        await lockKnowledgeOwner(tx, ownerId);
        const fingerprint = knowledgeFingerprint({
            operation: 'delete',
            noteId,
            ...input,
        });
        const receipt = await readKnowledgeReceipt(
            tx,
            ownerId,
            input.operationId,
            fingerprint,
        );

        if (receipt) return;
        const note = await getOwnedKnowledgeRow(tx, ownerId, noteId);
        if (note.version !== input.expectedVersion)
            throw new KnowledgeDomainError(
                'version_conflict',
                'The knowledge note changed. Reload it before deleting.',
            );
        const now = new Date();
        await eraseKnowledgeSpeech(tx, noteId);
        await persistence.lifecycle.beforeNoteDeletion(tx, {
            ownerId,
            noteId,
            now,
        });

        await tx
            .delete(knowledgeNotesTable)
            .where(
                and(
                    eq(knowledgeNotesTable.id, noteId),
                    eq(knowledgeNotesTable.ownerId, ownerId),
                ),
            );

        await deleteUnreferencedKnowledgeMedia(tx);

        await writeKnowledgeReceipt(tx, {
            ownerId,
            operationId: input.operationId,
            operation: 'delete',
            fingerprint,
            noteId,
            version: Math.max(1, note.version),
            createdAt: now,
        });
    });
}
