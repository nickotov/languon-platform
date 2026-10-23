import { and, desc, eq, ilike, or } from 'drizzle-orm';
import {
    textFoldersTable,
    textsTable,
} from '../../../../texts/infrastructure/persistence/drizzle/schema';
import type { ConversationAccess } from '../../../application/ports/conversation-store';
import { conversationUnavailable } from '../../../domain/conversation';
import {
    conversationAuthorize,
    conversationReadTransaction,
} from './conversation-persistence-authority';
import { type ConversationPersistenceContext } from './conversation-persistence-context';

export async function conversationContext(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    id: string,
    query: string,
) {
    return conversationReadTransaction(persistence, async (tx) => {
        const { snapshot } = await conversationAuthorize(
            persistence,
            tx,
            access,
            id,
            true,
            query,
            false,
        );
        const normalized = query.toLocaleLowerCase();
        const matches = snapshot.material.filter(
            (item) =>
                !query ||
                `${item.label}\n${item.content}`
                    .toLocaleLowerCase()
                    .includes(normalized),
        );

        return { material: matches.slice(0, 24), total: matches.length };
    });
}

export async function conversationTextReferences(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    id: string,
    query: string,
) {
    return conversationReadTransaction(persistence, async (tx) => {
        await conversationAuthorize(
            persistence,
            tx,
            access,
            id,
            false,
            '',
            false,
        );

        const escaped = query.replaceAll(/[\\%_]/gu, '\\$&');
        const pattern = `%${escaped}%`;
        const rows = await tx
            .select({
                id: textsTable.id,
                title: textsTable.title,
                sourceLanguage: textsTable.sourceLanguage,
                translationLanguage: textsTable.targetLanguage,
                alignment: textsTable.alignment,
            })
            .from(textsTable)
            .innerJoin(
                textFoldersTable,
                eq(textFoldersTable.id, textsTable.folderId),
            )
            .where(
                and(
                    eq(textsTable.ownerId, access.ownerId),
                    eq(textsTable.lifecycle, 'active'),
                    eq(textFoldersTable.ownerId, access.ownerId),
                    eq(textFoldersTable.lifecycle, 'active'),
                    query
                        ? or(
                              ilike(textsTable.title, pattern),
                              ilike(textsTable.sourceText, pattern),
                          )
                        : undefined,
                ),
            )
            .orderBy(desc(textsTable.updatedAt))
            .limit(20);

        return {
            references: rows.map((row) => ({
                id: row.id,
                title: row.title,
                sourceLanguage: row.sourceLanguage,
                translationLanguage: row.alignment
                    ? row.translationLanguage
                    : null,
                hasTranslation: !!row.alignment,
            })),
        };
    });
}

export async function conversationTextReference(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    id: string,
    textId: string,
) {
    return conversationReadTransaction(persistence, async (tx) => {
        await conversationAuthorize(
            persistence,
            tx,
            access,
            id,
            false,
            '',
            false,
        );

        const [row] = await tx
            .select({
                id: textsTable.id,
                title: textsTable.title,
                content: textsTable.sourceText,
                sourceLanguage: textsTable.sourceLanguage,
                translationLanguage: textsTable.targetLanguage,
                alignment: textsTable.alignment,
            })
            .from(textsTable)
            .innerJoin(
                textFoldersTable,
                eq(textFoldersTable.id, textsTable.folderId),
            )
            .where(
                and(
                    eq(textsTable.id, textId),
                    eq(textsTable.ownerId, access.ownerId),
                    eq(textsTable.lifecycle, 'active'),
                    eq(textFoldersTable.ownerId, access.ownerId),
                    eq(textFoldersTable.lifecycle, 'active'),
                ),
            );

        if (!row) throw conversationUnavailable();

        return {
            reference: {
                id: row.id,
                title: row.title,
                content: row.content,
                sourceLanguage: row.sourceLanguage,
                translationLanguage: row.alignment
                    ? row.translationLanguage
                    : null,
                hasTranslation: !!row.alignment,
                translation: row.alignment
                    ? row.alignment.translation
                          .map((part) => part.text)
                          .join('\n')
                    : null,
            },
        };
    });
}
