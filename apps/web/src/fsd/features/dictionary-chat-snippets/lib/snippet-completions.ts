import type { ConversationDetail } from '@languon/contracts';

export function dictionarySnippetCompletionKey(
    detail: ConversationDetail | undefined,
): string {
    if (!detail) {
        return '';
    }

    const terminalTurns = detail.turns
        .filter((turn) => turn.status !== 'queued' && turn.status !== 'running')
        .map((turn) => `${turn.id}:${turn.status}`);
    const publishedTools = detail.messages.flatMap((message) =>
        message.toolCalls
            .filter(
                (tool) =>
                    tool.name === 'propose_dictionary_snippet' &&
                    tool.state === 'succeeded',
            )
            .map((tool) => tool.id),
    );

    return [...terminalTurns, ...publishedTools].sort().join(',');
}
