import { eq, sql } from 'drizzle-orm';
import { knowledgeNotesTable, knowledgeOperationReceiptsTable } from './schema';
import type { KnowledgeTransaction } from './knowledge-transaction';

/** Call after conversation cancellation/accounting quiescence and conversation-memory erasure.
 * Revision rows cascade; numeric external AI accounting is owned by its ledger. */
export async function eraseOwnerKnowledge(
    tx: KnowledgeTransaction,
    ownerId: string,
): Promise<void> {
    await tx
        .delete(knowledgeNotesTable)
        .where(eq(knowledgeNotesTable.ownerId, ownerId));
    await tx
        .delete(knowledgeOperationReceiptsTable)
        .where(eq(knowledgeOperationReceiptsTable.ownerId, ownerId));
}
export async function hasOwnerKnowledge(
    tx: KnowledgeTransaction,
    ownerId: string,
): Promise<boolean> {
    const rows = await tx.execute(
        sql`select 1 from knowledge_notes where owner_id=${ownerId}::uuid union all select 1 from knowledge_operation_receipts where owner_id=${ownerId}::uuid limit 1`,
    );
    return rows.length > 0;
}
