import { readWorkingBranch } from './knowledge-workspace-access';
import {
    KnowledgeNoteContentSchema,
    KnowledgeWorkingContentSchema,
    type KnowledgeNoteContent,
    type KnowledgeWorkingContent,
} from '@languon/contracts';
import { and, count, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
    knowledgeBodyPlainText,
    KnowledgeDomainError,
} from '../../../domain/knowledge';
import { type KnowledgeStoreContext } from './knowledge-persistence-support';
import {
    getOwnedKnowledgeRow,
    knowledgeFingerprint,
    knowledgeNote,
    knowledgeUnavailable,
    readKnowledgeReceipt,
    replayKnowledgeNote,
    writeKnowledgeReceipt,
    type KnowledgeTransaction,
} from './knowledge-transaction';
import { composeWorkspace } from './knowledge-workspace-access';
import {
    knowledgeNoteRevisionsTable,
    knowledgeNotesTable,
    knowledgeWorkingBranchesTable,
} from './schema';

export async function updateWorking(
    persistence: KnowledgeStoreContext,
    ownerId: string,
    noteId: string,
    input: {
        operationId: string;
        branchId: string;
        expectedVersion: number;
        content: KnowledgeWorkingContent;
    },
) {
    return persistence.database.transaction(async (tx) => {
        const note = await getOwnedKnowledgeRow(tx, ownerId, noteId);
        const fingerprint = knowledgeFingerprint({
            operation: 'workspace-autosave',
            noteId,
            ...input,
        });
        const receipt = await readKnowledgeReceipt(
            tx,
            ownerId,
            input.operationId,
            fingerprint,
        );

        if (receipt) {
            const [replayed] = await tx
                .select()
                .from(knowledgeWorkingBranchesTable)
                .where(
                    and(
                        eq(knowledgeWorkingBranchesTable.id, receipt.noteId),
                        eq(knowledgeWorkingBranchesTable.noteId, noteId),
                    ),
                );

            if (!replayed) throw knowledgeUnavailable();
            const branches = await tx
                .select()
                .from(knowledgeWorkingBranchesTable)
                .where(eq(knowledgeWorkingBranchesTable.noteId, noteId))
                .orderBy(desc(knowledgeWorkingBranchesTable.updatedAt));

            return {
                branch: readWorkingBranch(persistence, replayed),
                conflict: replayed.id !== input.branchId,
                branches: branches.map((row) =>
                    readWorkingBranch(persistence, row),
                ),
            };
        }

        const [current] = await tx
            .select()
            .from(knowledgeWorkingBranchesTable)
            .where(
                and(
                    eq(knowledgeWorkingBranchesTable.id, input.branchId),
                    eq(knowledgeWorkingBranchesTable.noteId, noteId),
                ),
            )
            .for('update');

        if (!current) throw knowledgeUnavailable();
        const content = KnowledgeWorkingContentSchema.parse(input.content),
            now = new Date();
        const conflict = current.version !== input.expectedVersion;
        const id = conflict ? randomUUID() : current.id;
        const branch = conflict
            ? (
                  await tx
                      .insert(knowledgeWorkingBranchesTable)
                      .values({
                          id,
                          noteId,
                          version: 1,
                          basePublishedVersion: current.basePublishedVersion,
                          content,
                          updatedAt: now,
                      })
                      .returning()
              )[0]!
            : (
                  await tx
                      .update(knowledgeWorkingBranchesTable)
                      .set({
                          version: current.version + 1,
                          content,
                          updatedAt: now,
                      })
                      .where(eq(knowledgeWorkingBranchesTable.id, id))
                      .returning()
              )[0]!;

        await tx
            .update(knowledgeNotesTable)
            .set({
                preferredBranchId: id,
                updatedAt: now,
                ...(note.status === 'draft' ? { title: content.title } : {}),
                autoTitleEligible:
                    note.autoTitleEligible && content.title === 'Untitled',
            })
            .where(eq(knowledgeNotesTable.id, noteId));

        const branches = await tx
            .select()
            .from(knowledgeWorkingBranchesTable)
            .where(eq(knowledgeWorkingBranchesTable.noteId, noteId))
            .orderBy(desc(knowledgeWorkingBranchesTable.updatedAt));

        await writeKnowledgeReceipt(tx, {
            ownerId,
            operationId: input.operationId,
            operation: 'update',
            fingerprint,
            noteId: branch.id,
            version: branch.version,
            createdAt: now,
        });

        return {
            branch: readWorkingBranch(persistence, branch),
            conflict,
            branches: branches.map((row) =>
                readWorkingBranch(persistence, row),
            ),
        };
    });
}

