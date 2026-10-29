import { and, eq } from 'drizzle-orm';
import type { LearnerSourceAccess } from '../../../application/learner-store';
import type { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import { knowledgeNotesTable, knowledgeSharesTable } from './schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    knowledgeUnavailable,
    lockKnowledgeOwner,
    type KnowledgeTransaction,
} from './knowledge-transaction';
import { readWorkbookSharedNote } from './workbook-access';

/** Access is resolved again inside every learner transaction, including idempotent replay. */
export async function readLearnerNote(
    tx: KnowledgeTransaction,
    crypto: KnowledgeShareCrypto,
    actorId: string,
    noteId: string,
    access?: LearnerSourceAccess,
) {
    await lockKnowledgeOwner(tx, actorId);
    if (access?.kind === 'workbook')
        return readWorkbookSharedNote(tx, crypto, noteId, access);
    const [note] = await tx
        .select()
        .from(knowledgeNotesTable)
        .where(eq(knowledgeNotesTable.id, noteId))
        .for('share');

    if (!note || note.status !== 'saved') throw knowledgeUnavailable();
    const [owner] = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
            and(
                eq(usersTable.id, note.ownerId),
                eq(usersTable.status, 'active'),
            ),
        );

    if (!owner) throw knowledgeUnavailable();
    if (note.ownerId === actorId) return note;
    const [share] = await tx
        .select()
        .from(knowledgeSharesTable)
        .where(
            and(
                eq(knowledgeSharesTable.noteId, noteId),
                eq(knowledgeSharesTable.locator, access?.locator ?? ''),
            ),
        );

    if (
        access?.kind !== 'note' ||
        !crypto.verify(access.key, share?.keyDigest ?? null)
    )
        throw knowledgeUnavailable();

    return note;
}
