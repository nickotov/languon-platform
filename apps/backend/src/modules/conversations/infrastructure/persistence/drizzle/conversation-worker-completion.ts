import { and, asc, eq, sql } from 'drizzle-orm';
import type { ClaimedConversationTurn } from '../../../application/ports/conversation-store';
import type {
    TutorMemoryMessage,
    TutorMemoryPort,
} from '../../../application/ports/tutor-runner';
import { ConversationError } from '../../../domain/conversation';
import {
    prepareConversationActionSettlement,
    settleConversationAction,
} from '../../conversation-action-accounting';
import { conversationEvent } from './conversation-events';
import type { TurnRow } from './conversation-persistence-context';
import {
    messageView,
    turnView,
    type ConversationPersistenceContext,
} from './conversation-persistence-context';
import type { ConversationsTransaction } from './conversation-source';
import { conversationWithOperation } from './conversation-worker-authority';
import {
    conversationMemoryTable as memory,
    conversationMessagesTable as messages,
    conversationTurnsTable as turns,
} from './schema';

export async function conversationTerminal(
    persistence: ConversationPersistenceContext,
    tx: ConversationsTransaction,
    row: TurnRow,
    status: 'succeeded' | 'failed' | 'cancelled',
    failureCode?: string,
) {
    await prepareConversationActionSettlement(tx, row);
    const [turn] = await tx
        .update(turns)
        .set({
            status,
            cancelRequested:
                status === 'cancelled' && row.failureCode === 'explicit_stop'
                    ? true
                    : row.cancelRequested,
            failureCode:
                status === 'cancelled' && row.failureCode === 'explicit_stop'
                    ? 'explicit_stop'
                    : (failureCode ?? null),
            portraitContext: null,
            leaseToken: null,
            leaseUntil: null,
            updatedAt: persistence.now(),
        })
        .where(eq(turns.id, row.id))
        .returning();

    if (turn)
        await settleConversationAction(
            tx,
            turn,
            status === 'cancelled' && row.failureCode === 'explicit_stop',
        );
    const [message] = await tx
        .update(messages)
        .set({
            status: status === 'succeeded' ? 'complete' : 'incomplete',
            toolCalls: sql`coalesce((select jsonb_agg(case when item->>'state' = 'running' then jsonb_set(item, '{state}', '"failed"'::jsonb) else item end) from jsonb_array_elements(${messages.toolCalls}) as item), '[]'::jsonb)`,
        })
        .where(and(eq(messages.turnId, row.id), eq(messages.role, 'assistant')))
        .returning();

    if (message)
        await conversationEvent(
            persistence,
            tx,
            row.conversationId,
            'message',
            messageView(message),
        );
    await conversationEvent(
        persistence,
        tx,
        row.conversationId,
        'turn',
        turnView(turn!),
    );
}

export async function conversationFinish(
    persistence: ConversationPersistenceContext,
    turn: ClaimedConversationTurn,
    status: 'succeeded' | 'failed' | 'cancelled',
    failureCode?: string,
) {
    await conversationWithOperation(
        persistence,
        turn,
        async (tx, row) =>
            conversationTerminal(
                persistence,
                tx,
                row,
                row.cancelRequested ? 'cancelled' : status,
                row.cancelRequested ? 'cancelled' : failureCode,
            ),
        true,
    );
}

export function conversationMemory(
    persistence: ConversationPersistenceContext,
    turn: ClaimedConversationTurn,
): TutorMemoryPort {
    return {
        listMessages: (input) =>
            conversationWithOperation(persistence, turn, async (tx) => {
                const rows = await tx
                    .select()
                    .from(messages)
                    .where(eq(messages.conversationId, turn.conversationId))
                    .orderBy(asc(messages.createdAt));
                let values: TutorMemoryMessage[] = rows.flatMap((row) =>
                    row.modelContent?.length
                        ? row.modelContent
                        : row.role === 'user'
                          ? [
                                {
                                    id: row.id,
                                    role: row.role,
                                    content: row.content,
                                    attachments: row.attachments,
                                    createdAt: row.createdAt.toISOString(),
                                },
                            ]
                          : [],
                );

                values = values.filter(
                    (item) =>
                        (!input.ids || input.ids.includes(item.id)) &&
                        (!input.after || item.createdAt >= input.after) &&
                        (!input.before || item.createdAt <= input.before),
                );

                if (input.order === 'desc') values.reverse();

                return {
                    messages: values.slice(
                        input.offset,
                        input.offset + input.limit,
                    ),
                    total: values.length,
                };
            }),
        saveMessages: (values) =>
            conversationWithOperation(persistence, turn, async (tx) => {
                const rows = await tx
                    .select()
                    .from(messages)
                    .where(eq(messages.conversationId, turn.conversationId));

                for (const value of values) {
                    const original = rows.find(
                        (row) =>
                            row.id === value.id ||
                            row.modelContent?.some(
                                (segment) => segment.id === value.id,
                            ),
                    );

                    if (value.role === 'user') {
                        if (
                            !original ||
                            original.role !== 'user' ||
                            original.content !== value.content
                        )
                            throw new ConversationError(
                                'memory_conflict',
                                'Original learner messages cannot be rewritten.',
                            );
                        await tx
                            .update(messages)
                            .set({
                                modelContent: [
                                    {
                                        ...value,
                                        content: original.content,
                                        attachments: original.attachments,
                                    },
                                ],
                            })
                            .where(eq(messages.id, original.id));

                        continue;
                    }

                    const target =
                        original ??
                        rows.find(
                            (row) =>
                                row.turnId === turn.id &&
                                row.role === 'assistant',
                        );

                    if (!target || target.role !== 'assistant')
                        throw new ConversationError(
                            'memory_conflict',
                            'The message does not belong to this response.',
                        );
                    const segments = [...(target.modelContent ?? [])];
                    const index = segments.findIndex(
                        (segment) => segment.id === value.id,
                    );

                    if (index < 0) segments.push(value);
                    else segments[index] = value;
                    target.modelContent = segments;
                    await tx
                        .update(messages)
                        .set({ modelContent: segments })
                        .where(eq(messages.id, target.id));
                }
            }),
        readState: (key) =>
            conversationWithOperation(persistence, turn, async (tx) => {
                const [row] = await tx
                    .select()
                    .from(memory)
                    .where(
                        and(
                            eq(memory.conversationId, turn.conversationId),
                            eq(memory.key, key),
                        ),
                    );

                return (row?.value as Record<string, unknown> | null) ?? null;
            }),
        writeState: (entries) =>
            conversationWithOperation(persistence, turn, async (tx) => {
                for (const [key, value] of Object.entries(entries))
                    await tx
                        .insert(memory)
                        .values({
                            conversationId: turn.conversationId,
                            key,
                            value,
                            updatedAt: persistence.now(),
                        })
                        .onConflictDoUpdate({
                            target: [memory.conversationId, memory.key],
                            set: { value, updatedAt: persistence.now() },
                        });
            }),
    };
}