export async function resolveWorking(
    persistence: KnowledgeStoreContext,
    ownerId: string,
    noteId: string,
    input: {
        operationId: string;
        keepBranchId: string;
        keepVersion: number;
        discardBranches: { id: string; expectedVersion: number }[];
    },
) {
    return persistence.database.transaction(async (tx) => {
        const row = await getOwnedKnowledgeRow(tx, ownerId, noteId);
        const fingerprint = knowledgeFingerprint({
            operation: 'workspace-resolve',
            noteId,
            ...input,
        });
        const receipt = await readKnowledgeReceipt(
            tx,
            ownerId,
            input.operationId,
            fingerprint,
        );

        if (receipt) return composeWorkspace(persistence, tx, row);
        const ids = [
            input.keepBranchId,
            ...input.discardBranches.map((branch) => branch.id),
        ];

        if (new Set(ids).size !== ids.length)
            throw new KnowledgeDomainError(
                'invalid_request',
                'Choose distinct working versions to resolve.',
            );
        const branches = await tx
            .select()
            .from(knowledgeWorkingBranchesTable)
            .where(eq(knowledgeWorkingBranchesTable.noteId, noteId))
            .for('update');
        const byId = new Map(branches.map((branch) => [branch.id, branch]));
        if (
            byId.get(input.keepBranchId)?.version !== input.keepVersion ||
            input.discardBranches.some(
                (branch) =>
                    byId.get(branch.id)?.version !== branch.expectedVersion,
            )
        )
            throw new KnowledgeDomainError(
                'version_conflict',
                'A working version changed. Reload both versions before resolving.',
            );
        const now = new Date();
        const discardedIds = new Set(
            input.discardBranches.map((branch) => branch.id),
        );
        const unresolved = branches.some(
            (branch) =>
                branch.id !== input.keepBranchId &&
                !discardedIds.has(branch.id),
        );
        const kept = byId.get(input.keepBranchId)!;
        if (!unresolved && kept.basePublishedVersion !== row.version) {
            await tx
                .update(knowledgeWorkingBranchesTable)
                .set({
                    basePublishedVersion: row.version,
                    version: kept.version + 1,
                    updatedAt: now,
                })
                .where(eq(knowledgeWorkingBranchesTable.id, kept.id));
        }

        await tx
            .update(knowledgeNotesTable)
            .set({
                preferredBranchId: input.keepBranchId,
                updatedAt: now,
                ...(row.status === 'draft'
                    ? { title: byId.get(input.keepBranchId)!.content.title }
                    : {}),
            })
            .where(eq(knowledgeNotesTable.id, noteId));

        for (const branch of input.discardBranches)
            await tx
                .delete(knowledgeWorkingBranchesTable)
                .where(eq(knowledgeWorkingBranchesTable.id, branch.id));
        await writeKnowledgeReceipt(tx, {
            ownerId,
            operationId: input.operationId,
            operation: 'update',
            fingerprint,
            noteId,
            version: Math.max(1, row.version),
            createdAt: now,
        });

        return composeWorkspace(persistence, tx, {
            ...row,
            preferredBranchId: input.keepBranchId,
            updatedAt: now,
        });
    });
}

export async function workingAtVersion(
    persistence: KnowledgeStoreContext,
    tx: KnowledgeTransaction,
    noteId: string,
    branchId: string,
    expectedVersion: number,
) {
    const [branch] = await tx
        .select()
        .from(knowledgeWorkingBranchesTable)
        .where(
            and(
                eq(knowledgeWorkingBranchesTable.id, branchId),
                eq(knowledgeWorkingBranchesTable.noteId, noteId),
            ),
        )
        .for('update');

    if (!branch) throw knowledgeUnavailable();
    if (branch.version !== expectedVersion)
        throw new KnowledgeDomainError(
            'version_conflict',
            'The working draft changed. Compare both versions before saving.',
        );

    return branch;
}

