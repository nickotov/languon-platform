import type { DictionarySnippetAuthor } from './dictionary-snippet-authoring';
import { randomUUID } from 'node:crypto';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
    DictionaryChatGenerationContextSchema,
    DictionaryChatSnippetInputSchema,
    DictionaryChatSnippetGenerationRequestSchema,
    dictionaryChatSnippetDefaultCards,
    dictionaryChatSnippetMaxCards,
    DictionaryChatSnippetSchema,
} from '@languon/contracts';
import { validateDictionaryChatSnippet } from '../../domain/dictionary-snippet';
import { retrievedSourceContextBytes } from '../../application/conversation-source-context';
import type { TutorRunInput } from '../../application/ports/tutor-runner';

type DictionaryToolInput = Pick<TutorRunInput, 'signal' | 'onTool'> &
    Partial<
        Pick<
            TutorRunInput,
            | 'canProposeDictionarySnippet'
            | 'onDictionarySnippet'
            | 'readDictionarySnippet'
            | 'sourceContext'
        >
    >;

/** Native tools propose immutable values; they never acquire dictionary write authority. */
export function createDictionarySnippetTools(
    input: DictionaryToolInput,
    author?: DictionarySnippetAuthor,
) {
    if (!input.canProposeDictionarySnippet) {
        return {};
    }

    const context = DictionaryChatGenerationContextSchema.parse(
        input.sourceContext?.dictionaryGenerationContext,
    );
    const publish = input.onDictionarySnippet;
    const read = input.readDictionarySnippet;
    if (!publish || !read || !author) {
        throw new Error(
            'Dictionary snippet capabilities require fenced persistence.',
        );
    }

    let proposed = false;
    let reads = 0;
    async function execute<Result>(
        name: 'propose_dictionary_snippet' | 'read_dictionary_snippet',
        suppliedId: string | undefined,
        action: () => Promise<Result>,
    ) {
        const id = suppliedId ?? randomUUID();
        input.signal.throwIfAborted();
        await input.onTool?.({ id, name, state: 'running' });
        try {
            const result = await action();
            input.signal.throwIfAborted();
            await input.onTool?.({ id, name, state: 'succeeded' });

            return result;
        } catch (error) {
            await input.onTool?.({ id, name, state: 'failed' });

            throw error;
        }
    }

    return {
        propose_dictionary_snippet: createTool({
            id: 'propose_dictionary_snippet',
            description:
                'Generate a complete read-only dictionary snippet from a brief, not authored cards. Supply the explicit learner count when requested; otherwise omit count for host default ten. For a revision pass sourceSnippetId so the author reads exact retained cards and preserves their count unless changed explicitly. Authoring uses the current operation-bound accounted model and dictionary settings. This never inserts/replaces cards, changes settings or grants write authority.',
            inputSchema: DictionaryChatSnippetGenerationRequestSchema,
            outputSchema: z
                .object({
                    id: z.uuid(),
                    status: z.literal('ready'),
                    cardCount: z.number().int().positive().max(100),
                    requiresLearnerApply: z.literal(true),
                })
                .strict(),
            execute: (candidate, toolContext) =>
                execute(
                    'propose_dictionary_snippet',
                    toolContext.agent?.toolCallId,
                    async () => {
                        if (proposed) {
                            throw new Error(
                                'A dictionary snippet was already proposed in this response.',
                            );
                        }

                        const brief =
                            DictionaryChatSnippetGenerationRequestSchema.parse(
                                candidate,
                            );

                        proposed = true;
                        const source = brief.sourceSnippetId
                            ? DictionaryChatSnippetSchema.parse(
                                  await read(brief.sourceSnippetId),
                              )
                            : undefined;

                        input.signal.throwIfAborted();
                        const count =
                            brief.count ??
                            source?.cards.length ??
                            dictionaryChatSnippetDefaultCards;
                        const generated = await author({
                            request: brief.request,
                            count,
                            context,
                            ...(source ? { source } : {}),
                        });
                        const validated = validateDictionaryChatSnippet(
                            generated,
                            context,
                        );

                        if (validated.cards.length !== count) {
                            throw new Error(
                                'The complete requested card count was not generated.',
                            );
                        }

                        const result = await publish(validated);

                        return {
                            id: result.id,
                            status: 'ready' as const,
                            cardCount: validated.cards.length,
                            requiresLearnerApply: true as const,
                        };
                    },
                ),
        }),
        read_dictionary_snippet: createTool({
            id: 'read_dictionary_snippet',
            description:
                'Read exact retained dictionary-snippet cards from this conversation before a follow-up revision. Historical receipts/memory are not the card content. Page through the indicated nextIndex; never reconstruct missing fields from summaries. This does not insert cards.',
            inputSchema: z
                .object({
                    id: z.uuid(),
                    startIndex: z.number().int().min(0).max(99).default(0),
                    limit: z.number().int().min(1).max(10).default(10),
                })
                .strict(),
            outputSchema: z
                .object({
                    id: z.uuid(),
                    title: z.string(),
                    generationContext: DictionaryChatGenerationContextSchema,
                    cards: z.array(
                        z
                            .object({
                                index: z.number().int().nonnegative(),
                                values: DictionaryChatSnippetInputSchema.shape
                                    .cards.element,
                            })
                            .strict(),
                    ),
                    total: z.number().int().positive(),
                    nextIndex: z.number().int().nonnegative().nullable(),
                })
                .strict(),
            execute: (query, toolContext) =>
                execute(
                    'read_dictionary_snippet',
                    toolContext.agent?.toolCallId,
                    async () => {
                        if (
                            ++reads >
                            Math.ceil(dictionaryChatSnippetMaxCards / 10)
                        ) {
                            throw new Error(
                                'Read fewer snippet cards in one response; no content was reconstructed.',
                            );
                        }

                        const snippet = DictionaryChatSnippetSchema.parse(
                            await read(query.id),
                        );

                        if (query.startIndex >= snippet.cards.length) {
                            throw new Error(
                                'The requested snippet cards are unavailable.',
                            );
                        }

                        const cards: {
                            index: number;
                            values: (typeof snippet.cards)[number];
                        }[] = [];
                        const frame = {
                            id: snippet.id,
                            title: snippet.title,
                            generationContext: snippet.generationContext,
                            cards,
                            total: snippet.cards.length,
                            nextIndex: null as number | null,
                        };

                        for (
                            let index = query.startIndex;
                            index <
                            Math.min(
                                snippet.cards.length,
                                query.startIndex + query.limit,
                            );
                            index++
                        ) {
                            const row = {
                                index,
                                values: snippet.cards[index]!,
                            };

                            if (
                                Buffer.byteLength(
                                    JSON.stringify({
                                        ...frame,
                                        cards: [...cards, row],
                                    }),
                                    'utf8',
                                ) > retrievedSourceContextBytes
                            ) {
                                break;
                            }

                            cards.push(row);
                        }

                        if (!cards.length) {
                            throw new Error(
                                'The exact card exceeds this response context budget; request a smaller task. No content was truncated.',
                            );
                        }

                        const next = query.startIndex + cards.length;

                        return {
                            ...frame,
                            nextIndex:
                                next < snippet.cards.length ? next : null,
                        };
                    },
                ),
        }),
    };
}
