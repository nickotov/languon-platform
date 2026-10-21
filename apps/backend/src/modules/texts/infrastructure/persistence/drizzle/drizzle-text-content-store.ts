import {
    getTableColumns,
    and,
    asc,
    desc,
    eq,
    gt,
    inArray,
    isNull,
    ne,
    or,
    sql,
} from 'drizzle-orm';
import type {
    CreateTextFolderRequest,
    UpdateTextFolderRequest,
    CreateTextRequest,
    SaveTextRequest,
    MoveTextRequest,
    TextAlignment,
} from '@languon/contracts';
import type {
    TextContentStore,
    TextPage,
    TextShareAccess,
} from '../../../application/ports/text-content-store';
import {
    applyTextEdits,
    assertTextVersion,
    resolveTextTitle,
    TextDomainError,
} from '../../../domain/text';
import type { DictionaryCryptography } from '../../../../dictionaries/application/ports/dictionary-cryptography';
import {
    textFoldersTable,
    textsTable,
    textRevisionsTable,
    textSharesTable,
    textIdempotencyTable,
} from './schema';
import {
    textDocument,
    textFolder,
    type TextsContentDatabase,
    type TextsContentTransaction,
    type TextRow,
} from './text-content-support';
import { textNotFound } from './text-source-resolver';
import { exposeTextsJob } from './texts-job-support';
import { textsAiJobsTable } from './texts-job-schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';

