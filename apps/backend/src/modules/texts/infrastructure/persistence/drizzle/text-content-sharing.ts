import { and, asc, eq, gt, inArray, ne, sql } from 'drizzle-orm';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import type {
    TextPage,
    TextShareAccess,
} from '../../../application/ports/text-content-store';
import { assertTextVersion, TextDomainError } from '../../../domain/text';
import {
    textFoldersTable,
    textIdempotencyTable,
    textSharesTable,
    textsTable,
} from './schema';
import {
    activeOwner,
    folder,
    resource,
    revision,
    text,
} from './text-content-access';
import { confirmDestination } from './text-content-mutations';
import { type TextContentContext } from './text-content-persistence-support';
import {
    textDocument,
    textFolder,
    type TextRow,
    type TextsContentTransaction,
} from './text-content-support';
import { textNotFound } from './text-source-resolver';

export async function issueShare(
    persistence: TextContentContext,
    ownerId: string,
    kind: 'text' | 'folder',
    id: string,
    expectedVersion: number,
) {
    return persistence.db.transaction(async (tx) => {
        await resource(persistence, tx, ownerId, kind, id, expectedVersion);
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
        const share = persistence.crypto.issueShare(
            (old?.version ?? 0) + 1,
            old?.locator,
        );

        await tx
            .insert(textSharesTable)
            .values({
                id: old?.id ?? persistence.ids.generate(),
                ownerId,
                kind,
                resourceId: id,
                locator: share.locator,
                keyDigest: share.digest,
                version: share.version,
                createdAt: persistence.clock.now(),
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

export async function revokeShare(
    persistence: TextContentContext,
    ownerId: string,
    kind: 'text' | 'folder',
    id: string,
    expectedVersion: number,
) {
    await persistence.db.transaction(async (tx) => {
        await resource(persistence, tx, ownerId, kind, id, expectedVersion);
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

export async function shared(
    persistence: TextContentContext,
    tx: TextsContentTransaction,
    access: TextShareAccess,
) {
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
        persistence.crypto.verifyShare(access.key, null);

        throw textNotFound();
    }

    const [owner] = await tx
        .select({ status: usersTable.status })
        .from(usersTable)
        .where(eq(usersTable.id, candidate.ownerId));

    if (owner?.status !== 'active') throw textNotFound();
    const resource =
        access.kind === 'folder'
            ? await folder(
                  persistence,
                  tx,
                  candidate.ownerId,
                  candidate.resourceId,
              )
            : await text(
                  persistence,
                  tx,
                  candidate.ownerId,
                  candidate.resourceId,
              );
    const [share] = await tx
        .select()
        .from(textSharesTable)
        .where(eq(textSharesTable.id, candidate.id))
        .for('update');

    if (
        !share ||
        !persistence.crypto.verifyShare(access.key, share.keyDigest) ||
        ('status' in resource && resource.status === 'draft')
    )
        throw textNotFound();

    return { share, resource };
}

export async function readShared(
    persistence: TextContentContext,
    access: TextShareAccess,
    page: TextPage,
) {
    return persistence.db.transaction(async (tx) => {
        const { share, resource } = await shared(persistence, tx, access);
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
                    page.cursor ? gt(textsTable.id, page.cursor) : undefined,
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
                ...textFolder(resource as typeof textFoldersTable.$inferSelect),
                translatedCount: counts!.translatedCount,
            },
            texts: rows.slice(0, page.limit).map(textDocument),
            nextCursor:
                rows.length > page.limit ? rows[page.limit - 1]!.id : null,
        };
    });
}

export async function copyShared(
    persistence: TextContentContext,
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
    return persistence.db.transaction(async (tx) => {
        // A transaction-level lock serializes retries before any content is copied.
        await tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${`texts-idempotency:${ownerId}:${request.idempotencyKey}`},0))`,
        );

        const fingerprint = persistence.crypto.fingerprint({
            kind: access.kind,
            locator: access.locator,
            keyDigest: persistence.crypto.fingerprint(access.key),
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
        await activeOwner(persistence, tx, ownerId);
        await activeOwner(persistence, tx, candidate.ownerId);
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

        const { share, resource } = await shared(persistence, tx, access);
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
        const now = persistence.clock.now();
        let folderId = request.destinationFolderId;
        if (access.kind === 'folder' && !child) {
            folderId = persistence.ids.generate();
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
                folderId = persistence.ids.generate();
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
                await folder(persistence, tx, ownerId, folderId);
                await confirmDestination(
                    persistence,
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
            const id = persistence.ids.generate();
            const remap = new Map(
                source.alignment?.source.map((p) => [
                    p.pairId,
                    persistence.ids.generate(),
                ]) ?? [],
            );
            const alignment = source.alignment
                ? {
                      ...source.alignment,
                      source: source.alignment.source.map((p) => ({
                          ...p,
                          pairId: remap.get(p.pairId)!,
                      })),
                      translation: source.alignment.translation.map((p) => ({
                          ...p,
                          pairId: remap.get(p.pairId)!,
                      })),
                      editedPairIds: source.alignment.editedPairIds.map((p) =>
                          remap.get(p)!,
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

            await revision(persistence, tx, copy!);
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
