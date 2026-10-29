import { syncLearningEpochs } from './learning-epochs';
import { prepareMediaCopy } from './media-grants';
import { copyWorkbookBody } from './workbook-copy';
import { KnowledgeNoteContentSchema } from '@languon/contracts';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { KnowledgeDomainError } from '../../../domain/knowledge';
import { type KnowledgeStoreContext } from './knowledge-persistence-support';
import {
    getOwnedKnowledgeRow,
    knowledgeFingerprint,
    knowledgeNote,
    knowledgeUnavailable,
    lockKnowledgeOwner,
    readKnowledgeReceipt,
    replayKnowledgeNote,
    writeKnowledgeReceipt,
    type KnowledgeTransaction,
} from './knowledge-transaction';
import {
    knowledgeNoteRevisionsTable,
    knowledgeNotesTable,
    knowledgeSharesTable,
    knowledgeWorkingBranchesTable,
} from './schema';

export async function getShare(
    persistence: KnowledgeStoreContext,
    ownerId: string,
    noteId: string,
) {
    return persistence.database.transaction(async (tx) => {
        const row = await getOwnedKnowledgeRow(tx, ownerId, noteId);
        if (row.status !== 'saved') throw knowledgeUnavailable();
        const [share] = await tx
            .select()
            .from(knowledgeSharesTable)
            .where(eq(knowledgeSharesTable.noteId, noteId));

        if (!share) throw knowledgeUnavailable();
        const key = persistence.shareCrypto.key(share.locator);
        if (!persistence.shareCrypto.verify(key, share.keyDigest))
            throw knowledgeUnavailable();

        return { locator: share.locator, key };
    });
}

export async function issueShare(
    persistence: KnowledgeStoreContext,
    ownerId: string,
    noteId: string,
) {
    return persistence.database.transaction(async (tx) => {
        const row = await getOwnedKnowledgeRow(tx, ownerId, noteId);
        if (row.status !== 'saved')
            throw new KnowledgeDomainError(
                'invalid_request',
                'Save the note before sharing.',
            );
        const [existing] = await tx
            .select()
            .from(knowledgeSharesTable)
            .where(eq(knowledgeSharesTable.noteId, noteId))
            .for('update');

        if (existing) {
            const key = persistence.shareCrypto.key(existing.locator);
            if (!persistence.shareCrypto.verify(key, existing.keyDigest))
                throw knowledgeUnavailable();

            return { locator: existing.locator, key };
        }

        const locator = persistence.shareCrypto.locator(),
            key = persistence.shareCrypto.key(locator);

        await tx.insert(knowledgeSharesTable).values({
            noteId,
            locator,
            keyDigest: persistence.shareCrypto.digest(key),
            version: 1,
            createdAt: new Date(),
        });

        return { locator, key };
    });
}

export async function revokeShare(
    persistence: KnowledgeStoreContext,
    ownerId: string,
    noteId: string,
) {
    return persistence.database.transaction(async (tx) => {
        await getOwnedKnowledgeRow(tx, ownerId, noteId);
        await tx
            .delete(knowledgeSharesTable)
            .where(eq(knowledgeSharesTable.noteId, noteId));

        return { disabled: true as const };
    });
}

export async function shared(
    persistence: Pick<KnowledgeStoreContext, 'shareCrypto'>,
    tx: KnowledgeTransaction,
    locator: string,
    key: string,
) {
    const [share] = await tx
        .select()
        .from(knowledgeSharesTable)
        .where(eq(knowledgeSharesTable.locator, locator));
    const valid = persistence.shareCrypto.verify(key, share?.keyDigest ?? null);
    if (!valid || !share) throw knowledgeUnavailable();
    const [row] = await tx
        .select()
        .from(knowledgeNotesTable)
        .where(eq(knowledgeNotesTable.id, share.noteId))
        .for('share');

    if (!row || row.status !== 'saved') throw knowledgeUnavailable();
    // Revocation locks the note before deleting this capability. Recheck
    // after the note lock so a queued read cannot use a revoked key.
    const [liveShare] = await tx
        .select()
        .from(knowledgeSharesTable)
        .where(eq(knowledgeSharesTable.noteId, row.id))
        .for('share');

    if (
        !liveShare ||
        liveShare.locator !== locator ||
        !persistence.shareCrypto.verify(key, liveShare.keyDigest)
    )
        throw knowledgeUnavailable();
    const [owner] = await tx
        .select({ status: usersTable.status })
        .from(usersTable)
        .where(eq(usersTable.id, row.ownerId));

    if (owner?.status !== 'active') throw knowledgeUnavailable();

    return row;
}

export async function readShared(
    persistence: KnowledgeStoreContext,
    locator: string,
    key: string,
) {
    return persistence.database.transaction(async (tx) =>
        knowledgeNote(await shared(persistence, tx, locator, key)),
    );
}

export async function copyShared(
    persistence: KnowledgeStoreContext,
    ownerId: string,
    locator: string,
    key: string,
    input: { operationId: string; expectedVersion: number },
) {
    return persistence.database.transaction(async (tx) => {
        await lockKnowledgeOwner(tx, ownerId);
        const fingerprint = knowledgeFingerprint({
            operation: 'shared-copy',
            locator,
            ...input,
        });
        const receipt = await readKnowledgeReceipt(
            tx,
            ownerId,
            input.operationId,
            fingerprint,
        );

        if (receipt) return replayKnowledgeNote(tx, ownerId, receipt);
        const row = await shared(persistence, tx, locator, key);
        if (row.version !== input.expectedVersion)
            throw new KnowledgeDomainError(
                'version_conflict',
                'The shared note changed. Refresh it before copying.',
            );
        const media = await prepareMediaCopy(tx, row.id, row.body);
        const content = KnowledgeNoteContentSchema.parse({
            title: row.title,
            summary: row.summary,
            body: copyWorkbookBody(row.body, media.assetIds),
            categories: row.categories,
            studiedLanguage: row.studiedLanguage,
            explanationLanguage: row.explanationLanguage,
        });
        const now = new Date(),
            id = randomUUID(),
            branchId = randomUUID();
        const [copy] = await tx
            .insert(knowledgeNotesTable)
            .values({
                id,
                ownerId,
                ...content,
                plainText: row.plainText,
                version: 1,
                status: 'saved',
                preferredBranchId: branchId,
                createdAt: now,
                updatedAt: now,
            })
            .returning();

        await media.grant(id);
        await syncLearningEpochs(tx, id, content.body, 1);
        await tx
            .insert(knowledgeNoteRevisionsTable)
            .values({ noteId: id, version: 1, content, createdAt: now });

        await tx.insert(knowledgeWorkingBranchesTable).values({
            id: branchId,
            noteId: id,
            version: 1,
            basePublishedVersion: 1,
            content,
            updatedAt: now,
        });

        await writeKnowledgeReceipt(tx, {
            ownerId,
            operationId: input.operationId,
            operation: 'create',
            fingerprint,
            noteId: id,
            version: 1,
            createdAt: now,
        });

        return knowledgeNote(copy!);
    });
}
