import { transcriptMessage } from './conversation-transcript';
import { and, desc, eq } from 'drizzle-orm';
import {
    tutorAdmissionInputBytes,
    tutorMinimumInputBytes,
} from '../../../application/tutor-context-budget';
import type { ConversationsTransaction } from './conversation-source';
import {
    conversationMessagesTable as messages,
    conversationMemoryTable as memory,
} from './schema';

export async function chatAdmissionInput(
    tx: ConversationsTransaction,
    id: string,
    contextInput: Parameters<typeof tutorAdmissionInputBytes>[0],
) {
    const recent = await tx
        .select({
            modelContent: messages.modelContent,
            content: messages.content,
            attachments: messages.attachments,
        })
        .from(messages)
        .where(and(eq(messages.conversationId, id), transcriptMessage()))
        .orderBy(desc(messages.createdAt))
        .limit(20);
    const retainedMemory = await tx
        .select({ key: memory.key, value: memory.value })
        .from(memory)
        .where(eq(memory.conversationId, id));

    return {
        inputTokenBound: tutorAdmissionInputBytes(
            contextInput,
            recent,
            retainedMemory,
        ),
        minimumInputBound: tutorMinimumInputBytes(contextInput, retainedMemory),
    };
}
