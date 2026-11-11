import { createHash } from 'node:crypto';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
    ApplyDictionaryChatSnippetRequestSchema,
    ApplyDictionaryChatSnippetResponseSchema,
    DictionaryChatGenerationContextSchema,
    DictionaryChatSnippetSchema,
    type ApplyDictionaryChatSnippetRequest,
    type DictionaryChatSnippetInput,
} from '@languon/contracts';
import type {
    ClaimedConversationTurn,
    ConversationAccess,
} from '../../../application/ports/conversation-store';
import { conversationUnavailable } from '../../../domain/conversation';
import { validateDictionaryChatSnippet } from '../../../domain/dictionary-snippet';
import { acquireGlobalPermit } from '../../../../dictionaries/infrastructure/persistence/drizzle/dictionary-aggregate-state';
import { applyDictionaryChatCards } from '../../../../dictionaries/infrastructure/persistence/drizzle/dictionary-chat-snippet-application';
import {
    conversationAuthorize,
    conversationTransaction,
} from './conversation-persistence-authority';
import {
    conflict,
    type ConversationPersistenceContext,
} from './conversation-persistence-context';
import { conversationWithOperation } from './conversation-worker-authority';
import { conversationTurnsTable as turns } from './schema';
import {
    conversationDictionarySnippetsTable as snippets,
    dictionaryChatSnippetApplicationsTable as applications,
} from './conversation-dictionary-snippet-schema';
import type { ConversationsTransaction } from './conversation-source';

function snippetView(row: typeof snippets.$inferSelect) {
    return DictionaryChatSnippetSchema.parse({
        ...row,
        createdAt: row.createdAt.toISOString(),
    });
}

async function ownerContext(
    persistence: ConversationPersistenceContext,
    tx: ConversationsTransaction,
    access: ConversationAccess,
    id: string,
) {
    const authorized = await conversationAuthorize(persistence, tx, access, id);
    if (
        authorized.chat.source.kind !== 'dictionary' ||
        authorized.authority.sourceOwnerId !== access.ownerId ||
        authorized.authority.share
    ) {
        throw conversationUnavailable();
    }

    return authorized;
}

function assertTurnTarget(turn: ClaimedConversationTurn) {
    if (
        turn.source.kind !== 'dictionary' ||
        turn.authority.sourceOwnerId !== turn.ownerId ||
        turn.authority.share ||
        !turn.sourceSnapshot.dictionaryGenerationContext
    ) {
        throw conversationUnavailable();
    }

    return DictionaryChatGenerationContextSchema.parse(
        turn.sourceSnapshot.dictionaryGenerationContext,
    );
}

export function conversationProposeDictionarySnippet(
    persistence: ConversationPersistenceContext,
    turn: ClaimedConversationTurn,
    input: DictionaryChatSnippetInput,
) {
    return conversationWithOperation(persistence, turn, async (tx, row) => {
        const generationContext = assertTurnTarget({
            ...turn,
            sourceSnapshot: row.sourceSnapshot,
        });
        const validated = validateDictionaryChatSnippet(
            input,
            generationContext,
        );
        const result = await tx
            .execute(
                sql`select public.languon_propose_dictionary_chat_snippet(${turn.id}::uuid, ${turn.leaseToken}::uuid, ${JSON.stringify(validated)}::jsonb) as id`,
            )
            .catch(() => {
                throw conflict('The dictionary snippet could not be saved.');
            });
        const id = result[0]?.['id'];
        if (typeof id !== 'string') {
            throw conflict('The dictionary snippet could not be saved.');
        }

        return { id };
    });
}

export function conversationReadDictionarySnippet(
    persistence: ConversationPersistenceContext,
    turn: ClaimedConversationTurn,
    snippetId: string,
) {
    return conversationWithOperation(persistence, turn, async (tx) => {
        assertTurnTarget(turn);
        const result = await tx
            .execute(
                sql`select public.languon_read_dictionary_chat_snippet(${turn.id}::uuid, ${turn.leaseToken}::uuid, ${snippetId}::uuid) as snapshot`,
            )
            .catch(() => {
                throw conversationUnavailable();
            });

        return DictionaryChatSnippetSchema.parse(result[0]?.['snapshot']);
    });
}

export function conversationListDictionarySnippets(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    id: string,
) {
    return conversationTransaction(
        persistence,
        async (tx) => {
            const { chat } = await ownerContext(persistence, tx, access, id);
            const rows = await tx
                .select()
                .from(snippets)
                .where(
                    and(
                        eq(snippets.conversationId, id),
                        eq(snippets.dictionaryId, chat.sourceId),
                        inArray(
                            snippets.turnId,
                            tx
                                .select({ id: turns.id })
                                .from(turns)
                                .where(eq(turns.status, 'succeeded')),
                        ),
                    ),
                )
                .orderBy(asc(snippets.createdAt), asc(snippets.id));

            return { snippets: rows.map(snippetView) };
        },
        false,
    );
}

export function conversationApplyDictionarySnippet(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    id: string,
    snippetId: string,
    input: ApplyDictionaryChatSnippetRequest,
) {
    const request = ApplyDictionaryChatSnippetRequestSchema.parse(input);
    const selectedIndices = [...request.selectedIndices].sort(
        (left, right) => left - right,
    );
    const fingerprint = createHash('sha256')
        .update(
            JSON.stringify({
                conversationId: id,
                snippetId,
                ...request,
                selectedIndices,
            }),
        )
        .digest('hex');

    return conversationTransaction(
        persistence,
        async (tx) => {
            // Match ordinary card creation: reject global saturation before
            // acquiring an owner's lifecycle fence or any resource row lock.
            await acquireGlobalPermit(tx, 4, 32);
            const { chat } = await ownerContext(persistence, tx, access, id);
            const [snippet] = await tx
                .select()
                .from(snippets)
                .where(
                    and(
                        eq(snippets.id, snippetId),
                        eq(snippets.conversationId, id),
                        eq(snippets.dictionaryId, chat.sourceId),
                        inArray(
                            snippets.turnId,
                            tx
                                .select({ id: turns.id })
                                .from(turns)
                                .where(eq(turns.status, 'succeeded')),
                        ),
                    ),
                );

            if (!snippet) {
                throw conversationUnavailable();
            }

            const [replay] = await tx
                .select()
                .from(applications)
                .where(eq(applications.operationId, request.operationId));

            if (replay) {
                if (
                    replay.ownerId !== access.ownerId ||
                    replay.snippetId !== snippetId ||
                    replay.fingerprint !== fingerprint
                ) {
                    throw conflict(
                        'This operation was already used for another application.',
                    );
                }

                return ApplyDictionaryChatSnippetResponseSchema.parse(
                    replay.result,
                );
            }

            const validated = snippetView(snippet);
            const values = selectedIndices.map((index) => {
                const value = validated.cards[index];
                if (!value) {
                    throw conflict('The selected card is unavailable.');
                }

                return value;
            });
            const now = persistence.now();
            const result = ApplyDictionaryChatSnippetResponseSchema.parse(
                await applyDictionaryChatCards(tx, {
                    ownerId: access.ownerId,
                    dictionaryId: chat.sourceId,
                    values,
                    request,
                    now,
                }),
            );

            await tx.insert(applications).values({
                operationId: request.operationId,
                ownerId: access.ownerId,
                snippetId,
                fingerprint,
                result,
                createdAt: now,
            });

            return result;
        },
        false,
    );
}
