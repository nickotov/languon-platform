import type { UIMessageChunk } from 'ai';
import type {
    ConversationDetail,
    ConversationEvent,
    ConversationMessage,
} from '@languon/contracts';
import { reduceConversationEvent } from './reduce-event';

/** Projects only validated public durable state, never Mastra/provider tool payloads. */
export class DurableMessageProjection {
    private detail: ConversationDetail | undefined;
    private current: ConversationMessage | undefined;
    private textOpen = false;
    private readonly tools = new Map<string, string>();

    constructor(detail?: ConversationDetail) {
        this.detail = detail;
    }

    project(event: ConversationEvent): UIMessageChunk[] {
        this.detail = reduceConversationEvent(this.detail, event);
        const chunks: UIMessageChunk[] = [
            { type: 'data-canonical', data: event, transient: true },
        ];
        if (event.type !== 'message' || event.data.role !== 'assistant') {
            if (this.detail && event.type !== 'turn') {
                chunks.push({
                    type: 'data-reconcile',
                    data: this.detail,
                    transient: true,
                });
                // The SDK's private response state must be rebuilt after a canonical
                // replacement; subsequent deltas must retain copied material/draft parts.
                this.current = undefined;
            }
            if (event.type === 'snapshot') {
                this.current = undefined;
                this.textOpen = false;
                this.tools.clear();
            }
            return chunks;
        }
        const message = event.data;
        const previous = this.current;
        const rebuild =
            !previous ||
            previous.id !== message.id ||
            !message.content.startsWith(previous.content) ||
            previous.status !== 'streaming' ||
            JSON.stringify(previous.attachments) !==
                JSON.stringify(message.attachments) ||
            previous.toolCalls.some((tool) => {
                const current = message.toolCalls.find(
                    (item) => item.id === tool.id,
                );
                return (
                    !current ||
                    current.name !== tool.name ||
                    (tool.state !== 'running' && current.state !== tool.state)
                );
            });
        if (rebuild) {
            if (this.textOpen) chunks.push({ type: 'text-end', id: 'answer' });
            chunks.push({
                type: 'start',
                messageId: message.id,
                messageMetadata: message,
            });
            // sendMessage and resumeStream have different SDK reset defaults. Explicitly
            // reset the public response parts when rebuilding either subscription mode.
            chunks.push({ type: 'reset-step' });
            chunks.push({ type: 'text-start', id: 'answer' });
            this.textOpen = true;
            this.tools.clear();
            for (const material of message.attachments)
                chunks.push({
                    type: 'data-material',
                    id: material.id,
                    data: material,
                });
        }
        if (
            rebuild &&
            this.detail?.messages.findLast((item) => item.role === 'assistant')
                ?.id === message.id
        ) {
            for (const draft of this.detail.drafts)
                chunks.push({
                    type: 'data-knowledgeDraft',
                    id: draft.id,
                    data: draft,
                });
        }
        const delta = rebuild
            ? message.content
            : message.content.slice(previous.content.length);
        if (delta) chunks.push({ type: 'text-delta', id: 'answer', delta });
        for (const tool of message.toolCalls) {
            const prior = this.tools.get(tool.id);
            if (prior === tool.state) continue;
            if (prior === undefined)
                chunks.push({
                    type: 'tool-input-available',
                    toolCallId: tool.id,
                    toolName: tool.name,
                    input: {},
                    providerExecuted: true,
                });
            if (tool.state === 'succeeded')
                chunks.push({
                    type: 'tool-output-available',
                    toolCallId: tool.id,
                    output: { state: 'succeeded' },
                    providerExecuted: true,
                });
            if (tool.state === 'failed')
                chunks.push({
                    type: 'tool-output-error',
                    toolCallId: tool.id,
                    errorText: 'Tool could not finish.',
                    providerExecuted: true,
                });
            this.tools.set(tool.id, tool.state);
        }
        chunks.push({ type: 'message-metadata', messageMetadata: message });
        if (message.status !== 'streaming') {
            if (this.textOpen) chunks.push({ type: 'text-end', id: 'answer' });
            chunks.push({
                type: 'finish',
                finishReason: message.status === 'complete' ? 'stop' : 'other',
            });
            this.textOpen = false;
        }
        this.current = message;
        return chunks;
    }
}
