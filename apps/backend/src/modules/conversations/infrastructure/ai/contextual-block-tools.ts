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
    let proposed = false;
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
                if (proposed)
                    throw new Error(
                        'A block proposal was already generated in this turn.',
                    );
                const result = await input.onBlockProposal(
                    LearningBlockProposalInputSchema.parse(candidate),
                );
                input.signal.throwIfAborted();
                proposed = true;
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
