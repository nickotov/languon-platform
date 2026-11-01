import type {
    CreateTextFolderRequest,
    UpdateTextFolderRequest,
} from '@languon/contracts';
import { and, eq, inArray, or } from 'drizzle-orm';
import { assertTextVersion } from '../../../domain/text';
import { textFoldersTable, textSharesTable, textsTable } from './schema';
import { activeOwner, folder } from './text-content-access';
import type { TextContentContext } from './text-content-persistence-support';
import { textFolder } from './text-content-support';

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
        if (row.lifecycle === lifecycle) {
            return textFolder(row);
        }

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
