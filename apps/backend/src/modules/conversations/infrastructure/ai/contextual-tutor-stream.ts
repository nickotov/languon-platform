import type { TutorRunInput } from '../../application/ports/tutor-runner.js';
import { ConversationError } from '../../domain/conversation.js';
import type { createTutorModelGate } from './accounted-tutor-model.js';
import type { createContextualTutorAgent } from './contextual-tutor-configuration.js';
import { toTutorModelMessage } from './conversation-memory-storage.js';

type TutorReplyInput = Pick<
    TutorRunInput,
    'message' | 'conversationId' | 'ownerId' | 'operationId' | 'onDelta'
>;

/** Consume the real SDK stream and await its persistence result before completion. */
export async function streamTutorReply(
    agent: ReturnType<typeof createContextualTutorAgent>,
    input: TutorReplyInput,
    modelGate: Pick<
        ReturnType<typeof createTutorModelGate>,
        'signal' | 'contextExceeded'
    >,
) {
    let text = '';
    let currentMessageId = input.operationId;
    const stream = await agent.stream(
        [
            toTutorModelMessage(
                input.message,
                input.conversationId,
                input.ownerId,
            ),
        ],
        {
            runId: input.operationId,
            abortSignal: modelGate.signal,
            memory: {
                thread: input.conversationId,
                resource: input.ownerId,
                options: { filterIncompleteToolCalls: true },
            },
            maxSteps: 3,
            modelSettings: { maxRetries: 0, maxOutputTokens: 4096 },
        },
    );

    for await (const chunk of stream.fullStream) {
        if (chunk.type === 'step-start' && chunk.payload.messageId) {
            currentMessageId = chunk.payload.messageId;
        }

        if (chunk.type === 'text-delta') {
            text += chunk.payload.text;
            await input.onDelta({
                messageId: currentMessageId,
                text: chunk.payload.text,
            });
        }

        if (chunk.type === 'error') {
            if (modelGate.contextExceeded) {
                throw new ConversationError(
                    'context_too_large',
                    'The complete editor, references and conversation exceed the model input limit after compaction. Reduce the editor text or references and try again.',
                );
            }

            throw new Error(
                'The language provider could not complete this response.',
            );
        }
    }

    const output = await stream.getFullOutput();

    if (
        (output.error || output.finishReason === 'error') &&
        modelGate.contextExceeded
    ) {
        throw new ConversationError(
            'context_too_large',
            'The complete editor, references and conversation exceed the model input limit after compaction. Reduce the editor text or references and try again.',
        );
    }

    if (output.error || output.finishReason === 'error') {
        throw new Error('The response could not be completed or persisted.');
    }

    return text;
}
