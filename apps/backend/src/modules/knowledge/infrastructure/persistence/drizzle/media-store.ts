import { and, eq, sql } from 'drizzle-orm';
import { KnowledgeDomainError } from '../../../domain/knowledge';
import { createHash, randomUUID } from 'node:crypto';
import type { KnowledgeMediaAccess } from '@languon/contracts';
import type {
    KnowledgeMediaStore,
    VerifiedKnowledgeAudio,
} from '../../../application/media-store';
import type { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import {
    getOwnedKnowledgeRow,
    knowledgeUnavailable,
    type KnowledgeDatabase,
} from './knowledge-transaction';
import {
    knowledgeMediaAssetsTable as assets,
    knowledgeMediaBlobsTable as blobs,
} from './media-schema';
import { knowledgeAudioAssetIds } from './media-grants';
import { readWorkbookSharedNote } from './workbook-access';
import { shared } from './knowledge-share-operations';

export class DrizzleKnowledgeMediaStore implements KnowledgeMediaStore {
    constructor(
        private readonly database: KnowledgeDatabase,
        private readonly crypto: KnowledgeShareCrypto,
    ) {}

    async upload(
        ownerId: string,
        noteId: string,
        audio: VerifiedKnowledgeAudio,
    ) {
        return this.database.transaction(async (tx) => {
            await getOwnedKnowledgeRow(tx, ownerId, noteId);
            const [quota] = await tx
                .select({
                    count: sql<number>`count(*)::int`,
                    bytes: sql<number>`coalesce(sum(octet_length(${blobs.bytes})),0)::int`,
                })
                .from(assets)
                .innerJoin(blobs, eq(assets.blobId, blobs.id))
                .where(eq(assets.noteId, noteId));

            if (
                quota!.count >= 50 ||
                quota!.bytes + audio.bytes.length > 25 * 1024 * 1024
            )
                throw new KnowledgeDomainError(
                    'invalid_request',
                    'This note has reached its audio storage allowance.',
                );
            const blobId = randomUUID(),
                id = randomUUID();

            await tx.insert(blobs).values({
                id: blobId,
                bytes: Buffer.from(audio.bytes),
                mimeType: audio.mimeType,
                durationMs: audio.durationMs,
                checksum: createHash('sha256')
                    .update(audio.bytes)
                    .digest('hex'),
            });

            await tx
                .insert(assets)
                .values({ id, noteId, blobId, createdAt: new Date() });

            return {
                id,
                mimeType: audio.mimeType,
                byteLength: audio.bytes.length,
                durationMs: audio.durationMs,
            };
        });
    }

    async read(
        noteId: string,
        assetId: string,
        authority: { ownerId?: string; access?: KnowledgeMediaAccess },
    ): Promise<VerifiedKnowledgeAudio> {
        return this.database.transaction(async (tx) => {
            let note;
            if (authority.ownerId && !authority.access)
                note = await getOwnedKnowledgeRow(
                    tx,
                    authority.ownerId,
                    noteId,
                );
            else if (authority.access?.kind === 'workbook')
                note = await readWorkbookSharedNote(
                    tx,
                    this.crypto,
                    noteId,
                    authority.access,
                );
            else if (authority.access?.kind === 'note') {
                note = await shared(
                    { shareCrypto: this.crypto },
                    tx,
                    authority.access.locator,
                    authority.access.key,
                );

                if (note.id !== noteId) throw knowledgeUnavailable();
            } else throw knowledgeUnavailable();
            if (
                authority.access &&
                !knowledgeAudioAssetIds(note.body).includes(assetId)
            )
                throw knowledgeUnavailable();
            const [row] = await tx
                .select({
                    bytes: blobs.bytes,
                    mimeType: blobs.mimeType,
                    durationMs: blobs.durationMs,
                })
                .from(assets)
                .innerJoin(blobs, eq(assets.blobId, blobs.id))
                .where(and(eq(assets.id, assetId), eq(assets.noteId, noteId)));

            if (!row) throw knowledgeUnavailable();

            return row;
        });
    }
}
