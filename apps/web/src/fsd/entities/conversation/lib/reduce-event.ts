import type { ConversationDetail, ConversationEvent } from '@languon/contracts';
function upsert<T extends { id: string }>(items: T[], item: T): T[] {
    const index = items.findIndex((value) => value.id === item.id);
    if (index < 0) return [...items, item];
    return items.map((value) => (value.id === item.id ? item : value));
}
export function reduceConversationEvent(
    detail: ConversationDetail | undefined,
    event: ConversationEvent,
): ConversationDetail | undefined {
    if (event.type === 'snapshot') return event.data;
    if (!detail || detail.conversation.id !== event.conversationId)
        return detail;
    if (event.type === 'message')
        return { ...detail, messages: upsert(detail.messages, event.data) };
    if (event.type === 'turn')
        return { ...detail, turns: upsert(detail.turns, event.data) };
    if (event.type === 'draft')
        return { ...detail, drafts: upsert(detail.drafts, event.data) };
    if (event.type === 'draft-deleted')
        return {
            ...detail,
            drafts: detail.drafts.filter(
                (item) => item.id !== event.data.draftId,
            ),
        };
    return detail;
}
