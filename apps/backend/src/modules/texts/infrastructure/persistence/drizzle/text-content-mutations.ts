import type {
    CreateTextFolderRequest,
    CreateTextRequest,
    MoveTextRequest,
    SaveTextRequest,
    UpdateTextFolderRequest,
} from '@languon/contracts';
import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { withActionBilling } from '../../../../ai-credits/infrastructure/persistence/drizzle/action-billing';
import {
    applyTextEdits,
    assertTextVersion,
    resolveTextTitle,
    TextDomainError,
} from '../../../domain/text';
import {
    textFoldersTable,
    textIdempotencyTable,
    textSharesTable,
    textsTable,
} from './schema';
import { activeOwner, folder, revision, text } from './text-content-access';
import { type TextContentContext } from './text-content-persistence-support';
import {
    textDocument,
    textFolder,
    type TextRow,
    type TextsContentTransaction,
} from './text-content-support';
import { textNotFound } from './text-source-resolver';
import { textsAiJobsTable } from './texts-job-schema';
import { exposeTextsJob } from './texts-job-support';

export async function createFolder(
    persistence: TextContentContext,
    ownerId: string,
    request: CreateTextFolderRequest,
) {
    return persistence.db.transaction(async (tx) => {
        await activeOwner(persistence, tx, ownerId);
        const now = persistence.clock.now();
        const [row] = await tx
            .insert(textFoldersTable)
            .values({
                id: persistence.ids.generate(),
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

export async function updateFolder(
    persistence: TextContentContext,
    ownerId: string,
    id: string,
    request: UpdateTextFolderRequest,
) {
    return persistence.db.transaction(async (tx) => {
        const row = await folder(persistence, tx, ownerId, id);
        assertTextVersion(row.version, request.expectedVersion);
        const [updated] = await tx
            .update(textFoldersTable)
            .set({
                ...(request.name !== undefined ? { name: request.name } : {}),
                ...(request.description !== undefined
                    ? { description: request.description }
                    : {}),
                version: row.version + 1,
                updatedAt: persistence.clock.now(),
            })
            .where(eq(textFoldersTable.id, id))
            .returning();

        return textFolder(updated!);
    });
}

export async function folderLifecycle(
    persistence: TextContentContext,
    ownerId: string,
    id: string,
    expectedVersion: number,
    lifecycle: 'active' | 'archived',
) {
    return persistence.db.transaction(async (tx) => {
        const row = await folder(persistence, tx, ownerId, id, false);
        assertTextVersion(row.version, expectedVersion);
        if (row.lifecycle === lifecycle) return textFolder(row);
        const [updated] = await tx
            .update(textFoldersTable)
            .set({
                lifecycle,
                version: row.version + 1,
                updatedAt: persistence.clock.now(),
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

export async function confirmDestination(
    persistence: TextContentContext,
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

export async function pendingJob(
    persistence: TextContentContext,
    ownerId: string,
    id: string,
) {
    return persistence.db.transaction(async (tx) => {
        const row = await text(persistence, tx, ownerId, id);
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
                            eq(textsAiJobsTable.executionState, 'completed'),
                            eq(textsAiJobsTable.jobKind, 'text-translation'),
                            eq(
                                textsAiJobsTable.expectedTextVersion,
                                row.version,
                            ),
                            row.folderId === null
                                ? isNull(textsAiJobsTable.folderId)
                                : eq(textsAiJobsTable.folderId, row.folderId),
                            gt(
                                textsAiJobsTable.expiresAt,
                                persistence.clock.now(),
                            ),
                            isNull(textsAiJobsTable.cancellationRequestedAt),
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

        return job
            ? withActionBilling(tx, exposeTextsJob(job), job.id, job.ownerId)
            : null;
    });
}

export async function moveText(
    persistence: TextContentContext,
    ownerId: string,
    id: string,
    request: MoveTextRequest,
) {
    return persistence.db.transaction(async (tx) => {
        await activeOwner(persistence, tx, ownerId);
        const [candidate] = await tx
            .select()
            .from(textsTable)
            .where(and(eq(textsTable.id, id), eq(textsTable.ownerId, ownerId)));

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
            await folder(persistence, tx, ownerId, folderId);
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
                            eq(textsAiJobsTable.executionState, 'completed'),
                            eq(textsAiJobsTable.jobKind, 'text-translation'),
                            isNull(textsAiJobsTable.appliedTextId),
                            isNull(textsAiJobsTable.cancellationRequestedAt),
                            gt(
                                textsAiJobsTable.expiresAt,
                                persistence.clock.now(),
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
            await confirmDestination(
                persistence,
                tx,
                request.folderId,
                request.sharedFolderConfirmation,
            );
        const [updated] = await tx
            .update(textsTable)
            .set({
                folderId: request.folderId,
                version: row.version + 1,
                updatedAt: persistence.clock.now(),
            })
            .where(eq(textsTable.id, id))
            .returning();

        await revision(persistence, tx, updated!);

        return textDocument(updated!);
    });
}

export async function createText(
    persistence: TextContentContext,
    ownerId: string,
    request: CreateTextRequest,
) {
    return persistence.db.transaction(async (tx) => {
        const { operationId, sharedFolderConfirmation, ...content } = request;
        const fingerprint = operationId
            ? persistence.crypto.fingerprint({
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
                    await text(
                        persistence,
                        tx,
                        ownerId,
                        prior.result.id,
                        false,
                    ),
                );
            }
        }

        await activeOwner(persistence, tx, ownerId);
        if (request.folderId) {
            await folder(persistence, tx, ownerId, request.folderId);
            await confirmDestination(
                persistence,
                tx,
                request.folderId,
                sharedFolderConfirmation,
            );
        }

        const now = persistence.clock.now();
        const [row] = await tx
            .insert(textsTable)
            .values({
                id: persistence.ids.generate(),
                ownerId,
                ...content,
                title: resolveTextTitle(request.title, request.sourceText),
                createdAt: now,
                updatedAt: now,
            })
            .returning();

        await revision(persistence, tx, row!);
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

export async function saveText(
    persistence: TextContentContext,
    ownerId: string,
    id: string,
    request: SaveTextRequest,
) {
    return persistence.db.transaction(async (tx) => {
        const row = await text(persistence, tx, ownerId, id);
        assertTextVersion(row.version, request.expectedVersion);
        let patch: Partial<TextRow> = {
            title: request.title ?? row.title,
            version: row.version + 1,
            updatedAt: persistence.clock.now(),
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
            if (!persistence.proposal)
                throw new TextDomainError(
                    'service_unavailable',
                    'Translation saving is unavailable.',
                );
            const result = await persistence.proposal(tx, {
                ownerId,
                jobId: request.jobId,
                textId: id,
                expectedVersion: row.version,
                folderId: row.folderId,
                now: persistence.clock.now(),
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

        await revision(persistence, tx, updated!);

        return textDocument(updated!);
    });
}

export async function textLifecycle(
    persistence: TextContentContext,
    ownerId: string,
    id: string,
    expectedVersion: number,
    lifecycle: 'active' | 'archived',
) {
    return persistence.db.transaction(async (tx) => {
        const row = await text(persistence, tx, ownerId, id, false);
        assertTextVersion(row.version, expectedVersion);
        if (row.lifecycle === lifecycle) return textDocument(row);
        const [updated] = await tx
            .update(textsTable)
            .set({
                lifecycle,
                version: row.version + 1,
                updatedAt: persistence.clock.now(),
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

        await revision(persistence, tx, updated!);

        return textDocument(updated!);
    });
}
