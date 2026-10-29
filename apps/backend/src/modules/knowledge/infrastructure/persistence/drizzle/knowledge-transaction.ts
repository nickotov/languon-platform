import { syncLearningEpochs } from './learning-epochs';
import { createHash, randomUUID } from 'node:crypto';
import {
    KnowledgeNoteContentSchema,
    KnowledgeNoteSchema,
    type KnowledgeNote,
    type KnowledgeNoteContent,
} from '@languon/contracts';
import { and, eq } from 'drizzle-orm';
import { assertKnowledgeMediaGrants } from './media-grants';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    knowledgeBodyPlainText,
    KnowledgeDomainError,
} from '../../../domain/knowledge';
import {
    knowledgeNoteRevisionsTable,
    knowledgeNotesTable,
    knowledgeOperationReceiptsTable,
    knowledgeWorkingBranchesTable,
} from './schema';

export type KnowledgeDatabase = PostgresJsDatabase<typeof databaseSchema>;
export type KnowledgeTransaction = Parameters<
    Parameters<KnowledgeDatabase['transaction']>[0]
>[0];
export interface KnowledgePublication {
    operationId: string;
    content: KnowledgeNoteContent;
    noteId?: string;
    expectedVersion?: number;
}
export function knowledgeUnavailable(): KnowledgeDomainError {
    return new KnowledgeDomainError(
        'knowledge_not_found',
        'The knowledge note is unavailable.',
    );
}

export async function lockKnowledgeOwner(
    tx: KnowledgeTransaction,
    ownerId: string,
): Promise<void> {
    const [owner] = await tx
        .select({ status: usersTable.status })
        .from(usersTable)
        .where(eq(usersTable.id, ownerId))
        .for('update');

    if (owner?.status !== 'active') throw knowledgeUnavailable();
}

export function knowledgeNote(
    row: typeof knowledgeNotesTable.$inferSelect,
): KnowledgeNote {
    return KnowledgeNoteSchema.parse({
        id: row.id,
        version: row.version,
        title: row.title,
        summary: row.summary,
        body: row.body,
        categories: row.categories,
        studiedLanguage: row.studiedLanguage,
        explanationLanguage: row.explanationLanguage,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    });
}

export async function getOwnedKnowledgeRow(
    tx: KnowledgeTransaction,
    ownerId: string,
    noteId: string,
) {
    await lockKnowledgeOwner(tx, ownerId);
    const [row] = await tx
        .select()
        .from(knowledgeNotesTable)
        .where(
            and(
                eq(knowledgeNotesTable.id, noteId),
                eq(knowledgeNotesTable.ownerId, ownerId),
            ),
        )
        .for('update');

    if (!row) throw knowledgeUnavailable();

    return row;
}

export async function getOwnedKnowledgeNote(
    tx: KnowledgeTransaction,
    ownerId: string,
    noteId: string,
): Promise<KnowledgeNote> {
    const row = await getOwnedKnowledgeRow(tx, ownerId, noteId);
    if (row.status !== 'saved') throw knowledgeUnavailable();

    return knowledgeNote(row);
}

