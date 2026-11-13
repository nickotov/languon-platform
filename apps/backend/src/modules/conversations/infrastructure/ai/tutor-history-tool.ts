import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { TutorMemoryPort } from '../../application/ports/tutor-runner';

export const TutorHistoryInputSchema = z
    .object({
        limit: z.number().int().min(1).max(20).default(5),
    })
    .strict();

/** Reads only the server-bound conversation. No caller-selected owner or thread. */
export const RecallDefinition = {
    id: 'recall',
    description:
        'Read original visible wording from this authorized conversation. Does not read other chats or reconstruct generated artifacts; use exact proposal/source references for those.',
    inputSchema: TutorHistoryInputSchema,
    outputSchema: z
        .object({
            messages: z.array(
                z.object({
                    id: z.string(),
                    role: z.enum(['user', 'assistant']),
                    content: z.string(),
                    createdAt: z.string(),
                }),
            ),
            total: z.number().int().nonnegative(),
            coverage: z.enum(['complete', 'partial']),
        })
        .strict(),
};

export function createTutorHistoryTool(
    memory: TutorMemoryPort,
    signal: AbortSignal,
) {
    return createTool({
        ...RecallDefinition,

        execute: async ({ limit }) => {
            signal.throwIfAborted();
            const page = await memory.listMessages({
                offset: 0,
                limit,
                order: 'desc',
            });

            signal.throwIfAborted();
            const messages: {
                id: string;
                role: 'user' | 'assistant';
                content: string;
                createdAt: string;
            }[] = [];

            for (const item of page.messages) {
                const candidate = {
                    id: item.id,
                    role: item.role,
                    content: item.content,
                    createdAt: item.createdAt,
                };

                if (
                    Buffer.byteLength(
                        JSON.stringify([...messages, candidate]),
                        'utf8',
                    ) > 23000
                ) {
                    continue;
                }

                messages.push(candidate);
            }

            return {
                messages: messages.reverse(),
                total: page.total,
                coverage:
                    messages.length === page.total
                        ? ('complete' as const)
                        : ('partial' as const),
            };
        },
    });
}
