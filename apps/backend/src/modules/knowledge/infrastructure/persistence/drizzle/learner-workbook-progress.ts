import { and, eq, inArray, isNull } from 'drizzle-orm';
import { WorkbookProgressSchema } from '@languon/contracts';
import type { LearnerSourceAccess } from '../../../application/learner-store';
import type { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import {
    knowledgeUnavailable,
    lockKnowledgeOwner,
    type KnowledgeTransaction,
} from './knowledge-transaction';
import { knowledgeNotesTable as notes } from './schema';
import {
    knowledgeWorkbooksTable as workbooks,
    knowledgeWorkbookNotesTable as members,
    knowledgeWorkbookSharesTable as shares,
} from './workbook-schema';
import { knowledgeLearnerCompletionTable as completions } from './learner-schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';

/** Workbook lock freezes membership; actor-scoped completion never exposes classmates. */
export async function readLearnerWorkbookProgress(
    tx: KnowledgeTransaction,
    crypto: KnowledgeShareCrypto,
    actorId: string,
    workbookId: string,
    access?: LearnerSourceAccess,
) {
    await lockKnowledgeOwner(tx, actorId);
    const [workbook] = await tx
        .select()
        .from(workbooks)
        .where(and(eq(workbooks.id, workbookId), isNull(workbooks.deletedAt)))
        .for('share');

    if (!workbook) throw knowledgeUnavailable();

    if (access || workbook.ownerId !== actorId) {
        const [share] = await tx
            .select()
            .from(shares)
            .where(eq(shares.workbookId, workbookId))
            .for('share');

        if (
            access?.kind !== 'workbook' ||
            !share ||
            share.locator !== access.locator ||
            !crypto.verify(access.key, share.keyDigest)
        )
            throw knowledgeUnavailable();
    }

    const [owner] = await tx
        .select({ status: usersTable.status })
        .from(usersTable)
        .where(eq(usersTable.id, workbook.ownerId));

    if (owner?.status !== 'active') throw knowledgeUnavailable();

    const visible = await tx
        .select({ id: notes.id, version: notes.version })
        .from(members)
        .innerJoin(notes, eq(notes.id, members.noteId))
        .where(
            and(
                eq(members.workbookId, workbookId),
                eq(notes.ownerId, workbook.ownerId),
                eq(notes.status, 'saved'),
            ),
        )
        .for('share', { of: notes });
    const saved = visible.length
        ? await tx
              .select()
              .from(completions)
              .where(
                  and(
                      eq(completions.actorId, actorId),
                      inArray(
                          completions.noteId,
                          visible.map((note) => note.id),
                      ),
                  ),
              )
        : [];
    const byNote = new Map(saved.map((item) => [item.noteId, item.result]));
    let completedNotes = 0;
    let updatedSinceCompletion = 0;
    for (const note of visible) {
        const completion = byNote.get(note.id);
        if (!completion) continue;
        completedNotes += 1;
        if (note.version > completion.completedNoteVersion)
            updatedSinceCompletion += 1;
    }

    return WorkbookProgressSchema.parse({
        workbookId,
        workbookVersion: workbook.version,
        totalNotes: visible.length,
        completedNotes,
        updatedSinceCompletion,
    });
}
