import {
    KnowledgeNoteContentSchema,
    KnowledgeWorkingBranchSchema,
    KnowledgeWorkingContentSchema,
    KnowledgeWorkspaceSchema,
    type ListKnowledgeQuery,
} from '@languon/contracts';
import { and, arrayContains, count, desc, eq, ilike, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { type KnowledgeStoreContext } from './knowledge-persistence-support';
import {
    getOwnedKnowledgeRow,
    knowledgeFingerprint,
    knowledgeNote,
    lockKnowledgeOwner,
    readKnowledgeReceipt,
    writeKnowledgeReceipt,
    type KnowledgeTransaction,
} from './knowledge-transaction';
import {
    knowledgeNotesTable,
    knowledgeSharesTable,
    knowledgeWorkingBranchesTable,
} from './schema';

export function readWorkingBranch(
    persistence: KnowledgeStoreContext,
    row: typeof knowledgeWorkingBranchesTable.$inferSelect,
) {
    return KnowledgeWorkingBranchSchema.parse({
        ...row,
        updatedAt: row.updatedAt.toISOString(),
    });
}

export async function ensureBranch(
    persistence: KnowledgeStoreContext,
    tx: KnowledgeTransaction,
    row: typeof knowledgeNotesTable.$inferSelect,
) {
    if (row.preferredBranchId) return row.preferredBranchId;
    const id = randomUUID();
    const content = KnowledgeWorkingContentSchema.parse({
        title: row.title,
        summary: row.summary,
        body: row.body,
        categories: row.categories,
        studiedLanguage: row.studiedLanguage,
        explanationLanguage: row.explanationLanguage,
    });

    await tx.insert(knowledgeWorkingBranchesTable).values({
        id,
        noteId: row.id,
        version: 1,
        basePublishedVersion: row.version,
        content,
        updatedAt: row.updatedAt,
    });

    await tx
        .update(knowledgeNotesTable)
        .set({ preferredBranchId: id })
        .where(eq(knowledgeNotesTable.id, row.id));

    return id;
}

export async function composeWorkspace(
    persistence: KnowledgeStoreContext,
    tx: KnowledgeTransaction,
    row: typeof knowledgeNotesTable.$inferSelect,
) {
    const preferredBranchId = await ensureBranch(persistence, tx, row);
    const [branches, share] = await Promise.all([
        tx
            .select()
            .from(knowledgeWorkingBranchesTable)
            .where(eq(knowledgeWorkingBranchesTable.noteId, row.id))
            .orderBy(desc(knowledgeWorkingBranchesTable.updatedAt)),
        tx
            .select({ noteId: knowledgeSharesTable.noteId })
            .from(knowledgeSharesTable)
            .where(eq(knowledgeSharesTable.noteId, row.id)),
    ]);

    return KnowledgeWorkspaceSchema.parse({
        noteId: row.id,
        status: row.status,
        published: row.status === 'saved' ? knowledgeNote(row) : null,
        branches: branches.map((branch) =>
            readWorkingBranch(persistence, branch),
        ),
        preferredBranchId,
        shareEnabled: share.length > 0,
        limits: persistence.limits,
    });
}

export async function getWorkspace(
    persistence: KnowledgeStoreContext,
    ownerId: string,
    noteId: string,
) {
    return persistence.database.transaction(async (tx) =>
        composeWorkspace(
            persistence,
            tx,
            await getOwnedKnowledgeRow(tx, ownerId, noteId),
        ),
    );
}

export async function listWorkspaces(
    persistence: KnowledgeStoreContext,
    ownerId: string,
    query: ListKnowledgeQuery,
) {
    return persistence.database.transaction(async (tx) => {
        await lockKnowledgeOwner(tx, ownerId);
        const condition = and(
            eq(knowledgeNotesTable.ownerId, ownerId),
            query.category
                ? arrayContains(knowledgeNotesTable.categories, [
                      query.category,
                  ])
                : undefined,
            query.studiedLanguage
                ? eq(knowledgeNotesTable.studiedLanguage, query.studiedLanguage)
                : undefined,
            query.q
                ? or(
                      ilike(
                          knowledgeNotesTable.title,
                          `%${query.q.replace(/[\\%_]/gu, '\\$&')}%`,
                      ),
                      ilike(
                          knowledgeNotesTable.summary,
                          `%${query.q.replace(/[\\%_]/gu, '\\$&')}%`,
                      ),
                      ilike(
                          knowledgeNotesTable.plainText,
                          `%${query.q.replace(/[\\%_]/gu, '\\$&')}%`,
                      ),
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
            .orderBy(desc(knowledgeNotesTable.updatedAt))
            .offset(query.offset)
            .limit(query.limit);
        const summaries = await Promise.all(
            rows.map(async (row) => {
                const branchId = await ensureBranch(persistence, tx, row);
                const [branch] = await tx
                    .select()
                    .from(knowledgeWorkingBranchesTable)
                    .where(eq(knowledgeWorkingBranchesTable.id, branchId));

                return {
                    id: row.id,
                    title: branch?.content.title ?? row.title,
                    status: row.status,
                    hasUnsavedChanges:
                        row.status === 'draft' ||
                        (branch?.basePublishedVersion ?? -1) !== row.version ||
                        knowledgeFingerprint(branch?.content) !==
                            knowledgeFingerprint({
                                title: row.title,
                                summary: row.summary,
                                body: row.body,
                                categories: row.categories,
                                studiedLanguage: row.studiedLanguage,
                                explanationLanguage: row.explanationLanguage,
                            }),
                    updatedAt:
                        branch?.updatedAt.toISOString() ??
                        row.updatedAt.toISOString(),
                };
            }),
        );

        return {
            workspaces: summaries,
            total: total?.value ?? 0,
            offset: query.offset,
            limit: query.limit,
        };
    });
}

export async function createDraft(
    persistence: KnowledgeStoreContext,
    ownerId: string,
    input: { operationId: string },
) {
    return persistence.database.transaction(async (tx) => {
        await lockKnowledgeOwner(tx, ownerId);
        const fingerprint = knowledgeFingerprint({
            operation: 'workspace-draft',
        });
        const receipt = await readKnowledgeReceipt(
            tx,
            ownerId,
            input.operationId,
            fingerprint,
        );

        if (receipt)
            return composeWorkspace(
                persistence,
                tx,
                await getOwnedKnowledgeRow(tx, ownerId, receipt.noteId),
            );
        const noteId = randomUUID(),
            branchId = randomUUID(),
            now = new Date();
        const content = KnowledgeNoteContentSchema.parse({
            title: 'Untitled',
            summary: '',
            categories: [],
            studiedLanguage: null,
            explanationLanguage: null,
            body: {
                schemaVersion: 1,
                document: { type: 'doc', content: [{ type: 'paragraph' }] },
            },
        });

        await tx.insert(knowledgeNotesTable).values({
            id: noteId,
            ownerId,
            ...content,
            plainText: '',
            version: 0,
            status: 'draft',
            preferredBranchId: branchId,
            autoTitleEligible: true,
            createdAt: now,
            updatedAt: now,
        });

        await tx.insert(knowledgeWorkingBranchesTable).values({
            id: branchId,
            noteId,
            version: 1,
            basePublishedVersion: 0,
            content,
            updatedAt: now,
        });

        await writeKnowledgeReceipt(tx, {
            ownerId,
            operationId: input.operationId,
            operation: 'create',
            fingerprint,
            noteId,
            version: 1,
            createdAt: now,
        });

        return composeWorkspace(
            persistence,
            tx,
            await getOwnedKnowledgeRow(tx, ownerId, noteId),
        );
    });
}
