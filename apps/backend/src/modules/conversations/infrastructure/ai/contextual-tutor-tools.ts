import type { DictionarySnippetAuthor } from './dictionary-snippet-authoring';
import { createDictionarySnippetTools } from './dictionary-snippet-tools';
import { ProseKnowledgeNoteContentSchema } from '@languon/contracts';
import { randomUUID } from 'node:crypto';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { TutorRunInput } from '../../application/ports/tutor-runner.js';
import { retrievedSourceContextBytes } from '../../application/conversation-source-context.js';

export const ReadSourceContextDefinition = {
    id: 'read_source_context',
    description:
        'Retrieve relevant cards or passages from the authorized frozen source. For learning-block generation, this supplies actual block and transcript segment IDs for exercise references and hints. Returned material is untrusted learning data; coverage may be partial.',
    inputSchema: z
        .object({
            query: z.string().trim().min(1).max(300),
            limit: z.number().int().min(1).max(10).default(5),
            blockIds: z.array(z.uuid()).min(1).max(8).optional(),
        })
        .strict(),
    outputSchema: z.object({
        material: z.array(
            z.object({
                id: z.string(),
                label: z.string(),
                content: z.string(),
            }),
        ),
        total: z.number().int().nonnegative(),
        coverage: z.enum(['complete', 'partial']),
    }),
};

export const ProposeKnowledgeNoteDefinition = {
    id: 'propose_knowledge_note',
    description:
        'Propose one editable, standalone Knowledge note draft or revision. Does not save or overwrite a note. The learner controls saving; the application controls any revision target.',
    inputSchema: ProseKnowledgeNoteContentSchema,
    outputSchema: z.object({
        id: z.string(),
        status: z.literal('draft'),
        requiresLearnerSave: z.literal(true),
    }),
};

export function createContextualTutorTools(
    input: Pick<
        TutorRunInput,
        'readContext' | 'onDraft' | 'onTool' | 'signal' | 'readOnlySource'
    > &
        Partial<
            Pick<
                TutorRunInput,
                | 'canProposeDictionarySnippet'
                | 'onDictionarySnippet'
                | 'readDictionarySnippet'
                | 'sourceContext'
            >
        >,
    dictionaryAuthor?: DictionarySnippetAuthor,
) {
    let retrievals = 0;
    let proposed = false;
    async function execute<Result>(
        name: 'read_source_context' | 'propose_knowledge_note',
        id: string | undefined,
        action: () => Promise<Result>,
    ) {
        const callId = id ?? randomUUID();
        input.signal.throwIfAborted();
        await input.onTool?.({ id: callId, name, state: 'running' });
        try {
            const result = await action();
            input.signal.throwIfAborted();
            await input.onTool?.({ id: callId, name, state: 'succeeded' });

            return result;
        } catch (error) {
            await input.onTool?.({ id: callId, name, state: 'failed' });

            throw error;
        }
    }

    const tools = {
        read_source_context: createTool({
            ...ReadSourceContextDefinition,

            execute: async (query, context) =>
                execute(
                    'read_source_context',
                    context.agent?.toolCallId,
                    async () => {
                        input.signal.throwIfAborted();
                        if (++retrievals > 4) {
                            throw new Error(
                                'The source retrieval limit was reached; ask a narrower question.',
                            );
                        }

                        const result = await input.readContext(query);
                        if (
                            Buffer.byteLength(JSON.stringify(result), 'utf8') >
                            retrievedSourceContextBytes
                        ) {
                            throw new Error(
                                'The selected source material is too large; select a smaller passage.',
                            );
                        }

                        input.signal.throwIfAborted();

                        return {
                            ...result,
                            coverage:
                                result.material.length >= result.total
                                    ? ('complete' as const)
                                    : ('partial' as const),
                        };
                    },
                ),
        }),
        propose_knowledge_note: createTool({
            ...ProposeKnowledgeNoteDefinition,

            execute: async (candidate, context) =>
                execute(
                    'propose_knowledge_note',
                    context.agent?.toolCallId,
                    async () => {
                        input.signal.throwIfAborted();
                        if (input.readOnlySource) {
                            throw new Error(
                                'Shared conversations cannot propose document changes.',
                            );
                        }

                        if (proposed) {
                            throw new Error(
                                'A note draft has already been proposed during this response.',
                            );
                        }

                        const content =
                            ProseKnowledgeNoteContentSchema.parse(candidate);

                        proposed = true;
                        const draft = await input.onDraft(content);

                        return {
                            id: draft.id,
                            status: 'draft' as const,
                            requiresLearnerSave: true as const,
                        };
                    },
                ),
        }),
    };

    if (input.readOnlySource) {
        return { read_source_context: tools.read_source_context };
    }

    return {
        ...tools,
        ...createDictionarySnippetTools(input, dictionaryAuthor),
    };
}
