import { and, eq } from 'drizzle-orm';
import type {
    TextShareAccess,
    TextSourceAuthority,
} from '../../../application/ports/text-content-store';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { TextDomainError } from '../../../domain/text';
import { textsTable, textFoldersTable, textSharesTable } from './schema';
import {
    textDocument,
    type TextsContentTransaction,
} from './text-content-support';
export const textNotFound = () =>
    new TextDomainError('text_not_found', 'The text or folder is unavailable.');
export async function lockTextSource(
    tx: TextsContentTransaction,
    textId: string,
) {
    const [candidate] = await tx
        .select({ folderId: textsTable.folderId, ownerId: textsTable.ownerId })
        .from(textsTable)
        .where(eq(textsTable.id, textId));
    if (!candidate) throw textNotFound();
    const [owner] = await tx
        .select({ status: usersTable.status })
        .from(usersTable)
        .where(eq(usersTable.id, candidate.ownerId))
        .for('share');
    if (owner?.status !== 'active') throw textNotFound();
    const [folder] = await tx
        .select()
        .from(textFoldersTable)
        .where(eq(textFoldersTable.id, candidate.folderId))
        .for('update');
    const [text] = await tx
        .select()
        .from(textsTable)
        .where(eq(textsTable.id, textId))
        .for('update');
    if (
        !folder ||
        !text ||
        text.ownerId !== folder.ownerId ||
        folder.lifecycle !== 'active' ||
        text.lifecycle !== 'active'
    )
        throw textNotFound();
    return { folder, text };
}
export async function resolveTextSource(
    tx: TextsContentTransaction,
    input: {
        actorId: string;
        textId: string;
        version: number;
        share?: TextShareAccess;
    },
    verifyShare: (key: string, digest: string) => boolean | Promise<boolean>,
) {
    const { text } = await lockTextSource(tx, input.textId);
    const authority: TextSourceAuthority = {
        actorId: input.actorId,
        textId: text.id,
        version: text.version,
    };
    if (text.ownerId !== input.actorId) {
        if (!input.share || text.status === 'draft') throw textNotFound();
        const [share] = await tx
            .select()
            .from(textSharesTable)
            .where(
                and(
                    eq(textSharesTable.locator, input.share.locator),
                    eq(textSharesTable.kind, input.share.kind),
                ),
            )
            .for('update');
        if (
            !share ||
            share.ownerId !== text.ownerId ||
            share.resourceId !==
                (share.kind === 'text' ? text.id : text.folderId) ||
            !(await verifyShare(input.share.key, share.keyDigest))
        )
            throw textNotFound();
        authority.share = {
            id: share.id,
            keyDigest: share.keyDigest,
            version: share.version,
        };
    }
    if (text.version !== input.version)
        throw new TextDomainError(
            'version_conflict',
            'The text changed. Reload it and try again.',
        );
    return {
        document: textDocument(text),
        authority,
        sourceOwnerId: text.ownerId,
    };
}
export async function assertTextSourceAuthority(
    tx: TextsContentTransaction,
    authority: TextSourceAuthority,
) {
    const { text } = await lockTextSource(tx, authority.textId);
    if (authority.share) {
        const [share] = await tx
            .select()
            .from(textSharesTable)
            .where(eq(textSharesTable.id, authority.share.id))
            .for('update');
        if (
            !share ||
            text.status === 'draft' ||
            share.ownerId !== text.ownerId ||
            share.resourceId !==
                (share.kind === 'text' ? text.id : text.folderId) ||
            share.keyDigest !== authority.share.keyDigest ||
            share.version !== authority.share.version
        )
            throw textNotFound();
    } else if (text.ownerId !== authority.actorId) throw textNotFound();
    if (text.version !== authority.version)
        throw new TextDomainError(
            'version_conflict',
            'The text changed. Select the phrase again.',
        );
    return textDocument(text);
}
