import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { KnowledgeDomainError } from '../../../domain/knowledge';
import type { KnowledgeTransaction } from './knowledge-transaction';
import { knowledgeLearningEpochsTable as epochs } from './learning-epoch-schema';
import { publishedLearningIdentities } from './learning-epoch-semantics';

export type LearningEpoch = typeof epochs.$inferSelect;
export type LearningEpochMap = Map<string, LearningEpoch>;
export function learningEpochKey(
    kind: LearningEpoch['kind'],
    blockId: string,
    itemId: string,
) {
    return `${kind}:${blockId}:${itemId}`;
}

export function requireLearningEpoch(
    rows: LearningEpochMap,
    kind: LearningEpoch['kind'],
    blockId: string,
    itemId: string,
    fingerprint?: string,
) {
    const row = rows.get(learningEpochKey(kind, blockId, itemId));
    if (
        !row?.active ||
        (fingerprint !== undefined && row.semanticFingerprint !== fingerprint)
    )
        throw new KnowledgeDomainError(
            'version_conflict',
            'The saved learning version is unavailable. Save or reload the note before continuing.',
        );

    return row;
}

export function learningExerciseRevision(noteId: string, epoch: LearningEpoch) {
    if (epoch.noteId !== noteId || epoch.kind !== 'exercise' || !epoch.active)
        throw new KnowledgeDomainError(
            'version_conflict',
            'The exercise is unavailable.',
        );

    return createHash('sha256')
        .update(
            JSON.stringify({
                revisionVersion: 1,
                noteId,
                blockId: epoch.blockId,
                epoch: epoch.epoch,
                semanticFingerprint: epoch.semanticFingerprint,
            }),
        )
        .digest('hex');
}

export async function readLearningEpochs(
    tx: KnowledgeTransaction,
    noteId: string,
): Promise<LearningEpochMap> {
    const rows = await tx
        .select()
        .from(epochs)
        .where(and(eq(epochs.noteId, noteId), eq(epochs.active, true)));

    return new Map(
        rows.map((row) => [
            learningEpochKey(row.kind, row.blockId, row.itemId),
            row,
        ]),
    );
}

/** Caller holds the note write lock; history and publication commit atomically. */
export async function syncLearningEpochs(
    tx: KnowledgeTransaction,
    noteId: string,
    body: unknown,
    publishedVersion: number,
) {
    const desired = publishedLearningIdentities(body);
    const active = await tx
        .select()
        .from(epochs)
        .where(and(eq(epochs.noteId, noteId), eq(epochs.active, true)))
        .for('update');
    let prior = active;
    if (desired.length > 0) {
        const tuples = sql.join(
            desired.map(
                (item) =>
                    sql`(${item.kind}, ${item.blockId}::uuid, ${item.itemId}::uuid)`,
            ),
            sql`, `,
        );
        const matching = await tx
            .select()
            .from(epochs)
            .where(
                and(
                    eq(epochs.noteId, noteId),
                    sql`(${epochs.kind}, ${epochs.blockId}, ${epochs.itemId}) in (${tuples})`,
                ),
            )
            .for('update');

        prior = [
            ...new Map(
                [...active, ...matching].map((row) => [
                    learningEpochKey(row.kind, row.blockId, row.itemId),
                    row,
                ]),
            ).values(),
        ];
    }

    const previous = new Map(
        prior.map((row) => [
            learningEpochKey(row.kind, row.blockId, row.itemId),
            row,
        ]),
    );
    const wanted = new Set(
        desired.map((item) =>
            learningEpochKey(item.kind, item.blockId, item.itemId),
        ),
    );
    const writes: LearningEpoch[] = desired.map((item) => {
        const before = previous.get(
            learningEpochKey(item.kind, item.blockId, item.itemId),
        );
        const changed =
            before &&
            (!before.active ||
                before.semanticFingerprint !== item.semanticFingerprint);

        return {
            ...item,
            noteId,
            active: true,
            epoch: before ? before.epoch + (changed ? 1 : 0) : 1,
            lastPublishedVersion: publishedVersion,
        };
    });

    for (const row of active)
        if (!wanted.has(learningEpochKey(row.kind, row.blockId, row.itemId)))
            writes.push({
                ...row,
                active: false,
                epoch: row.epoch + 1,
                lastPublishedVersion: publishedVersion,
            });
    if (
        writes.some(
            (row) =>
                !Number.isSafeInteger(row.epoch) || row.epoch > 2_147_483_647,
        )
    )
        throw new KnowledgeDomainError(
            'version_conflict',
            'The learning history limit has been reached.',
        );
    if (writes.length === 0) return;
    await tx
        .insert(epochs)
        .values(writes)
        .onConflictDoUpdate({
            target: [epochs.noteId, epochs.kind, epochs.blockId, epochs.itemId],
            set: {
                epoch: sql`excluded.epoch`,
                semanticFingerprint: sql`excluded.semantic_fingerprint`,
                active: sql`excluded.active`,
                lastPublishedVersion: sql`excluded.last_published_version`,
            },
        });
}
