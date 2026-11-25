import { WorkbookSchema, type Workbook } from '@languon/contracts';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { KnowledgeTransaction } from './knowledge-transaction';
import { knowledgeNotesTable as notes } from './schema';
import type { knowledgeWorkbooksTable } from './workbook-schema';
import {
    knowledgeWorkbookNotesTable as members,
    knowledgeWorkbookSharesTable as shares,
} from './workbook-schema';

type WorkbookRow = typeof knowledgeWorkbooksTable.$inferSelect;

export async function readWorkbooks(
    tx: KnowledgeTransaction,
    ownerId: string,
    rows: WorkbookRow[],
): Promise<Workbook[]> {
    if (!rows.length) {
        return [];
    }

    const ids = rows.map((row) => row.id);
    const memberRows = await tx
        .select({
            workbookId: members.workbookId,
            id: notes.id,
            title: notes.title,
            status: notes.status,
        })
        .from(members)
        .innerJoin(notes, eq(members.noteId, notes.id))
        .where(
            and(inArray(members.workbookId, ids), eq(notes.ownerId, ownerId)),
        )
        .orderBy(
            asc(members.workbookId),
            asc(members.position),
            asc(members.noteId),
        );
    const shareRows = await tx
        .select({ id: shares.workbookId })
        .from(shares)
        .where(inArray(shares.workbookId, ids));

    const shared = new Set(shareRows.map((share) => share.id));
    const byWorkbook = new Map<string, Workbook['notes']>();
    for (const { workbookId, ...note } of memberRows) {
        const group = byWorkbook.get(workbookId);
        if (group) {
            group.push(note);
        } else {
            byWorkbook.set(workbookId, [note]);
        }
    }

    return rows.map((row) =>
        WorkbookSchema.parse({
            id: row.id,
            title: row.title,
            version: row.version,
            shared: shared.has(row.id),
            notes: byWorkbook.get(row.id) ?? [],
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
        }),
    );
}

export async function readWorkbook(tx: KnowledgeTransaction, row: WorkbookRow) {
    const [workbook] = await readWorkbooks(tx, row.ownerId, [row]);

    return workbook!;
}
