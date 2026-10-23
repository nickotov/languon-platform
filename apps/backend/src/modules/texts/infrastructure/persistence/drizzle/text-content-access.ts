import { and, asc, eq, getTableColumns, gt, isNull, sql } from 'drizzle-orm';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import type { TextPage } from '../../../application/ports/text-content-store';
import { assertTextVersion, TextDomainError } from '../../../domain/text';
import {
    textFoldersTable,
    textRevisionsTable,
    textSharesTable,
    textsTable,
} from './schema';
import { type TextContentContext } from './text-content-persistence-support';
import {
    textDocument,
    textFolder,
    type TextRow,
    type TextsContentTransaction,
} from './text-content-support';
import { textNotFound } from './text-source-resolver';

export async function activeOwner(
    persistence: TextContentContext,
    tx: TextsContentTransaction,
    ownerId: string,
) {
    const [owner] = await tx
        .select({ status: usersTable.status })
        .from(usersTable)
        .where(eq(usersTable.id, ownerId))
        .for('share');

    if (owner?.status !== 'active') throw textNotFound();
}

export async function folder(
    persistence: TextContentContext,
    tx: TextsContentTransaction,
    ownerId: string,
    id: string,
    active = true,
) {
    await activeOwner(persistence, tx, ownerId);
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

    if (!row || (active && row.lifecycle !== 'active')) throw textNotFound();

    return row;
}

export async function text(
    persistence: TextContentContext,
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
    await activeOwner(persistence, tx, ownerId);
    if (candidate.folderId)
        await folder(persistence, tx, ownerId, candidate.folderId);
    const [row] = await tx
        .select()
        .from(textsTable)
        .where(eq(textsTable.id, id))
        .for('update');

    if (!row || (active && row.lifecycle !== 'active')) throw textNotFound();
    if (row.folderId !== candidate.folderId)
        throw new TextDomainError(
            'version_conflict',
            'The text moved. Reload it and try again.',
        );

    return row;
}

export async function revision(
    persistence: TextContentContext,
    tx: TextsContentTransaction,
    row: TextRow,
) {
    await tx.insert(textRevisionsTable).values({
        id: persistence.ids.generate(),
        ownerId: row.ownerId,
        textId: row.id,
        version: row.version,
        snapshot: textDocument(row),
        createdAt: persistence.clock.now(),
    });
}

export async function listFolders(
    persistence: TextContentContext,
    ownerId: string,
    page: TextPage,
) {
    const rows = await persistence.db
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
                page.cursor ? gt(textFoldersTable.id, page.cursor) : undefined,
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
        nextCursor: rows.length > page.limit ? rows[page.limit - 1]!.id : null,
    };
}

export async function listTexts(
    persistence: TextContentContext,
    ownerId: string,
    folderId: string | null,
    page: TextPage,
) {
    return persistence.db.transaction(async (tx) => {
        await activeOwner(persistence, tx, ownerId);
        if (folderId) await folder(persistence, tx, ownerId, folderId);
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
                    page.cursor ? gt(textsTable.id, page.cursor) : undefined,
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

export async function getText(
    persistence: TextContentContext,
    ownerId: string,
    id: string,
) {
    return persistence.db.transaction(async (tx) => {
        const row = await text(persistence, tx, ownerId, id, false);
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
                row.lifecycle === 'active' && row.status !== 'draft' && !!share,
        };
    });
}

export async function resource(
    persistence: TextContentContext,
    tx: TextsContentTransaction,
    ownerId: string,
    kind: 'text' | 'folder',
    id: string,
    version: number,
) {
    const row =
        kind === 'folder'
            ? await folder(persistence, tx, ownerId, id)
            : await text(persistence, tx, ownerId, id);

    assertTextVersion(row.version, version);
    if (kind === 'text' && 'status' in row && row.status === 'draft')
        throw new TextDomainError(
            'invalid_request',
            'Save a translation before sharing.',
        );

    return row;
}