function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value !== null && typeof value === 'object')
        return `{${Object.keys(value)
            .sort()
            .map(
                (key) =>
                    `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
            )
            .join(',')}}`;

    return JSON.stringify(value) ?? 'null';
}

export function knowledgeFingerprint(value: unknown): string {
    return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export async function readKnowledgeReceipt(
    tx: KnowledgeTransaction,
    ownerId: string,
    operationId: string,
    fingerprint: string,
) {
    const [receipt] = await tx
        .select()
        .from(knowledgeOperationReceiptsTable)
        .where(
            and(
                eq(knowledgeOperationReceiptsTable.ownerId, ownerId),
                eq(knowledgeOperationReceiptsTable.operationId, operationId),
            ),
        );

    if (receipt && receipt.fingerprint !== fingerprint)
        throw new KnowledgeDomainError(
            'idempotency_conflict',
            'This operation ID was already used for a different request.',
        );

    return receipt;
}

export async function replayKnowledgeNote(
    tx: KnowledgeTransaction,
    ownerId: string,
    receipt: typeof knowledgeOperationReceiptsTable.$inferSelect,
): Promise<KnowledgeNote> {
    const current = await getOwnedKnowledgeNote(tx, ownerId, receipt.noteId);
    const [revision] = await tx
        .select()
        .from(knowledgeNoteRevisionsTable)
        .where(
            and(
                eq(knowledgeNoteRevisionsTable.noteId, receipt.noteId),
                eq(knowledgeNoteRevisionsTable.version, receipt.version),
            ),
        );

    if (!revision) throw knowledgeUnavailable();

    return KnowledgeNoteSchema.parse({
        ...revision.content,
        id: current.id,
        version: revision.version,
        createdAt: current.createdAt,
        updatedAt: revision.createdAt.toISOString(),
    });
}

export async function writeKnowledgeReceipt(
    tx: KnowledgeTransaction,
    input: Omit<typeof knowledgeOperationReceiptsTable.$inferInsert, 'id'>,
): Promise<void> {
    await tx
        .insert(knowledgeOperationReceiptsTable)
        .values({ ...input, id: randomUUID() });
}

/** Call within the conversation draft's transaction, after its version and source/lease fences.
 * No origin or draft identity is persisted by Knowledge. Existing targets are never upserted. */
export class DrizzleKnowledgeTransactionParticipant {
    constructor(private readonly tx: KnowledgeTransaction) {}
    get(ownerId: string, noteId: string) {
        return getOwnedKnowledgeNote(this.tx, ownerId, noteId);
    }

    /** Short shared lifecycle fence for authorized source reads; does not reserve a writer. */
    async getForSource(ownerId: string, noteId: string) {
        const [owner] = await this.tx
            .select({ status: usersTable.status })
            .from(usersTable)
            .where(eq(usersTable.id, ownerId))
            .for('share');

        if (owner?.status !== 'active') throw knowledgeUnavailable();
        const [row] = await this.tx
            .select()
            .from(knowledgeNotesTable)
            .where(
                and(
                    eq(knowledgeNotesTable.id, noteId),
                    eq(knowledgeNotesTable.ownerId, ownerId),
                ),
            )
            .for('share');

        if (!row) throw knowledgeUnavailable();
        if (row.status === 'saved') {
            const note = knowledgeNote(row);

            return {
                title: note.title,
                summary: note.summary,
                studiedLanguage: note.studiedLanguage,
                version: note.version,
                body: note.body,
            };
        }

        const [branch] = await this.tx
            .select()
            .from(knowledgeWorkingBranchesTable)
            .where(
                eq(knowledgeWorkingBranchesTable.id, row.preferredBranchId!),
            );

        if (!branch) throw knowledgeUnavailable();

        return {
            title: branch.content.title,
            summary: branch.content.summary,
            studiedLanguage: branch.content.studiedLanguage,
            version: branch.version,
            body: branch.content.body,
        };
    }

    async nameUntitledFromFirstMessage(
        ownerId: string,
        noteId: string,
        title: string,
    ): Promise<void> {
        const row = await getOwnedKnowledgeRow(this.tx, ownerId, noteId);
        if (!row.autoTitleEligible) return;
        await this.tx
            .update(knowledgeNotesTable)
            .set({
                autoTitleEligible: false,
                title: row.title === 'Untitled' ? title : row.title,
            })
            .where(eq(knowledgeNotesTable.id, noteId));

        if (row.title !== 'Untitled') return;
        const [branch] = await this.tx
            .select()
            .from(knowledgeWorkingBranchesTable)
            .where(eq(knowledgeWorkingBranchesTable.id, row.preferredBranchId!))
            .for('update');

        if (branch?.content.title === 'Untitled')
            await this.tx
                .update(knowledgeWorkingBranchesTable)
                .set({
                    content: { ...branch.content, title },
                    version: branch.version + 1,
                    updatedAt: new Date(),
                })
                .where(eq(knowledgeWorkingBranchesTable.id, branch.id));
    }

    async publish(
        ownerId: string,
        input: KnowledgePublication,
        now = new Date(),
    ): Promise<KnowledgeNote> {
        const content = KnowledgeNoteContentSchema.parse(input.content);
        if (!knowledgeBodyPlainText(content.body))
            throw new KnowledgeDomainError(
                'invalid_request',
                'Add document content before saving.',
            );
        if (
            (input.noteId === undefined) !==
            (input.expectedVersion === undefined)
        )
            throw new KnowledgeDomainError(
                'invalid_request',
                'Updating a note requires its expected version.',
            );
        await lockKnowledgeOwner(this.tx, ownerId);
        const operation = input.noteId ? 'update' : 'create';
        const fingerprint = knowledgeFingerprint({
            operation,
            noteId: input.noteId ?? null,
            expectedVersion: input.expectedVersion ?? null,
            content,
        });
        const receipt = await readKnowledgeReceipt(
            this.tx,
            ownerId,
            input.operationId,
            fingerprint,
        );

        if (receipt) return replayKnowledgeNote(this.tx, ownerId, receipt);
        const note = input.noteId
            ? await replaceKnowledgeContent(
                  this.tx,
                  ownerId,
                  input.noteId,
                  input.expectedVersion!,
                  content,
                  now,
              )
            : await createKnowledgeContent(this.tx, ownerId, content, now);

        await writeKnowledgeReceipt(this.tx, {
            ownerId,
            operationId: input.operationId,
            operation,
            fingerprint,
            noteId: note.id,
            version: note.version,
            createdAt: now,
        });

        return note;
    }
}
async function createKnowledgeContent(
    tx: KnowledgeTransaction,
    ownerId: string,
    content: KnowledgeNoteContent,
    now: Date,
): Promise<KnowledgeNote> {
    const id = randomUUID();
    await assertKnowledgeMediaGrants(tx, id, content.body);
    const [row] = await tx
        .insert(knowledgeNotesTable)
        .values({
            id,
            ownerId,
            ...content,
            plainText: knowledgeBodyPlainText(content.body),
            version: 1,
            createdAt: now,
            updatedAt: now,
        })
        .returning();

    await syncLearningEpochs(tx, id, content.body, 1);
    await tx
        .insert(knowledgeNoteRevisionsTable)
        .values({ noteId: id, version: 1, content, createdAt: now });

    const branchId = randomUUID();
    await tx.insert(knowledgeWorkingBranchesTable).values({
        id: branchId,
        noteId: id,
        version: 1,
        basePublishedVersion: 1,
        content,
        updatedAt: now,
    });

    await tx
        .update(knowledgeNotesTable)
        .set({ preferredBranchId: branchId })
        .where(eq(knowledgeNotesTable.id, id));

    return knowledgeNote(row!);
}

export async function replaceKnowledgeContent(
    tx: KnowledgeTransaction,
    ownerId: string,
    noteId: string,
    expectedVersion: number,
    content: KnowledgeNoteContent,
    now: Date,
): Promise<KnowledgeNote> {
    const current = await getOwnedKnowledgeNote(tx, ownerId, noteId);
    await assertKnowledgeMediaGrants(tx, noteId, content.body);
    if (current.version !== expectedVersion)
        throw new KnowledgeDomainError(
            'version_conflict',
            'The knowledge note changed. Reload it before saving.',
        );
    const [row] = await tx
        .update(knowledgeNotesTable)
        .set({
            ...content,
            plainText: knowledgeBodyPlainText(content.body),
            version: current.version + 1,
            updatedAt: now,
        })
        .where(
            and(
                eq(knowledgeNotesTable.id, noteId),
                eq(knowledgeNotesTable.ownerId, ownerId),
                eq(knowledgeNotesTable.version, expectedVersion),
            ),
        )
        .returning();

    if (!row)
        throw new KnowledgeDomainError(
            'version_conflict',
            'The knowledge note changed. Reload it before saving.',
        );
    await syncLearningEpochs(tx, noteId, content.body, row.version);
    await tx
        .insert(knowledgeNoteRevisionsTable)
        .values({ noteId, version: row.version, content, createdAt: now });

    if (row.preferredBranchId) {
        const [branch] = await tx
            .select()
            .from(knowledgeWorkingBranchesTable)
            .where(eq(knowledgeWorkingBranchesTable.id, row.preferredBranchId))
            .for('update');

        if (
            branch &&
            branch.basePublishedVersion === expectedVersion &&
            knowledgeFingerprint(branch.content) ===
                knowledgeFingerprint(currentContentFromNote(current))
        ) {
            await tx
                .update(knowledgeWorkingBranchesTable)
                .set({
                    content,
                    version: branch.version + 1,
                    basePublishedVersion: row.version,
                    updatedAt: now,
                })
                .where(eq(knowledgeWorkingBranchesTable.id, branch.id));
        } else if (branch) {
            // A published revision changed while the learner has a distinct
            // working draft. Keep both versions available for comparison.
            await tx.insert(knowledgeWorkingBranchesTable).values({
                id: randomUUID(),
                noteId,
                version: 1,
                basePublishedVersion: row.version,
                content,
                updatedAt: now,
            });
        }
    }

    return knowledgeNote(row);
}

function currentContentFromNote(note: KnowledgeNote): KnowledgeNoteContent {
    return {
        title: note.title,
        summary: note.summary,
        body: note.body,
        categories: note.categories,
        studiedLanguage: note.studiedLanguage,
        explanationLanguage: note.explanationLanguage,
    };
}
