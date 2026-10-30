import { randomUUID } from 'node:crypto';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
    learningBlockToolDescription,
    learningBlockToolInputSchema,
} from '../../application/learning-block-tool-contract';
import { LearningBlockProposalInputSchema } from '@languon/contracts';
import type { TutorRunInput } from '../../application/ports/tutor-runner';

export function createLearningBlockProposalTool(
    input: Pick<
        TutorRunInput,
        | 'onBlockProposal'
        | 'canProposeBlocks'
        | 'readOnlySource'
        | 'signal'
        | 'onTool'
    >,
) {
    const proposed = new Map<
        string,
        { content: string; result: Promise<{ id: string }> }
    >();
    return createTool({
        id: 'propose_learning_blocks',
        description: learningBlockToolDescription,
        inputSchema: learningBlockToolInputSchema,
        outputSchema: z.object({
            id: z.uuid(),
            requiresLearnerApply: z.literal(true),
        }),
        execute: async (candidate, context) => {
            const callId = context.agent?.toolCallId ?? randomUUID();
            await input.onTool?.({
                id: callId,
                name: 'propose_learning_blocks',
                state: 'running',
            });
            try {
                input.signal.throwIfAborted();
                if (
                    input.readOnlySource ||
                    !input.canProposeBlocks ||
                    !input.onBlockProposal
                )
                    throw new Error(
                        'This source does not authorize block proposals.',
                    );
                const parsed =
                    LearningBlockProposalInputSchema.parse(candidate);
                const key = parsed.targetBlockId ?? 'append';
                const content = JSON.stringify(parsed);
                const previous = proposed.get(key);
                if (previous && previous.content === content) {
                    const result = await previous.result;
                    input.signal.throwIfAborted();
                    await input.onTool?.({
                        id: callId,
                        name: 'propose_learning_blocks',
                        state: 'succeeded',
                    });
                    return {
                        id: result.id,
                        requiresLearnerApply: true as const,
                    };
                }
                if (previous || proposed.size >= 8)
                    throw new Error(
                        'At most eight distinct block proposals may be generated per turn, with one proposal per target.',
                    );
                const creation = input
                    .onBlockProposal(parsed)
                    .catch((error: unknown) => {
                        proposed.delete(key);
                        throw error;
                    });
                proposed.set(key, { content, result: creation });
                const result = await creation;
                input.signal.throwIfAborted();
                await input.onTool?.({
                    id: callId,
                    name: 'propose_learning_blocks',
                    state: 'succeeded',
                });
                return { id: result.id, requiresLearnerApply: true as const };
            } catch (error) {
                await input.onTool?.({
                    id: callId,
                    name: 'propose_learning_blocks',
                    state: 'failed',
                });
                throw error;
            }
        },
    });
}
