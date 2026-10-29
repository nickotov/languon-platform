import { and, eq } from 'drizzle-orm';
import { knowledgeNotesTable } from '../../../../knowledge/infrastructure/persistence/drizzle/schema';
import { KnowledgeDomainError } from '../../../../knowledge/domain/knowledge';
import { conflict } from './conversation-persistence-context';
import type { ConversationsTransaction } from './conversation-source';

/** Hold the target stable until the enclosing proposal/publication transaction commits. */
export async function assertLegacyNoteTarget(
    tx: ConversationsTransaction,
    ownerId: string,
    noteId: string,
) {
    const [note] = await tx
        .select({ body: knowledgeNotesTable.body })
        .from(knowledgeNotesTable)
        .where(
            and(
                eq(knowledgeNotesTable.id, noteId),
                eq(knowledgeNotesTable.ownerId, ownerId),
            ),
        )
        .for('share');

    if (!note)
        throw new KnowledgeDomainError(
            'knowledge_not_found',
            'The knowledge note is unavailable.',
        );
    if (note.body.schemaVersion !== 1)
        throw conflict(
            'This note contains interactive blocks. Use block-aware editing instead of replacing it with a prose proposal.',
        );
}
