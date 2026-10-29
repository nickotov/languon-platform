import { and, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { KnowledgeBody } from '@languon/contracts';
import { KnowledgeDomainError } from '../../../domain/knowledge';
import {
    knowledgeMediaAssetsTable as assets,
    knowledgeMediaBlobsTable as blobs,
} from './media-schema';
import { knowledgeNotesTable } from './schema';
import type { KnowledgeTransaction } from './knowledge-transaction';

export function knowledgeAudioAssetIds(body: KnowledgeBody): string[] {
    const ids = new Set<string>();
    for (const node of body.document.content ?? []) {
        const block = node.attrs?.block;
        if (
            node.type === 'learningBlock' &&
            block?.type === 'audio' &&
            block.assetId
        )
            ids.add(block.assetId);
    }

    return [...ids];
}

export async function assertKnowledgeMediaGrants(
    tx: KnowledgeTransaction,
    noteId: string,
    body: KnowledgeBody,
) {
    const ids = knowledgeAudioAssetIds(body);
    if (!ids.length) return;
    const rows = await tx
        .select({ id: assets.id })
        .from(assets)
        .where(and(eq(assets.noteId, noteId), inArray(assets.id, ids)))
        .for('share');

    if (rows.length !== ids.length)
        throw new KnowledgeDomainError(
            'invalid_request',
            'Audio content must belong to this note. Copy the audio block through the application before saving.',
        );
}

export async function prepareMediaCopy(
    tx: KnowledgeTransaction,
    sourceNoteId: string,
    body: KnowledgeBody,
) {
    await assertKnowledgeMediaGrants(tx, sourceNoteId, body);
    const ids = knowledgeAudioAssetIds(body);
    const rows = ids.length
        ? await tx
              .select()
              .from(assets)
              .where(
                  and(eq(assets.noteId, sourceNoteId), inArray(assets.id, ids)),
              )
              .for('share')
        : [];
    const assetIds = new Map(rows.map((row) => [row.id, randomUUID()]));

    return {
        assetIds,
        async grant(destinationNoteId: string) {
            const [destination] = await tx
                .select({ id: knowledgeNotesTable.id })
                .from(knowledgeNotesTable)
                .where(eq(knowledgeNotesTable.id, destinationNoteId))
                .for('share');

            if (!destination)
                throw new KnowledgeDomainError(
                    'knowledge_not_found',
                    'The destination note is unavailable.',
                );
            if (rows.length)
                await tx.insert(assets).values(
                    rows.map((row) => ({
                        id: assetIds.get(row.id)!,
                        noteId: destinationNoteId,
                        blobId: row.blobId,
                        createdAt: new Date(),
                    })),
                );
        },
    };
}

/** Same transaction as grant deletion; immutable blobs are removed only after all grants disappear. */
export async function deleteUnreferencedKnowledgeMedia(
    tx: KnowledgeTransaction,
) {
    await tx
        .delete(blobs)
        .where(
            sql`not exists (select 1 from ${assets} where ${assets.blobId}=${blobs.id})`,
        );
}
