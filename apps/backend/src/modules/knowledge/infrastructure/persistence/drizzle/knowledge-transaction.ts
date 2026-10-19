import { createHash, randomUUID } from 'node:crypto';
import {
    KnowledgeNoteContentSchema,
    KnowledgeNoteSchema,
    type KnowledgeNote,
    type KnowledgeNoteContent,
} from '@languon/contracts';
import { and, eq } from 'drizzle-orm';
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
export async function getOwnedKnowledgeNote(
    tx: KnowledgeTransaction,
    ownerId: string,
    noteId: string,
): Promise<KnowledgeNote> {
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
        return knowledgeNote(row);
    }
    async publish(
        ownerId: string,
        input: KnowledgePublication,
        now = new Date(),
    ): Promise<KnowledgeNote> {
        const content = KnowledgeNoteContentSchema.parse(input.content);
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
    await tx
        .insert(knowledgeNoteRevisionsTable)
        .values({ noteId: id, version: 1, content, createdAt: now });
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
    await tx
        .insert(knowledgeNoteRevisionsTable)
        .values({ noteId, version: row.version, content, createdAt: now });
    return knowledgeNote(row);
}
