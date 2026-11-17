import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { SubmitConversationTurnRequest } from '@languon/contracts';
import type { TutorMemoryMessage } from '../../../application/ports/tutor-runner';
import {
    messageView,
    turnView,
    type MessageRow,
    type TurnRow,
} from './conversation-persistence-context';
import {
    conversationsTable as chats,
    conversationMessagesTable as messages,
    conversationEventsTable as events,
} from './schema';
import type { ConversationsTransaction } from './conversation-source';

/** Admit the immutable learner message, assistant placeholder and replay events together. */
export async function persistConversationAdmissionMessages(
    tx: ConversationsTransaction,
    input: {
        turn: TurnRow;
        learnerContent: string;
        learnerAttachments: SubmitConversationTurnRequest['attachments'];
        modelContent: Record<string, unknown>;
        promptMentions: MessageRow['promptMentions'];
        editorTarget: MessageRow['editorTarget'];
        now: Date;
    },
) {
    const {
        turn,
        learnerContent,
        learnerAttachments,
        modelContent,
        promptMentions,
        editorTarget,
        now,
    } = input;
    const id = turn.conversationId;
    const turnId = turn.id;
    const snapshot = turn.sourceSnapshot;
    const userId = randomUUID();
    const modelUserMessage: TutorMemoryMessage = {
        id: userId,
        role: 'user',
        content: learnerContent,
        attachments: learnerAttachments,
        createdAt: now.toISOString(),
        modelContent,
    };
    const assistantId = randomUUID();
    const inserted = await tx
        .insert(messages)
        .values([
            {
                id: userId,
                conversationId: id,
                turnId,
                role: 'user',
                content: learnerContent,
                attachments: learnerAttachments,
                modelContent: [modelUserMessage],
                blockReferences: snapshot.blockReferences ?? [],
                promptMentions,
                editorTarget,
                status: 'complete',
                sourceVersion: snapshot.version,
                sourceProvenance: snapshot.provenance,
                createdAt: now,
            },
            {
                id: assistantId,
                conversationId: id,
                turnId,
                role: 'assistant',
                content: '',
                attachments: [],
                editorTarget,
                status: 'streaming',
                sourceVersion: snapshot.version,
                sourceProvenance: snapshot.provenance,
                createdAt: new Date(now.getTime() + 1),
            },
        ])
        .returning();
    const user = inserted.find((row) => row.id === userId);
    const assistant = inserted.find((row) => row.id === assistantId);
    if (!user || !assistant) {
        throw new Error('Conversation messages were not persisted.');
    }

    await tx.update(chats).set({ updatedAt: now }).where(eq(chats.id, id));

    await tx.insert(events).values([
        {
            conversationId: id,
            type: 'message',
            data: messageView(user),
            createdAt: now,
        },
        {
            conversationId: id,
            type: 'message',
            data: messageView(assistant),
            createdAt: now,
        },
        {
            conversationId: id,
            type: 'turn',
            data: turnView(turn!),
            createdAt: now,
        },
    ]);
}