export function assertSaveable(
    persistence: KnowledgeStoreContext,
    content: KnowledgeWorkingContent,
): KnowledgeNoteContent {
    if (!content.title.trim() || !knowledgeBodyPlainText(content.body))
        throw new KnowledgeDomainError(
            'invalid_request',
            'Add a title and document content before saving.',
        );

    return KnowledgeNoteContentSchema.parse(content);
}

export async function saveWorkspace(
    persistence: KnowledgeStoreContext,
    ownerId: string,
    noteId: string,
    input: {
        operationId: string;
        branchId: string;
        expectedVersion: number;
        expectedPublishedVersion: number;
    },
) {
    return persistence.database.transaction(async (tx) => {
        const row = await getOwnedKnowledgeRow(tx, ownerId, noteId);
        const fingerprint = knowledgeFingerprint({
            operation: 'workspace-save',
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
        const branch = await workingAtVersion(
            persistence,
            tx,
            noteId,
            input.branchId,
            input.expectedVersion,
        );
        const [alternatives] = await tx
            .select({ value: count() })
            .from(knowledgeWorkingBranchesTable)
            .where(eq(knowledgeWorkingBranchesTable.noteId, noteId));

        if ((alternatives?.value ?? 0) > 1)
            throw new KnowledgeDomainError(
                'version_conflict',
                'Compare and resolve working versions before saving.',
            );
        if (
            row.version !== input.expectedPublishedVersion ||
            branch.basePublishedVersion !== input.expectedPublishedVersion
        )
            throw new KnowledgeDomainError(
                'version_conflict',
                'The saved note changed. Compare versions before saving.',
            );
        const savedContent = assertSaveable(persistence, branch.content);
        const now = new Date(),
            version = row.version + 1;
        const [saved] = await tx
            .update(knowledgeNotesTable)
            .set({
                ...savedContent,
                plainText: knowledgeBodyPlainText(savedContent.body),
                status: 'saved',
                version,
                preferredBranchId: branch.id,
                updatedAt: now,
                autoTitleEligible: false,
            })
            .where(eq(knowledgeNotesTable.id, noteId))
            .returning();

        await tx.insert(knowledgeNoteRevisionsTable).values({
            noteId,
            version,
            content: savedContent,
            createdAt: now,
        });

        await tx
            .update(knowledgeWorkingBranchesTable)
            .set({ basePublishedVersion: version })
            .where(eq(knowledgeWorkingBranchesTable.id, branch.id));

        await writeKnowledgeReceipt(tx, {
            ownerId,
            operationId: input.operationId,
            operation: 'update',
            fingerprint,
            noteId,
            version,
            createdAt: now,
        });

        return knowledgeNote(saved!);
    });
}

export async function saveWorkspaceCopy(
    persistence: KnowledgeStoreContext,
    ownerId: string,
    noteId: string,
    input: {
        operationId: string;
        branchId: string;
        expectedVersion: number;
    },
) {
    return persistence.database.transaction(async (tx) => {
        await getOwnedKnowledgeRow(tx, ownerId, noteId);
        const fingerprint = knowledgeFingerprint({
            operation: 'workspace-copy',
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
        const branch = await workingAtVersion(
            persistence,
            tx,
            noteId,
            input.branchId,
            input.expectedVersion,
        );
        const savedContent = assertSaveable(persistence, branch.content);
        const now = new Date(),
            id = randomUUID(),
            copyBranchId = randomUUID();
        const [copy] = await tx
            .insert(knowledgeNotesTable)
            .values({
                id,
                ownerId,
                ...savedContent,
                plainText: knowledgeBodyPlainText(savedContent.body),
                version: 1,
                status: 'saved',
                preferredBranchId: copyBranchId,
                createdAt: now,
                updatedAt: now,
            })
            .returning();

        await tx.insert(knowledgeNoteRevisionsTable).values({
            noteId: id,
            version: 1,
            content: savedContent,
            createdAt: now,
        });

        await tx.insert(knowledgeWorkingBranchesTable).values({
            id: copyBranchId,
            noteId: id,
            version: 1,
            basePublishedVersion: 1,
            content: savedContent,
            updatedAt: now,
        });

        await writeKnowledgeReceipt(tx, {
            ownerId,
            operationId: input.operationId,
            operation: 'create',
            fingerprint,
            noteId: id,
            version: 1,
            createdAt: now,
        });

        return knowledgeNote(copy!);
    });
}
