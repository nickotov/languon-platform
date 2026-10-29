import { syncLearningEpochs } from './learning-epochs';
import { randomUUID } from 'node:crypto';
import { copyWorkbookBody } from './workbook-copy';
import { prepareMediaCopy } from './media-grants';
import { knowledgeBodyPlainText } from '../../../domain/knowledge';
import { knowledgeNoteRevisionsTable } from './schema';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import {
    SharedWorkbookSchema,
    WorkbookSchema,
    type CopyWorkbookRequest,
    type KnowledgeNote,
    type CreateWorkbookRequest,
    type SetWorkbookNotesRequest,
    type UpdateWorkbookRequest,
} from '@languon/contracts';
import type { WorkbookStore } from '../../../application/workbook-store';
import { KnowledgeDomainError } from '../../../domain/knowledge';
import type { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import {
    knowledgeNote,
    knowledgeUnavailable,
    lockKnowledgeOwner,
    type KnowledgeDatabase,
    type KnowledgeTransaction,
} from './knowledge-transaction';
import { knowledgeNotesTable } from './schema';
import {
    knowledgeWorkbooksTable as workbooks,
    knowledgeWorkbookNotesTable as members,
    knowledgeWorkbookSharesTable as shares,
} from './workbook-schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';

type Row = typeof workbooks.$inferSelect;
function version(row: Row, expected: number) {
    if (row.version !== expected)
        throw new KnowledgeDomainError(
            'version_conflict',
            'The workbook changed. Reload before applying changes.',
        );
}

async function owned(tx: KnowledgeTransaction, ownerId: string, id: string) {
    await lockKnowledgeOwner(tx, ownerId);
    const [row] = await tx
        .select()
        .from(workbooks)
        .where(
            and(
                eq(workbooks.id, id),
                eq(workbooks.ownerId, ownerId),
                isNull(workbooks.deletedAt),
            ),
        )
        .for('update');

    if (!row) throw knowledgeUnavailable();

    return row;
}

async function read(tx: KnowledgeTransaction, row: Row) {
    const notes = await tx
        .select({
            id: knowledgeNotesTable.id,
            title: knowledgeNotesTable.title,
            status: knowledgeNotesTable.status,
        })
        .from(members)
        .innerJoin(
            knowledgeNotesTable,
            eq(members.noteId, knowledgeNotesTable.id),
        )
        .where(
            and(
                eq(members.workbookId, row.id),
                eq(knowledgeNotesTable.ownerId, row.ownerId),
            ),
        )
        .orderBy(asc(members.position), asc(members.noteId));
    const [share] = await tx
        .select({ id: shares.workbookId })
        .from(shares)
        .where(eq(shares.workbookId, row.id));

    return WorkbookSchema.parse({
        id: row.id,
        title: row.title,
        version: row.version,
        shared: !!share,
        notes,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    });
}

async function touch(tx: KnowledgeTransaction, row: Row) {
    const [updated] = await tx
        .update(workbooks)
        .set({ version: row.version + 1, updatedAt: new Date() })
        .where(eq(workbooks.id, row.id))
        .returning();

    return updated!;
}

export class DrizzleWorkbookStore implements WorkbookStore {
    constructor(
        private readonly database: KnowledgeDatabase,
        private readonly crypto: KnowledgeShareCrypto,
    ) {}

    list(ownerId: string) {
        return this.database.transaction(async (tx) => {
            await lockKnowledgeOwner(tx, ownerId);
            const rows = await tx
                .select()
                .from(workbooks)
                .where(
                    and(
                        eq(workbooks.ownerId, ownerId),
                        isNull(workbooks.deletedAt),
                    ),
                )
                .orderBy(desc(workbooks.updatedAt))
                .limit(500);

            return Promise.all(rows.map((row) => read(tx, row)));
        });
    }

    create(ownerId: string, input: CreateWorkbookRequest) {
        return this.database.transaction(async (tx) => {
            await lockKnowledgeOwner(tx, ownerId);
            const now = new Date();
            await tx
                .insert(workbooks)
                .values({
                    id: input.id,
                    ownerId,
                    title: input.title,
                    version: 1,
                    createdAt: now,
                    updatedAt: now,
                })
                .onConflictDoNothing();

            const row = await owned(tx, ownerId, input.id);
            if (row.title !== input.title || row.version !== 1)
                throw new KnowledgeDomainError(
                    'idempotency_conflict',
                    'The workbook identity has already been used.',
                );

            return read(tx, row);
        });
    }

    get(ownerId: string, id: string) {
        return this.database.transaction(async (tx) =>
            read(tx, await owned(tx, ownerId, id)),
        );
    }

    update(ownerId: string, id: string, input: UpdateWorkbookRequest) {
        return this.database.transaction(async (tx) => {
            const row = await owned(tx, ownerId, id);
            version(row, input.expectedVersion);
            const [updated] = await tx
                .update(workbooks)
                .set({
                    title: input.title,
                    version: row.version + 1,
                    updatedAt: new Date(),
                })
                .where(eq(workbooks.id, id))
                .returning();

            return read(tx, updated!);
        });
    }

    setNotes(ownerId: string, id: string, input: SetWorkbookNotesRequest) {
        return this.database.transaction(async (tx) => {
            const row = await owned(tx, ownerId, id);
            version(row, input.expectedVersion);
            const existing = await tx
                .select()
                .from(members)
                .where(eq(members.workbookId, id));
            const oldIds = new Set(existing.map((item) => item.noteId));
            const [share] = await tx
                .select()
                .from(shares)
                .where(eq(shares.workbookId, id));

            if (
                share &&
                input.noteIds.some((noteId) => !oldIds.has(noteId)) &&
                !input.acknowledgeSharedAddition
            )
                throw new KnowledgeDomainError(
                    'invalid_request',
                    'Adding notes makes their saved content readable through this shared workbook. Confirm before continuing.',
                );
            if (input.noteIds.length) {
                const notes = await tx
                    .select({ id: knowledgeNotesTable.id })
                    .from(knowledgeNotesTable)
                    .where(
                        and(
                            inArray(knowledgeNotesTable.id, input.noteIds),
                            eq(knowledgeNotesTable.ownerId, ownerId),
                        ),
                    )
                    .orderBy(asc(knowledgeNotesTable.id))
                    .for('update');

                if (notes.length !== input.noteIds.length)
                    throw knowledgeUnavailable();
                const memberships = await tx
                    .select()
                    .from(members)
                    .where(inArray(members.noteId, input.noteIds));

                if (
                    memberships.some(
                        (membership) => membership.workbookId !== id,
                    )
                )
                    throw new KnowledgeDomainError(
                        'invalid_request',
                        'Remove the note from its current workbook before adding it here.',
                    );
            }

            await tx.delete(members).where(eq(members.workbookId, id));
            if (input.noteIds.length)
                await tx.insert(members).values(
                    input.noteIds.map((noteId, position) => ({
                        noteId,
                        position,
                        workbookId: id,
                    })),
                );

            return read(tx, await touch(tx, row));
        });
    }

    delete(ownerId: string, id: string, expected: number) {
        return this.database.transaction(async (tx) => {
            const row = await owned(tx, ownerId, id);
            version(row, expected);
            await tx.delete(shares).where(eq(shares.workbookId, id));
            await tx.delete(members).where(eq(members.workbookId, id));
            await tx
                .update(workbooks)
                .set({
                    title: '',
                    deletedAt: new Date(),
                    updatedAt: new Date(),
                    version: row.version + 1,
                })
                .where(eq(workbooks.id, id));
        });
    }

    issueShare(ownerId: string, id: string, expected: number) {
        return this.database.transaction(async (tx) => {
            const row = await owned(tx, ownerId, id);
            version(row, expected);
            const [existing] = await tx
                .select()
                .from(shares)
                .where(eq(shares.workbookId, id));

            if (existing)
                return {
                    locator: existing.locator,
                    key: this.crypto.key(existing.locator),
                };
            const locator = this.crypto.locator();
            const key = this.crypto.key(locator);
            await tx.insert(shares).values({
                workbookId: id,
                locator,
                keyDigest: this.crypto.digest(key),
                createdAt: new Date(),
            });

            return { locator, key };
        });
    }

    revokeShare(ownerId: string, id: string, expected: number) {
        return this.database.transaction(async (tx) => {
            const row = await owned(tx, ownerId, id);
            version(row, expected);
            await tx.delete(shares).where(eq(shares.workbookId, id));
        });
    }

    private async shared(
        tx: KnowledgeTransaction,
        locator: string,
        key: string,
    ) {
        const [capability] = await tx
            .select()
            .from(shares)
            .where(eq(shares.locator, locator));

        if (
            !this.crypto.verify(key, capability?.keyDigest ?? null) ||
            !capability
        )
            throw knowledgeUnavailable();
        const [row] = await tx
            .select()
            .from(workbooks)
            .where(
                and(
                    eq(workbooks.id, capability.workbookId),
                    isNull(workbooks.deletedAt),
                ),
            )
            .for('share');

        if (!row) throw knowledgeUnavailable();
        const [live] = await tx
            .select()
            .from(shares)
            .where(eq(shares.workbookId, row.id))
            .for('share');

        if (
            !live ||
            live.locator !== locator ||
            !this.crypto.verify(key, live.keyDigest)
        )
            throw knowledgeUnavailable();
        const [owner] = await tx
            .select({ status: usersTable.status })
            .from(usersTable)
            .where(eq(usersTable.id, row.ownerId));

        if (owner?.status !== 'active') throw knowledgeUnavailable();
        const saved = await tx
            .select({ note: knowledgeNotesTable })
            .from(members)
            .innerJoin(
                knowledgeNotesTable,
                eq(members.noteId, knowledgeNotesTable.id),
            )
            .where(
                and(
                    eq(members.workbookId, row.id),
                    eq(knowledgeNotesTable.ownerId, row.ownerId),
                    eq(knowledgeNotesTable.status, 'saved'),
                ),
            )
            .orderBy(asc(members.position), asc(members.noteId))
            .for('share', { of: knowledgeNotesTable });

        return SharedWorkbookSchema.parse({
            id: row.id,
            title: row.title,
            version: row.version,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            notes: saved.map(({ note }) => knowledgeNote(note)),
        });
    }

    readShared(locator: string, key: string) {
        return this.database.transaction((tx) => this.shared(tx, locator, key));
    }

    copyShared(
        ownerId: string,
        locator: string,
        key: string,
        input: CopyWorkbookRequest,
    ) {
        return this.database.transaction(async (tx) => {
            await lockKnowledgeOwner(tx, ownerId);
            const source = await this.shared(tx, locator, key);

            return this.publishCopy(tx, ownerId, input, source.notes);
        });
    }

    copy(
        ownerId: string,
        id: string,
        input: CopyWorkbookRequest & { expectedVersion: number },
    ) {
        return this.database.transaction(async (tx) => {
            const source = await owned(tx, ownerId, id);
            version(source, input.expectedVersion);
            const rows = await tx
                .select({ note: knowledgeNotesTable })
                .from(members)
                .innerJoin(
                    knowledgeNotesTable,
                    eq(members.noteId, knowledgeNotesTable.id),
                )
                .where(
                    and(
                        eq(members.workbookId, id),
                        eq(knowledgeNotesTable.ownerId, ownerId),
                    ),
                )
                .orderBy(asc(members.position), asc(members.noteId))
                .for('share', { of: knowledgeNotesTable });

            if (rows.some(({ note }) => note.status !== 'saved'))
                throw new KnowledgeDomainError(
                    'version_conflict',
                    'Save all notes before copying this workbook.',
                );

            return this.publishCopy(
                tx,
                ownerId,
                input,
                rows.map(({ note }) => knowledgeNote(note)),
            );
        });
    }

    private async publishCopy(
        tx: KnowledgeTransaction,
        ownerId: string,
        input: CopyWorkbookRequest,
        notes: KnowledgeNote[],
    ) {
        const [existing] = await tx
            .select({ id: workbooks.id })
            .from(workbooks)
            .where(eq(workbooks.id, input.id));

        if (existing)
            throw new KnowledgeDomainError(
                'idempotency_conflict',
                'This destination identity has already been used.',
            );
        // Prepare every content snapshot before publishing any destination row.
        const copied: {
            note: KnowledgeNote;
            media: Awaited<ReturnType<typeof prepareMediaCopy>>;
        }[] = [];

        for (const note of notes) {
            const media = await prepareMediaCopy(tx, note.id, note.body);
            copied.push({
                note: {
                    ...note,
                    id: randomUUID(),
                    body: copyWorkbookBody(note.body, media.assetIds),
                },
                media,
            });
        }

        const now = new Date();
        const [row] = await tx
            .insert(workbooks)
            .values({
                id: input.id,
                ownerId,
                title: input.title,
                version: 1,
                createdAt: now,
                updatedAt: now,
            })
            .returning();

        for (const [position, { note, media }] of copied.entries()) {
            const content = {
                title: note.title,
                summary: note.summary,
                categories: note.categories,
                studiedLanguage: note.studiedLanguage,
                explanationLanguage: note.explanationLanguage,
                body: note.body,
            };

            await tx.insert(knowledgeNotesTable).values({
                id: note.id,
                ownerId,
                ...content,
                plainText: knowledgeBodyPlainText(note.body),
                version: 1,
                status: 'saved',
                createdAt: now,
                updatedAt: now,
            });

            await media.grant(note.id);
            await syncLearningEpochs(tx, note.id, note.body, 1);

            await tx.insert(knowledgeNoteRevisionsTable).values({
                noteId: note.id,
                version: 1,
                content,
                createdAt: now,
            });

            await tx.insert(members).values({
                workbookId: input.id,
                noteId: note.id,
                position,
            });
        }

        return read(tx, row!);
    }
}
