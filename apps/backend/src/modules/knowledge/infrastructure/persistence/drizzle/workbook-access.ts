import { and, eq, isNull } from 'drizzle-orm';
import type { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import {
    knowledgeUnavailable,
    type KnowledgeTransaction,
} from './knowledge-transaction';
import { knowledgeNotesTable } from './schema';
import {
    knowledgeWorkbooksTable as workbooks,
    knowledgeWorkbookNotesTable as members,
    knowledgeWorkbookSharesTable as shares,
} from './workbook-schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';

/** Holds publication/membership authority until the caller's transaction finishes. */
export async function readWorkbookSharedNote(
    tx: KnowledgeTransaction,
    crypto: KnowledgeShareCrypto,
    noteId: string,
    proof: { locator: string; key: string },
) {
    const [capability] = await tx
        .select()
        .from(shares)
        .where(eq(shares.locator, proof.locator));

    if (!capability || !crypto.verify(proof.key, capability.keyDigest))
        throw knowledgeUnavailable();
    const [workbook] = await tx
        .select()
        .from(workbooks)
        .where(
            and(
                eq(workbooks.id, capability.workbookId),
                isNull(workbooks.deletedAt),
            ),
        )
        .for('share');

    if (!workbook) throw knowledgeUnavailable();
    const [live] = await tx
        .select()
        .from(shares)
        .where(eq(shares.workbookId, workbook.id))
        .for('share');

    if (
        !live ||
        live.locator !== proof.locator ||
        !crypto.verify(proof.key, live.keyDigest)
    )
        throw knowledgeUnavailable();
    const [owner] = await tx
        .select({ status: usersTable.status })
        .from(usersTable)
        .where(eq(usersTable.id, workbook.ownerId));

    if (owner?.status !== 'active') throw knowledgeUnavailable();
    const [result] = await tx
        .select({ note: knowledgeNotesTable })
        .from(members)
        .innerJoin(
            knowledgeNotesTable,
            eq(members.noteId, knowledgeNotesTable.id),
        )
        .where(
            and(
                eq(members.workbookId, workbook.id),
                eq(members.noteId, noteId),
                eq(knowledgeNotesTable.ownerId, workbook.ownerId),
                eq(knowledgeNotesTable.status, 'saved'),
            ),
        )
        .for('share', { of: knowledgeNotesTable });

    if (!result) throw knowledgeUnavailable();

    return result.note;
}
