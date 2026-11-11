import {
    DictionaryChatSnippetInputSchema,
    type DictionaryChatGenerationContext,
    type DictionaryChatSnippet,
    type DictionaryChatSnippetInput,
} from '@languon/contracts';
import { ConversationError } from '../../domain/conversation';
import { validateDictionaryChatSnippet } from '../../domain/dictionary-snippet';
import { generateTutorObject } from './tutor-request-agents';
import type { Agent } from '@mastra/core/agent';

export type DictionarySnippetAuthor = (input: {
    request: string;
    count: number;
    context: DictionaryChatGenerationContext;
    source?: DictionaryChatSnippet;
}) => Promise<DictionaryChatSnippetInput>;

/** The caller's validated brief fixes count before this independent model output exists. */
export function createDictionarySnippetAuthoring(options: {
    agent: Agent;
    signal: AbortSignal;
    operationId: string;
    abort: (error: unknown) => void;
}): DictionarySnippetAuthor {
    return async (input) => {
        try {
            const object = await generateTutorObject({
                agent: options.agent,
                signal: options.signal,
                operationId: `${options.operationId}:dictionary-authoring`,
                maxOutputTokens: 4096,
                schema: DictionaryChatSnippetInputSchema,
                prompt: `Dictionary snippet generation request: ${JSON.stringify(
                    {
                        request: input.request,
                        count: input.count,
                        generationContext: input.context,
                        sourceSnippet: input.source
                            ? {
                                  id: input.source.id,
                                  title: input.source.title,
                                  cards: input.source.cards.map(
                                      (values, index) => ({ index, values }),
                                  ),
                              }
                            : null,
                    },
                )}`,
            });
            const parsed = DictionaryChatSnippetInputSchema.safeParse(object);
            if (!parsed.success || parsed.data.cards.length !== input.count) {
                throw new ConversationError(
                    'invalid_output',
                    'The complete requested card count was not generated; no snippet was saved.',
                );
            }

            return validateDictionaryChatSnippet(parsed.data, input.context);
        } catch (error) {
            // A swallowed native-tool error must not turn technical generation failure
            // into a successful/charged conversation or trigger another paid batch.
            options.abort(error);

            throw error;
        }
    };
}
