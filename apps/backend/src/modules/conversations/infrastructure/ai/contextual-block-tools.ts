import { randomUUID } from 'node:crypto';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
    LearningBlockProposalInputSchema,
    VideoLearningBlockSchema,
    VocabularyLearningBlockSchema,
    BilingualTextLearningBlockSchema,
    AudioLearningBlockSchema,
    GrammarLearningBlockSchema,
    ExerciseLearningBlockSchema,
} from '@languon/contracts';
import type { TutorRunInput } from '../../application/ports/tutor-runner';

// Describe the already-public structured variants to the provider. The canonical
// bounded parser remains mandatory in execute: its unknown.pipe preflight would
// otherwise serialize as an empty JSON schema in Mastra's input-schema mode.
const toolInputSchema = z
    .object({
        blocks: z
            .array(
                z.discriminatedUnion('type', [
                    VideoLearningBlockSchema,
                    VocabularyLearningBlockSchema,
                    BilingualTextLearningBlockSchema,
                    AudioLearningBlockSchema,
                    GrammarLearningBlockSchema,
                    ExerciseLearningBlockSchema,
                ]),
            )
            .min(1)
            .max(25),
    })
    .strict();

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
        description:
            'Propose typed learning blocks to append to the authorized owner working draft. The learner must preview and explicitly Apply; this never saves or publishes the note. Use original content and available transcripts; do not invent owned audio asset IDs.',
        inputSchema: toolInputSchema,
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
