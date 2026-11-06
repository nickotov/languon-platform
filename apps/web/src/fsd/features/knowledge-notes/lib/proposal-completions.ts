import type { ConversationDetail } from '@languon/contracts';

const proposalTools = new Set([
    'propose_learning_blocks',
    'generate_vocabulary',
    'generate_grammar',
    'generate_bilingual_text',
    'generate_exercises',
]);

/** Only durable successful publication can make a new block proposal readable. */
export function blockProposalCompletionKey(
    detail: ConversationDetail | undefined,
): string {
    if (!detail) {
        return '';
    }

    const producing = new Set(
        detail.messages
            .filter(
                (message) =>
                    message.role === 'assistant' &&
                    (message.responseMetadata?.kind === 'generation' ||
                        (message.responseMetadata?.kind === 'revision' &&
                            !message.responseMetadata.documentUse) ||
                        message.toolCalls.some(
                            (call) =>
                                call.state === 'succeeded' &&
                                proposalTools.has(call.name),
                        )),
            )
            .map((message) => message.turnId),
    );

    return detail.turns
        .filter((turn) => turn.status === 'succeeded' && producing.has(turn.id))
        .map((turn) => turn.id)
        .sort()
        .join(',');
}
