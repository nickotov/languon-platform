import {
    ConversationToolCallSchema,
    LegacyKnowledgeNoteContentSchema,
    type ConversationToolCall,
    type KnowledgeNoteContent,
} from '@languon/contracts';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { ClaimedConversationTurn } from '../../../application/ports/conversation-store';
import {
    conversationUnavailable,
    type SourceMaterial,
} from '../../../domain/conversation';
import { conversationEvent } from './conversation-events';
import {
    conflict,
    draftView,
    messageView,
    type ConversationPersistenceContext,
} from './conversation-persistence-context';
import {
    conversationWithOperation,
    conversationWithProgress,
} from './conversation-worker-authority';
import {
    conversationDraftsTable as drafts,
    conversationMessagesTable as messages,
    conversationTurnsTable as turns,
} from './schema';

export async function conversationHeartbeat(
    persistence: ConversationPersistenceContext,
    turn: ClaimedConversationTurn,
) {
    await conversationWithProgress(persistence, turn, async (tx) => {
        await tx
            .update(turns)
            .set({
                leaseUntil: new Date(persistence.now().getTime() + 60_000),
                updatedAt: persistence.now(),
            })
            .where(eq(turns.id, turn.id));
    });
}

export async function conversationAppend(
    persistence: ConversationPersistenceContext,
    turn: ClaimedConversationTurn,
    delta: string,
) {
    if (!delta) return;
    await conversationWithProgress(persistence, turn, async (tx) => {
        const [row] = await tx
            .update(messages)
            .set({
                content: sql`left(${messages.content} || ${delta},160000)`,
            })
            .where(
                and(
                    eq(messages.turnId, turn.id),
                    eq(messages.role, 'assistant'),
                ),
            )
            .returning();

        if (row)
            await conversationEvent(
                persistence,
                tx,
                turn.conversationId,
                'message',
                messageView(row),
            );
    });
}

export async function conversationRecordMaterial(
    persistence: ConversationPersistenceContext,
    turn: ClaimedConversationTurn,
    material: SourceMaterial[],
) {
    await conversationWithOperation(persistence, turn, async (tx) => {
        const [row] = await tx
            .select()
            .from(messages)
            .where(
                and(
                    eq(messages.turnId, turn.id),
                    eq(messages.role, 'assistant'),
                ),
            );

        if (!row) throw conversationUnavailable();
        const combined = [...row.attachments];
        for (const item of material) {
            if (!combined.some((existing) => existing.id === item.id))
                combined.push(item);
        }

        const [updated] = await tx
            .update(messages)
            .set({ attachments: combined.slice(0, 100) })
            .where(eq(messages.id, row.id))
            .returning();

        await conversationEvent(
            persistence,
            tx,
            turn.conversationId,
            'message',
            messageView(updated!),
        );
    });
}

export async function conversationRecordTool(
    persistence: ConversationPersistenceContext,
    turn: ClaimedConversationTurn,
    input: ConversationToolCall,
) {
    const call = ConversationToolCallSchema.parse(input);
    await conversationWithOperation(persistence, turn, async (tx) => {
        const [row] = await tx
            .select()
            .from(messages)
            .where(
                and(
                    eq(messages.turnId, turn.id),
                    eq(messages.role, 'assistant'),
                ),
            );

        if (!row) throw conversationUnavailable();
        const current = row.toolCalls.find((item) => item.id === call.id);
        if (current && current.name !== call.name)
            throw conflict('The tool call identifier was already used.');
        if (current && current.state !== 'running') return;
        const toolCalls = [
            ...row.toolCalls.filter((item) => item.id !== call.id),
            call,
        ];

        if (toolCalls.length > 10)
            throw conflict('The response tool limit was reached.');
        const [updated] = await tx
            .update(messages)
            .set({ toolCalls })
            .where(eq(messages.id, row.id))
            .returning();

        await conversationEvent(
            persistence,
            tx,
            turn.conversationId,
            'message',
            messageView(updated!),
        );
    });
}

export async function conversationPropose(
    persistence: ConversationPersistenceContext,
    turn: ClaimedConversationTurn,
    content: KnowledgeNoteContent,
    target?: { noteId: string; version: number },
) {
    return conversationWithOperation(persistence, turn, async (tx) => {
        const now = persistence.now();
        const [row] = await tx
            .insert(drafts)
            .values({
                id: randomUUID(),
                conversationId: turn.conversationId,
                content: LegacyKnowledgeNoteContentSchema.parse(content),
                targetNoteId: target?.noteId ?? null,
                expectedNoteVersion: target?.version ?? null,
                createdAt: now,
                updatedAt: now,
            })
            .returning();
        const result = draftView(row!);
        await conversationEvent(
            persistence,
            tx,
            turn.conversationId,
            'draft',
            result,
        );

        return result;
    });
}