export interface TextProposalSaveInput {
    ownerId: string;
    jobId: string;
    textId: string;
    expectedVersion: number;
    folderId: string | null;
    now: Date;
}
export type TextProposalLoader = (
    tx: TextsContentTransaction,
    input: TextProposalSaveInput,
) => Promise<{
    sourceText: string;
    sourceLanguage: string;
    targetLanguage: string;
    alignment: TextAlignment;
}>;
export class DrizzleTextContentStore implements TextContentStore {
    constructor(
        private readonly db: TextsContentDatabase,
        private readonly ids: { generate(): string },
        private readonly clock: { now(): Date },
        private readonly crypto: DictionaryCryptography,
        private readonly proposal?: TextProposalLoader,
    ) {}
    private async activeOwner(tx: TextsContentTransaction, ownerId: string) {
        const [owner] = await tx
            .select({ status: usersTable.status })
            .from(usersTable)
            .where(eq(usersTable.id, ownerId))
            .for('share');
        if (owner?.status !== 'active') throw textNotFound();
    }
    private async folder(
        tx: TextsContentTransaction,
        ownerId: string,
        id: string,
        active = true,
    ) {
        await this.activeOwner(tx, ownerId);
        const [row] = await tx
            .select()
            .from(textFoldersTable)
            .where(
                and(
                    eq(textFoldersTable.id, id),
                    eq(textFoldersTable.ownerId, ownerId),
                ),
            )
            .for('update');
        if (!row || (active && row.lifecycle !== 'active'))
            throw textNotFound();
        return row;
    }
    private async text(
        tx: TextsContentTransaction,
        ownerId: string,
        id: string,
        active = true,
    ) {
        const [candidate] = await tx
            .select()
            .from(textsTable)
            .where(and(eq(textsTable.id, id), eq(textsTable.ownerId, ownerId)));
        if (!candidate) throw textNotFound();
        await this.activeOwner(tx, ownerId);
        if (candidate.folderId)
            await this.folder(tx, ownerId, candidate.folderId);
        const [row] = await tx
            .select()
            .from(textsTable)
            .where(eq(textsTable.id, id))
            .for('update');
        if (!row || (active && row.lifecycle !== 'active'))
            throw textNotFound();
        if (row.folderId !== candidate.folderId)
            throw new TextDomainError(
                'version_conflict',
                'The text moved. Reload it and try again.',
            );
        return row;
    }
    private async revision(tx: TextsContentTransaction, row: TextRow) {
        await tx.insert(textRevisionsTable).values({
            id: this.ids.generate(),
            ownerId: row.ownerId,
            textId: row.id,
            version: row.version,
            snapshot: textDocument(row),
            createdAt: this.clock.now(),
        });
    }
    async listFolders(ownerId: string, page: TextPage) {
        const rows = await this.db
            .select({
                ...getTableColumns(textFoldersTable),
                textCount: sql<number>`(select count(*)::int from texts t where t.owner_id = "text_folders"."owner_id" and t.folder_id = "text_folders"."id" and t.lifecycle = 'active')`,
                translatedCount: sql<number>`(select count(*)::int from texts t where t.owner_id = "text_folders"."owner_id" and t.folder_id = "text_folders"."id" and t.lifecycle = 'active' and t.status <> 'draft')`,
                shareId: sql<
                    string | null
                >`(select s.id from text_shares s where s.kind = 'folder' and s.resource_id = "text_folders"."id")`,
                shareVersion: sql<
                    number | null
                >`(select s.version from text_shares s where s.kind = 'folder' and s.resource_id = "text_folders"."id")`,
                isShared: sql<boolean>`${textFoldersTable.lifecycle} = 'active' and exists(select 1 from text_shares s where s.kind = 'folder' and s.resource_id = "text_folders"."id")`,
            })
            .from(textFoldersTable)
            .where(
                and(
                    eq(textFoldersTable.ownerId, ownerId),
                    eq(textFoldersTable.lifecycle, page.lifecycle ?? 'active'),
                    page.cursor
                        ? gt(textFoldersTable.id, page.cursor)
                        : undefined,
                ),
            )
            .orderBy(asc(textFoldersTable.id))
            .limit(page.limit + 1);
        return {
            items: rows.slice(0, page.limit).map((row) => ({
                ...textFolder(row),
                textCount: row.textCount,
                translatedCount: row.translatedCount,
                isShared: row.isShared,
                shareId: row.shareId,
                shareVersion: row.shareVersion,
            })),
            nextCursor:
                rows.length > page.limit ? rows[page.limit - 1]!.id : null,
        };
    }
    async createFolder(ownerId: string, request: CreateTextFolderRequest) {
        return this.db.transaction(async (tx) => {
            await this.activeOwner(tx, ownerId);
            const now = this.clock.now();
            const [row] = await tx
                .insert(textFoldersTable)
                .values({
                    id: this.ids.generate(),
                    ownerId,
                    name: request.name,
                    description: request.description,
                    createdAt: now,
                    updatedAt: now,
                })
                .returning();
            return textFolder(row!);
        });
    }
    async updateFolder(
        ownerId: string,
        id: string,
        request: UpdateTextFolderRequest,
    ) {
        return this.db.transaction(async (tx) => {
            const row = await this.folder(tx, ownerId, id);
            assertTextVersion(row.version, request.expectedVersion);
            const [updated] = await tx
                .update(textFoldersTable)
                .set({
                    ...(request.name !== undefined
                        ? { name: request.name }
                        : {}),
                    ...(request.description !== undefined
                        ? { description: request.description }
                        : {}),
                    version: row.version + 1,
                    updatedAt: this.clock.now(),
                })
                .where(eq(textFoldersTable.id, id))
                .returning();
            return textFolder(updated!);
        });
    }
    async folderLifecycle(
        ownerId: string,
        id: string,
        expectedVersion: number,
        lifecycle: 'active' | 'archived',
    ) {
        return this.db.transaction(async (tx) => {
            const row = await this.folder(tx, ownerId, id, false);
            assertTextVersion(row.version, expectedVersion);
            if (row.lifecycle === lifecycle) return textFolder(row);
            const [updated] = await tx
                .update(textFoldersTable)
                .set({
                    lifecycle,
                    version: row.version + 1,
                    updatedAt: this.clock.now(),
                })
                .where(eq(textFoldersTable.id, id))
                .returning();
            await tx
                .delete(textSharesTable)
                .where(
                    and(
                        eq(textSharesTable.ownerId, ownerId),
                        or(
                            and(
                                eq(textSharesTable.kind, 'folder'),
                                eq(textSharesTable.resourceId, id),
                            ),
                            and(
                                eq(textSharesTable.kind, 'text'),
                                inArray(
                                    textSharesTable.resourceId,
                                    tx
                                        .select({ id: textsTable.id })
                                        .from(textsTable)
                                        .where(eq(textsTable.folderId, id)),
                                ),
                            ),
                        ),
                    ),
                );
            return textFolder(updated!);
        });
    }
    async listTexts(ownerId: string, folderId: string | null, page: TextPage) {
        return this.db.transaction(async (tx) => {
            await this.activeOwner(tx, ownerId);
            if (folderId) await this.folder(tx, ownerId, folderId);
            const rows = await tx
                .select({
                    ...getTableColumns(textsTable),
                    isShared: sql<boolean>`${textsTable.lifecycle} = 'active' and ${textsTable.status} <> 'draft' and exists(select 1 from text_shares s where s.kind = 'text' and s.resource_id = "texts"."id")`,
                })
                .from(textsTable)
                .where(
                    and(
                        eq(textsTable.ownerId, ownerId),
                        folderId === null
                            ? isNull(textsTable.folderId)
                            : eq(textsTable.folderId, folderId),
                        eq(textsTable.lifecycle, page.lifecycle ?? 'active'),
                        page.cursor
                            ? gt(textsTable.id, page.cursor)
                            : undefined,
                    ),
                )
                .orderBy(asc(textsTable.id))
                .limit(page.limit + 1);
            return {
                items: rows.slice(0, page.limit).map((row) => ({
                    ...textDocument(row),
                    isShared: row.isShared,
                })),
                nextCursor:
                    rows.length > page.limit ? rows[page.limit - 1]!.id : null,
            };
        });
    }
    private async confirmDestination(
        tx: TextsContentTransaction,
        folderId: string,
        confirmed?: { shareId: string; shareVersion: number },
    ) {
        const [share] = await tx
            .select()
            .from(textSharesTable)
            .where(
                and(
                    eq(textSharesTable.kind, 'folder'),
                    eq(textSharesTable.resourceId, folderId),
                ),
            )
            .for('update');
        if (
            (share &&
                (!confirmed ||
                    confirmed.shareId !== share.id ||
                    confirmed.shareVersion !== share.version)) ||
            (!share && confirmed)
        )
            throw new TextDomainError(
                'shared_folder_confirmation_required',
                'Folder sharing changed. Confirm that saved translations, including future translations, will be visible through this folder.',
            );
    }
    async pendingJob(ownerId: string, id: string) {
        return this.db.transaction(async (tx) => {
            const row = await this.text(tx, ownerId, id);
            const [job] = await tx
                .select()
                .from(textsAiJobsTable)
                .where(
                    and(
                        eq(textsAiJobsTable.ownerId, ownerId),
                        eq(textsAiJobsTable.textId, id),
                        or(
                            inArray(textsAiJobsTable.executionState, [
                                'queued',
                                'running',
                            ]),
                            and(
                                eq(
                                    textsAiJobsTable.executionState,
                                    'completed',
                                ),
                                eq(
                                    textsAiJobsTable.jobKind,
                                    'text-translation',
                                ),
                                eq(
                                    textsAiJobsTable.expectedTextVersion,
                                    row.version,
                                ),
                                row.folderId === null
                                    ? isNull(textsAiJobsTable.folderId)
                                    : eq(
                                          textsAiJobsTable.folderId,
                                          row.folderId,
                                      ),
                                gt(
                                    textsAiJobsTable.expiresAt,
                                    this.clock.now(),
                                ),
                                isNull(
                                    textsAiJobsTable.cancellationRequestedAt,
                                ),
                                isNull(textsAiJobsTable.appliedTextId),
                            ),
                        ),
                    ),
                )
                .orderBy(
                    sql`case when ${textsAiJobsTable.executionState} in ('queued','running') then 0 else 1 end`,
                    sql`case when ${textsAiJobsTable.executionState} in ('queued','running') then ${textsAiJobsTable.createdAt} end asc`,
                    desc(textsAiJobsTable.createdAt),
                    desc(textsAiJobsTable.id),
                )
                .limit(1);
            return job ? exposeTextsJob(job) : null;
        });
    }
    async moveText(ownerId: string, id: string, request: MoveTextRequest) {
        return this.db.transaction(async (tx) => {
            await this.activeOwner(tx, ownerId);
            const [candidate] = await tx
                .select()
                .from(textsTable)
                .where(
                    and(eq(textsTable.id, id), eq(textsTable.ownerId, ownerId)),
                );
            if (!candidate) throw textNotFound();
            // All membership operations lock both folders in stable order before the text.
            const folders = [
                ...new Set(
                    [candidate.folderId, request.folderId].filter(
                        (value): value is string => value !== null,
                    ),
                ),
            ].sort();
            for (const folderId of folders)
                await this.folder(tx, ownerId, folderId);
            const [row] = await tx
                .select()
                .from(textsTable)
                .where(eq(textsTable.id, id))
                .for('update');
            if (!row || row.lifecycle !== 'active') throw textNotFound();
            assertTextVersion(row.version, request.expectedVersion);
            if (row.folderId !== candidate.folderId)
                throw new TextDomainError(
                    'version_conflict',
                    'The text moved. Reload it and try again.',
                );
            if (row.folderId === request.folderId) return textDocument(row);
            const [busy] = await tx
                .select({ id: textsAiJobsTable.id })
                .from(textsAiJobsTable)
                .where(
                    and(
                        eq(textsAiJobsTable.ownerId, ownerId),
                        eq(textsAiJobsTable.textId, id),
                        or(
                            inArray(textsAiJobsTable.executionState, [
                                'queued',
                                'running',
                            ]),
                            and(
                                eq(
                                    textsAiJobsTable.executionState,
                                    'completed',
                                ),
                                eq(
                                    textsAiJobsTable.jobKind,
                                    'text-translation',
                                ),
                                isNull(textsAiJobsTable.appliedTextId),
                                isNull(
                                    textsAiJobsTable.cancellationRequestedAt,
                                ),
                                gt(
                                    textsAiJobsTable.expiresAt,
                                    this.clock.now(),
                                ),
                                eq(
                                    textsAiJobsTable.expectedTextVersion,
                                    row.version,
                                ),
                            ),
                        ),
                    ),
                )
                .limit(1);
            if (busy)
                throw new TextDomainError(
                    'text_busy',
                    'Finish or discard the translation before moving this text.',
                );
            if (request.folderId)
                await this.confirmDestination(
                    tx,
                    request.folderId,
                    request.sharedFolderConfirmation,
                );
            const [updated] = await tx
                .update(textsTable)
                .set({
                    folderId: request.folderId,
                    version: row.version + 1,
                    updatedAt: this.clock.now(),
                })
                .where(eq(textsTable.id, id))
                .returning();
            await this.revision(tx, updated!);
            return textDocument(updated!);
        });
    }
    async createText(ownerId: string, request: CreateTextRequest) {
        return this.db.transaction(async (tx) => {
            const { operationId, sharedFolderConfirmation, ...content } =
                request;
            const fingerprint = operationId
                ? this.crypto.fingerprint({
                      kind: 'create-text',
                      ...content,
                      sharedFolderConfirmation,
                  })
                : undefined;
            if (operationId) {
                await tx.execute(
                    sql`select pg_advisory_xact_lock(hashtextextended(${`texts-idempotency:${ownerId}:${operationId}`},0))`,
                );
                const [prior] = await tx
                    .select()
                    .from(textIdempotencyTable)
                    .where(
                        and(
                            eq(textIdempotencyTable.ownerId, ownerId),
                            eq(textIdempotencyTable.key, operationId),
                        ),
                    );
                if (prior) {
                    if (prior.fingerprint !== fingerprint)
                        throw new TextDomainError(
                            'idempotency_conflict',
                            'This request key was already used.',
                        );
                    return textDocument(
                        await this.text(tx, ownerId, prior.result.id, false),
                    );
                }
            }
            await this.activeOwner(tx, ownerId);
            if (request.folderId) {
                await this.folder(tx, ownerId, request.folderId);
                await this.confirmDestination(
                    tx,
                    request.folderId,
                    sharedFolderConfirmation,
                );
            }
            const now = this.clock.now();
            const [row] = await tx
                .insert(textsTable)
                .values({
                    id: this.ids.generate(),
                    ownerId,
                    ...content,
                    title: resolveTextTitle(request.title, request.sourceText),
                    createdAt: now,
                    updatedAt: now,
                })
                .returning();
            await this.revision(tx, row!);
            if (operationId)
                await tx.insert(textIdempotencyTable).values({
                    ownerId,
                    key: operationId,
                    fingerprint: fingerprint!,
                    result: { id: row!.id },
                    createdAt: now,
                });
            return textDocument(row!);
        });
    }
    async getText(ownerId: string, id: string) {
        return this.db.transaction(async (tx) => {
            const row = await this.text(tx, ownerId, id, false);
            const [share] = await tx
                .select({ id: textSharesTable.id })
                .from(textSharesTable)
                .where(
                    and(
                        eq(textSharesTable.kind, 'text'),
                        eq(textSharesTable.resourceId, id),
                    ),
                )
                .limit(1);
            return {
                ...textDocument(row),
                isShared:
                    row.lifecycle === 'active' &&
                    row.status !== 'draft' &&
                    !!share,
            };
        });
    }
    async saveText(ownerId: string, id: string, request: SaveTextRequest) {
        return this.db.transaction(async (tx) => {
            const row = await this.text(tx, ownerId, id);
            assertTextVersion(row.version, request.expectedVersion);
            let patch: Partial<TextRow> = {
                title: request.title ?? row.title,
                version: row.version + 1,
                updatedAt: this.clock.now(),
            };
            if (request.kind === 'draft') {
                patch = {
                    ...patch,
                    sourceText: request.sourceText,
                    sourceLanguage: request.sourceLanguage,
                    targetLanguage: request.targetLanguage,
                    alignment: null,
                    status: 'draft',
                };
                await tx
                    .delete(textSharesTable)
                    .where(
                        and(
                            eq(textSharesTable.kind, 'text'),
                            eq(textSharesTable.resourceId, id),
                        ),
                    );
            }
            if (request.kind === 'edits') {
                if (!row.alignment)
                    throw new TextDomainError(
                        'invalid_request',
                        'Translate the text before editing sentence pairs.',
                    );
                const alignment = applyTextEdits(row.alignment, request.pairs);
                patch = {
                    ...patch,
                    alignment,
                    sourceText: alignment.source.map((p) => p.text).join(''),
                    status: alignment.editedPairIds.length
                        ? 'edited'
                        : 'translated',
                };
            }
            if (request.kind === 'proposal') {
                if (!this.proposal)
                    throw new TextDomainError(
                        'service_unavailable',
                        'Translation saving is unavailable.',
                    );
                const result = await this.proposal(tx, {
                    ownerId,
                    jobId: request.jobId,
                    textId: id,
                    expectedVersion: row.version,
                    folderId: row.folderId,
                    now: this.clock.now(),
                });
                patch = {
                    ...patch,
                    sourceText: result.sourceText,
                    sourceLanguage: result.sourceLanguage,
                    targetLanguage: result.targetLanguage,
                    alignment: result.alignment,
                    status: 'translated',
                };
            }
            const [updated] = await tx
                .update(textsTable)
                .set(patch)
                .where(eq(textsTable.id, id))
                .returning();
            await this.revision(tx, updated!);
            return textDocument(updated!);
        });
    }
    async textLifecycle(
        ownerId: string,
        id: string,
        expectedVersion: number,
        lifecycle: 'active' | 'archived',
    ) {
        return this.db.transaction(async (tx) => {
            const row = await this.text(tx, ownerId, id, false);
            assertTextVersion(row.version, expectedVersion);
            if (row.lifecycle === lifecycle) return textDocument(row);
            const [updated] = await tx
                .update(textsTable)
                .set({
                    lifecycle,
                    version: row.version + 1,
                    updatedAt: this.clock.now(),
                })
                .where(eq(textsTable.id, id))
                .returning();
            await tx
                .delete(textSharesTable)
                .where(
                    and(
                        eq(textSharesTable.kind, 'text'),
                        eq(textSharesTable.resourceId, id),
                    ),
                );
            await this.revision(tx, updated!);
            return textDocument(updated!);
        });
    }
    private async resource(
        tx: TextsContentTransaction,
        ownerId: string,
        kind: 'text' | 'folder',
        id: string,
        version: number,
    ) {
        const row =
            kind === 'folder'
                ? await this.folder(tx, ownerId, id)
                : await this.text(tx, ownerId, id);
        assertTextVersion(row.version, version);
        if (kind === 'text' && 'status' in row && row.status === 'draft')
            throw new TextDomainError(
                'invalid_request',
                'Save a translation before sharing.',
            );
        return row;
    }
    async issueShare(
        ownerId: string,
        kind: 'text' | 'folder',
        id: string,
        expectedVersion: number,
    ) {
        return this.db.transaction(async (tx) => {
            await this.resource(tx, ownerId, kind, id, expectedVersion);
            const [old] = await tx
                .select()
                .from(textSharesTable)
                .where(
                    and(
                        eq(textSharesTable.kind, kind),
                        eq(textSharesTable.resourceId, id),
                    ),
                )
                .for('update');
            const share = this.crypto.issueShare(
                (old?.version ?? 0) + 1,
                old?.locator,
            );
            await tx
                .insert(textSharesTable)
                .values({
                    id: old?.id ?? this.ids.generate(),
                    ownerId,
                    kind,
                    resourceId: id,
                    locator: share.locator,
                    keyDigest: share.digest,
                    version: share.version,
                    createdAt: this.clock.now(),
                })
                .onConflictDoUpdate({
                    target: [textSharesTable.kind, textSharesTable.resourceId],
                    set: { keyDigest: share.digest, version: share.version },
                });
            return {
                locator: share.locator,
                key: share.key,
                version: share.version,
            };
        });
    }
    async revokeShare(
        ownerId: string,
        kind: 'text' | 'folder',
        id: string,
        expectedVersion: number,
    ) {
        await this.db.transaction(async (tx) => {
            await this.resource(tx, ownerId, kind, id, expectedVersion);
            await tx
                .delete(textSharesTable)
                .where(
                    and(
                        eq(textSharesTable.kind, kind),
                        eq(textSharesTable.resourceId, id),
                    ),
                );
        });
    }
    private async shared(tx: TextsContentTransaction, access: TextShareAccess) {
        const [candidate] = await tx
            .select()
            .from(textSharesTable)
            .where(
                and(
                    eq(textSharesTable.locator, access.locator),
                    eq(textSharesTable.kind, access.kind),
                ),
            );
        if (!candidate) {
            this.crypto.verifyShare(access.key, null);
            throw textNotFound();
        }
        const [owner] = await tx
            .select({ status: usersTable.status })
            .from(usersTable)
            .where(eq(usersTable.id, candidate.ownerId));
        if (owner?.status !== 'active') throw textNotFound();
        const resource =
            access.kind === 'folder'
                ? await this.folder(tx, candidate.ownerId, candidate.resourceId)
                : await this.text(tx, candidate.ownerId, candidate.resourceId);
        const [share] = await tx
            .select()
            .from(textSharesTable)
            .where(eq(textSharesTable.id, candidate.id))
            .for('update');
        if (
            !share ||
            !this.crypto.verifyShare(access.key, share.keyDigest) ||
            ('status' in resource && resource.status === 'draft')
        )
            throw textNotFound();
        return { share, resource };
    }
    async readShared(access: TextShareAccess, page: TextPage) {
        return this.db.transaction(async (tx) => {
            const { share, resource } = await this.shared(tx, access);
            if (access.kind === 'text')
                return {
                    folder: null,
                    texts: [textDocument(resource as TextRow)],
                    nextCursor: null,
                };
            const rows = await tx
                .select()
                .from(textsTable)
                .where(
                    and(
                        eq(textsTable.folderId, share.resourceId),
                        eq(textsTable.lifecycle, 'active'),
                        ne(textsTable.status, 'draft'),
                        page.cursor
                            ? gt(textsTable.id, page.cursor)
                            : undefined,
                    ),
                )
                .orderBy(asc(textsTable.id))
                .limit(page.limit + 1);
            const [counts] = await tx
                .select({ translatedCount: sql<number>`count(*)::int` })
                .from(textsTable)
                .where(
                    and(
                        eq(textsTable.ownerId, share.ownerId),
                        eq(textsTable.folderId, share.resourceId),
                        eq(textsTable.lifecycle, 'active'),
                        ne(textsTable.status, 'draft'),
                    ),
                );
            return {
                folder: {
                    ...textFolder(
                        resource as typeof textFoldersTable.$inferSelect,
                    ),
                    translatedCount: counts!.translatedCount,
                },
                texts: rows.slice(0, page.limit).map(textDocument),
                nextCursor:
                    rows.length > page.limit ? rows[page.limit - 1]!.id : null,
            };
        });
    }
    async copyShared(
        ownerId: string,
        access: TextShareAccess,
        request: {
            destinationFolderId?: string | null;
            sharedFolderConfirmation?: {
                shareId: string;
                shareVersion: number;
            };
            newFolderName?: string;
            sourceTextId?: string;
            name?: string;
            idempotencyKey: string;
            expectedVersion?: number;
        },
    ) {
        return this.db.transaction(async (tx) => {
            // A transaction-level lock serializes retries before any content is copied.
            await tx.execute(
                sql`select pg_advisory_xact_lock(hashtextextended(${`texts-idempotency:${ownerId}:${request.idempotencyKey}`},0))`,
            );
            const fingerprint = this.crypto.fingerprint({
                kind: access.kind,
                locator: access.locator,
                keyDigest: this.crypto.fingerprint(access.key),
                destinationFolderId: request.destinationFolderId,
                newFolderName: request.newFolderName,
                sourceTextId: request.sourceTextId,
                name: request.name,
                expectedVersion: request.expectedVersion,
                sharedFolderConfirmation: request.sharedFolderConfirmation,
            });
            const [prior] = await tx
                .select()
                .from(textIdempotencyTable)
                .where(
                    and(
                        eq(textIdempotencyTable.ownerId, ownerId),
                        eq(textIdempotencyTable.key, request.idempotencyKey),
                    ),
                );
            if (prior) {
                if (prior.fingerprint !== fingerprint)
                    throw new TextDomainError(
                        'idempotency_conflict',
                        'This request key was already used.',
                    );
                return prior.result;
            }
            // Lock folders globally in UUID order so copying into each other's shared folders cannot deadlock.
            const [candidate] = await tx
                .select()
                .from(textSharesTable)
                .where(
                    and(
                        eq(textSharesTable.locator, access.locator),
                        eq(textSharesTable.kind, access.kind),
                    ),
                );
            if (!candidate) throw textNotFound();
            await this.activeOwner(tx, ownerId);
            await this.activeOwner(tx, candidate.ownerId);
            let sourceFolderId: string | null = candidate.resourceId;
            if (access.kind === 'text') {
                const [source] = await tx
                    .select()
                    .from(textsTable)
                    .where(eq(textsTable.id, candidate.resourceId));
                if (!source) throw textNotFound();
                sourceFolderId = source.folderId;
            }
            await tx
                .select()
                .from(textFoldersTable)
                .where(
                    inArray(textFoldersTable.id, [
                        ...(sourceFolderId ? [sourceFolderId] : []),
                        ...(request.destinationFolderId
                            ? [request.destinationFolderId]
                            : []),
                    ]),
                )
                .orderBy(asc(textFoldersTable.id))
                .for('update');
            const { share, resource } = await this.shared(tx, access);
            let child: TextRow | undefined;
            if (request.sourceTextId) {
                if (access.kind !== 'folder') throw textNotFound();
                [child] = await tx
                    .select()
                    .from(textsTable)
                    .where(
                        and(
                            eq(textsTable.id, request.sourceTextId),
                            eq(textsTable.folderId, share.resourceId),
                            eq(textsTable.lifecycle, 'active'),
                            ne(textsTable.status, 'draft'),
                        ),
                    )
                    .for('update');
                if (!child) throw textNotFound();
                if (request.expectedVersion !== undefined)
                    assertTextVersion(child.version, request.expectedVersion);
            }
            if (access.kind === 'text' && request.expectedVersion !== undefined)
                assertTextVersion(resource.version, request.expectedVersion);
            const now = this.clock.now();
            let folderId = request.destinationFolderId;
            if (access.kind === 'folder' && !child) {
                folderId = this.ids.generate();
                await tx.insert(textFoldersTable).values({
                    id: folderId,
                    ownerId,
                    name:
                        request.name ??
                        ('name' in resource ? resource.name : 'Copied folder'),
                    description:
                        'description' in resource ? resource.description : null,
                    createdAt: now,
                    updatedAt: now,
                });
            } else {
                if (request.newFolderName !== undefined) {
                    if (folderId)
                        throw new TextDomainError(
                            'invalid_request',
                            'Choose exactly one destination folder.',
                        );
                    folderId = this.ids.generate();
                    await tx.insert(textFoldersTable).values({
                        id: folderId,
                        ownerId,
                        name: request.newFolderName,
                        description: null,
                        createdAt: now,
                        updatedAt: now,
                    });
                }
                if (folderId === undefined)
                    throw new TextDomainError(
                        'invalid_request',
                        'Choose Independent or a destination folder.',
                    );
                if (folderId) {
                    await this.folder(tx, ownerId, folderId);
                    await this.confirmDestination(
                        tx,
                        folderId,
                        request.sharedFolderConfirmation,
                    );
                }
            }
            const sources = child
                ? [child]
                : access.kind === 'text'
                  ? [resource as TextRow]
                  : await tx
                        .select()
                        .from(textsTable)
                        .where(
                            and(
                                eq(textsTable.folderId, share.resourceId),
                                eq(textsTable.lifecycle, 'active'),
                                ne(textsTable.status, 'draft'),
                            ),
                        )
                        .orderBy(asc(textsTable.id))
                        .limit(501)
                        .for('update');
            if (sources.length > 500)
                throw new TextDomainError(
                    'invalid_request',
                    'Copy individual texts from this large folder.',
                );
            let resultId = folderId!;
            for (const source of sources) {
                const id = this.ids.generate();
                const remap = new Map(
                    source.alignment?.source.map((p) => [
                        p.pairId,
                        this.ids.generate(),
                    ]) ?? [],
                );
                const alignment = source.alignment
                    ? {
                          ...source.alignment,
                          source: source.alignment.source.map((p) => ({
                              ...p,
                              pairId: remap.get(p.pairId)!,
                          })),
                          translation: source.alignment.translation.map(
                              (p) => ({ ...p, pairId: remap.get(p.pairId)! }),
                          ),
                          editedPairIds: source.alignment.editedPairIds.map(
                              (p) => remap.get(p)!,
                          ),
                      }
                    : null;
                const [copy] = await tx
                    .insert(textsTable)
                    .values({
                        ...source,
                        id,
                        ownerId,
                        folderId: folderId ?? null,
                        alignment,
                        version: 1,
                        createdAt: now,
                        updatedAt: now,
                    })
                    .returning();
                await this.revision(tx, copy!);
                if (access.kind === 'text' || child) resultId = id;
            }
            const result = { id: resultId };
            await tx.insert(textIdempotencyTable).values({
                ownerId,
                key: request.idempotencyKey,
                fingerprint,
                result,
                createdAt: now,
            });
            return result;
        });
    }
}
