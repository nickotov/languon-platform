import {
    KnowledgeNoteContentSchema,
    KnowledgeWorkingContentSchema,
    KnowledgeWorkspaceSchema,
    KnowledgeWorkingBranchSchema,
    KnowledgeNoteRevisionSchema,
    type CreateKnowledgeNoteRequest,
    type DeleteKnowledgeNoteRequest,
    type ListKnowledgeQuery,
    type RestoreKnowledgeNoteRequest,
    type UpdateKnowledgeNoteRequest,
    type KnowledgeNoteContent,
    type KnowledgeWorkingContent,
} from '@languon/contracts';
import { randomUUID } from 'node:crypto';
import { and, arrayContains, count, desc, eq, ilike, or } from 'drizzle-orm';
import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import type { KnowledgeStore } from '../../../application/knowledge-store';
import { KnowledgeDomainError } from '../../../domain/knowledge';
import { knowledgeBodyPlainText } from '../../../domain/knowledge';
import type { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
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
    type KnowledgeDatabase,
    type KnowledgeTransaction,
} from './knowledge-transaction';
import {
    knowledgeNoteRevisionsTable,
    knowledgeNotesTable,
    knowledgeWorkingBranchesTable,
    knowledgeSharesTable,
} from './schema';

export interface KnowledgeLifecycleParticipant {
    /** Remove/fence source-bound conversations in this transaction; reject unsettled work safely. */
    beforeNoteDeletion(
        tx: KnowledgeTransaction,
        input: { ownerId: string; noteId: string; now: Date },
    ): Promise<void>;
}
export class DrizzleKnowledgeStore implements KnowledgeStore {
    constructor(
        private readonly database: KnowledgeDatabase,
        private readonly lifecycle: KnowledgeLifecycleParticipant,
        private readonly shareCrypto: KnowledgeShareCrypto,
        private readonly limits = {
            referenceChars: 40_000,
            editorChars: 40_000,
        },
    ) {}
    list(ownerId: string, query: ListKnowledgeQuery) {
        return this.database.transaction(async (tx) => {
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
                    ? eq(
                          knowledgeNotesTable.studiedLanguage,
                          query.studiedLanguage,
                      )
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
    get(ownerId: string, noteId: string) {
        return this.database.transaction((tx) =>
            getOwnedKnowledgeNote(tx, ownerId, noteId),
        );
    }
    create(ownerId: string, input: CreateKnowledgeNoteRequest) {
        return this.database.transaction((tx) =>
            new DrizzleKnowledgeTransactionParticipant(tx).publish(
                ownerId,
                input,
            ),
        );
    }
    update(ownerId: string, noteId: string, input: UpdateKnowledgeNoteRequest) {
        return this.database.transaction((tx) =>
            new DrizzleKnowledgeTransactionParticipant(tx).publish(ownerId, {
                ...input,
                noteId,
            }),
        );
    }
    revisions(ownerId: string, noteId: string) {
        return this.database.transaction(async (tx) => {
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
    restore(
        ownerId: string,
        noteId: string,
        input: RestoreKnowledgeNoteRequest,
    ) {
        return this.database.transaction(async (tx) => {
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
    async delete(
        ownerId: string,
        noteId: string,
        input: DeleteKnowledgeNoteRequest,
    ): Promise<void> {
        await this.database.transaction(async (tx) => {
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
            await this.lifecycle.beforeNoteDeletion(tx, {
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

    private branch(row: typeof knowledgeWorkingBranchesTable.$inferSelect) {
        return KnowledgeWorkingBranchSchema.parse({
            ...row,
            updatedAt: row.updatedAt.toISOString(),
        });
    }
    private async ensureBranch(
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
    private async workspace(
        tx: KnowledgeTransaction,
        row: typeof knowledgeNotesTable.$inferSelect,
    ) {
        const preferredBranchId = await this.ensureBranch(tx, row);
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
            branches: branches.map((branch) => this.branch(branch)),
            preferredBranchId,
            shareEnabled: share.length > 0,
            limits: this.limits,
        });
    }
    async getWorkspace(ownerId: string, noteId: string) {
        return this.database.transaction(async (tx) =>
            this.workspace(tx, await getOwnedKnowledgeRow(tx, ownerId, noteId)),
        );
    }
    async listWorkspaces(ownerId: string, query: ListKnowledgeQuery) {
        return this.database.transaction(async (tx) => {
            await lockKnowledgeOwner(tx, ownerId);
            const condition = and(
                eq(knowledgeNotesTable.ownerId, ownerId),
                query.category
                    ? arrayContains(knowledgeNotesTable.categories, [
                          query.category,
                      ])
                    : undefined,
                query.studiedLanguage
                    ? eq(
                          knowledgeNotesTable.studiedLanguage,
                          query.studiedLanguage,
                      )
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
                    const branchId = await this.ensureBranch(tx, row);
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
                            (branch?.basePublishedVersion ?? -1) !==
                                row.version ||
                            knowledgeFingerprint(branch?.content) !==
                                knowledgeFingerprint({
                                    title: row.title,
                                    summary: row.summary,
                                    body: row.body,
                                    categories: row.categories,
                                    studiedLanguage: row.studiedLanguage,
                                    explanationLanguage:
                                        row.explanationLanguage,
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
    async createDraft(ownerId: string, input: { operationId: string }) {
        return this.database.transaction(async (tx) => {
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
                return this.workspace(
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
            return this.workspace(
                tx,
                await getOwnedKnowledgeRow(tx, ownerId, noteId),
            );
        });
    }
    async updateWorking(
        ownerId: string,
        noteId: string,
        input: {
            operationId: string;
            branchId: string;
            expectedVersion: number;
            content: KnowledgeWorkingContent;
        },
    ) {
        return this.database.transaction(async (tx) => {
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
                            eq(
                                knowledgeWorkingBranchesTable.id,
                                receipt.noteId,
                            ),
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
                    branch: this.branch(replayed),
                    conflict: replayed.id !== input.branchId,
                    branches: branches.map((row) => this.branch(row)),
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
                              basePublishedVersion:
                                  current.basePublishedVersion,
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
                    ...(note.status === 'draft'
                        ? { title: content.title }
                        : {}),
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
                branch: this.branch(branch),
                conflict,
                branches: branches.map((row) => this.branch(row)),
            };
        });
    }
    async resolveWorking(
        ownerId: string,
        noteId: string,
        input: {
            operationId: string;
            keepBranchId: string;
            keepVersion: number;
            discardBranches: { id: string; expectedVersion: number }[];
        },
    ) {
        return this.database.transaction(async (tx) => {
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
            if (receipt) return this.workspace(tx, row);
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
            return this.workspace(tx, {
                ...row,
                preferredBranchId: input.keepBranchId,
                updatedAt: now,
            });
        });
    }
    private async workingAtVersion(
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
    private assertSaveable(
        content: KnowledgeWorkingContent,
    ): KnowledgeNoteContent {
        if (!content.title.trim() || !knowledgeBodyPlainText(content.body))
            throw new KnowledgeDomainError(
                'invalid_request',
                'Add a title and document content before saving.',
            );
        return KnowledgeNoteContentSchema.parse(content);
    }
    async saveWorkspace(
        ownerId: string,
        noteId: string,
        input: {
            operationId: string;
            branchId: string;
            expectedVersion: number;
            expectedPublishedVersion: number;
        },
    ) {
        return this.database.transaction(async (tx) => {
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
            const branch = await this.workingAtVersion(
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
            const savedContent = this.assertSaveable(branch.content);
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
    async saveWorkspaceCopy(
        ownerId: string,
        noteId: string,
        input: {
            operationId: string;
            branchId: string;
            expectedVersion: number;
        },
    ) {
        return this.database.transaction(async (tx) => {
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
            const branch = await this.workingAtVersion(
                tx,
                noteId,
                input.branchId,
                input.expectedVersion,
            );
            const savedContent = this.assertSaveable(branch.content);
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
    async getShare(ownerId: string, noteId: string) {
        return this.database.transaction(async (tx) => {
            const row = await getOwnedKnowledgeRow(tx, ownerId, noteId);
            if (row.status !== 'saved') throw knowledgeUnavailable();
            const [share] = await tx
                .select()
                .from(knowledgeSharesTable)
                .where(eq(knowledgeSharesTable.noteId, noteId));
            if (!share) throw knowledgeUnavailable();
            const key = this.shareCrypto.key(share.locator);
            if (!this.shareCrypto.verify(key, share.keyDigest))
                throw knowledgeUnavailable();
            return { locator: share.locator, key };
        });
    }
    async issueShare(ownerId: string, noteId: string) {
        return this.database.transaction(async (tx) => {
            const row = await getOwnedKnowledgeRow(tx, ownerId, noteId);
            if (row.status !== 'saved')
                throw new KnowledgeDomainError(
                    'invalid_request',
                    'Save the note before sharing.',
                );
            const [existing] = await tx
                .select()
                .from(knowledgeSharesTable)
                .where(eq(knowledgeSharesTable.noteId, noteId))
                .for('update');
            if (existing) {
                const key = this.shareCrypto.key(existing.locator);
                if (!this.shareCrypto.verify(key, existing.keyDigest))
                    throw knowledgeUnavailable();
                return { locator: existing.locator, key };
            }
            const locator = this.shareCrypto.locator(),
                key = this.shareCrypto.key(locator);
            await tx.insert(knowledgeSharesTable).values({
                noteId,
                locator,
                keyDigest: this.shareCrypto.digest(key),
                version: 1,
                createdAt: new Date(),
            });
            return { locator, key };
        });
    }
    async revokeShare(ownerId: string, noteId: string) {
        return this.database.transaction(async (tx) => {
            await getOwnedKnowledgeRow(tx, ownerId, noteId);
            await tx
                .delete(knowledgeSharesTable)
                .where(eq(knowledgeSharesTable.noteId, noteId));
            return { disabled: true as const };
        });
    }
    private async shared(
        tx: KnowledgeTransaction,
        locator: string,
        key: string,
    ) {
        const [share] = await tx
            .select()
            .from(knowledgeSharesTable)
            .where(eq(knowledgeSharesTable.locator, locator));
        const valid = this.shareCrypto.verify(key, share?.keyDigest ?? null);
        if (!valid || !share) throw knowledgeUnavailable();
        const [row] = await tx
            .select()
            .from(knowledgeNotesTable)
            .where(eq(knowledgeNotesTable.id, share.noteId))
            .for('share');
        if (!row || row.status !== 'saved') throw knowledgeUnavailable();
        // Revocation locks the note before deleting this capability. Recheck
        // after the note lock so a queued read cannot use a revoked key.
        const [liveShare] = await tx
            .select()
            .from(knowledgeSharesTable)
            .where(eq(knowledgeSharesTable.noteId, row.id))
            .for('share');
        if (
            !liveShare ||
            liveShare.locator !== locator ||
            !this.shareCrypto.verify(key, liveShare.keyDigest)
        )
            throw knowledgeUnavailable();
        const [owner] = await tx
            .select({ status: usersTable.status })
            .from(usersTable)
            .where(eq(usersTable.id, row.ownerId));
        if (owner?.status !== 'active') throw knowledgeUnavailable();
        return row;
    }
    async readShared(locator: string, key: string) {
        return this.database.transaction(async (tx) =>
            knowledgeNote(await this.shared(tx, locator, key)),
        );
    }
    async copyShared(
        ownerId: string,
        locator: string,
        key: string,
        input: { operationId: string; expectedVersion: number },
    ) {
        return this.database.transaction(async (tx) => {
            await lockKnowledgeOwner(tx, ownerId);
            const fingerprint = knowledgeFingerprint({
                operation: 'shared-copy',
                locator,
                ...input,
            });
            const receipt = await readKnowledgeReceipt(
                tx,
                ownerId,
                input.operationId,
                fingerprint,
            );
            if (receipt) return replayKnowledgeNote(tx, ownerId, receipt);
            const row = await this.shared(tx, locator, key);
            if (row.version !== input.expectedVersion)
                throw new KnowledgeDomainError(
                    'version_conflict',
                    'The shared note changed. Refresh it before copying.',
                );
            const content = KnowledgeNoteContentSchema.parse({
                title: row.title,
                summary: row.summary,
                body: row.body,
                categories: row.categories,
                studiedLanguage: row.studiedLanguage,
                explanationLanguage: row.explanationLanguage,
            });
            const now = new Date(),
                id = randomUUID(),
                branchId = randomUUID();
            const [copy] = await tx
                .insert(knowledgeNotesTable)
                .values({
                    id,
                    ownerId,
                    ...content,
                    plainText: row.plainText,
                    version: 1,
                    status: 'saved',
                    preferredBranchId: branchId,
                    createdAt: now,
                    updatedAt: now,
                })
                .returning();
            await tx
                .insert(knowledgeNoteRevisionsTable)
                .values({ noteId: id, version: 1, content, createdAt: now });
            await tx.insert(knowledgeWorkingBranchesTable).values({
                id: branchId,
                noteId: id,
                version: 1,
                basePublishedVersion: 1,
                content,
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
}
