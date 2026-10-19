import type { UIMessage } from 'ai';
import type {
    ConversationDetail,
    ConversationEvent,
    ConversationMessage,
    CopiedAttachment,
    KnowledgeDraft,
} from '@languon/contracts';

/** Provider-neutral public state only; tool arguments and memory never reach the UI. */
export type ConversationUIMessage = UIMessage<
    ConversationMessage,
    {
        canonical: ConversationEvent;
        reconcile: ConversationDetail;
        connection: { reconnecting: boolean };
        material: CopiedAttachment;
        knowledgeDraft: KnowledgeDraft;
    },
    {
        read_source_context: {
            input: Record<string, never>;
            output: { state: 'succeeded' };
        };
        propose_knowledge_note: {
            input: Record<string, never>;
            output: { state: 'succeeded' };
        };
    }
>;

export function conversationUIMessages(
    detail: ConversationDetail,
): ConversationUIMessage[] {
    return detail.messages.map((message) => {
        const parts: ConversationUIMessage['parts'] = [
            { type: 'text', text: message.content },
        ];
        for (const material of message.attachments) {
            parts.push({
                type: 'data-material',
                id: material.id,
                data: material,
            });
        }
        for (const tool of message.toolCalls) {
            if (tool.state === 'running') {
                parts.push({
                    type: `tool-${tool.name}`,
                    toolCallId: tool.id,
                    input: {},
                    state: 'input-available',
                    providerExecuted: true,
                });
            } else if (tool.state === 'failed') {
                parts.push({
                    type: `tool-${tool.name}`,
                    toolCallId: tool.id,
                    input: {},
                    state: 'output-error',
                    errorText: 'Tool could not finish.',
                    providerExecuted: true,
                });
            } else if (tool.name === 'read_source_context') {
                parts.push({
                    type: 'tool-read_source_context',
                    toolCallId: tool.id,
                    input: {},
                    state: 'output-available',
                    output: { state: 'succeeded' },
                    providerExecuted: true,
                });
            } else {
                parts.push({
                    type: 'tool-propose_knowledge_note',
                    toolCallId: tool.id,
                    input: {},
                    state: 'output-available',
                    output: { state: 'succeeded' },
                    providerExecuted: true,
                });
            }
        }
        if (
            message.role === 'assistant' &&
            message.id ===
                detail.messages.findLast((item) => item.role === 'assistant')
                    ?.id
        ) {
            for (const draft of detail.drafts)
                parts.push({
                    type: 'data-knowledgeDraft',
                    id: draft.id,
                    data: draft,
                });
        }
        return { id: message.id, role: message.role, metadata: message, parts };
    });
}
