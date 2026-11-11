import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { learningContentCapability } from '../../application/learning-content-registry';
import {
    createLearningContentOperations,
    LearningContentReceiptSchema,
} from './learning-content-operations';
import type { TutorRunInput } from '../../application/ports/tutor-runner';
import {
    LearningContentLimitationCodeSchema,
    type LearningContentTask,
    type LearningContentBrief,
} from '../../application/learning-content-contract';
import {
    createLearningContentAuthoring,
    type LearningContentAuthoringOptions,
} from './learning-content-authoring';

export { resolveLearningToolSources } from './learning-tool-sources';

const resultSchema = z.discriminatedUnion('status', [
    z
        .object({
            status: z.literal('ready'),
            receipt: LearningContentReceiptSchema,
        })
        .strict(),
    z
        .object({
            status: z.literal('needs-clarification'),
            code: LearningContentLimitationCodeSchema.optional(),
            missing: z.array(
                z
                    .object({ taskId: z.string(), fields: z.array(z.string()) })
                    .strict(),
            ),
        })
        .strict(),
    z
        .object({
            status: z.literal('unsupported'),
            code: LearningContentLimitationCodeSchema,
            reason: z.string(),
        })
        .strict(),
    z
        .object({
            status: z.literal('failed'),
            reason: z.enum(['invalid-brief', 'invalid-output']),
        })
        .strict(),
]);

/** Standalone tools use the same bounded authoring implementation as coordinated tutor batches. */
export function createLearningContentTools(
    options: LearningContentAuthoringOptions & {
        signal: AbortSignal;
        publish: NonNullable<TutorRunInput['onBlockProposal']>;
        onTool?: TutorRunInput['onTool'];
        resolveSources?: (
            brief: LearningContentBrief,
        ) => Promise<LearningContentBrief>;
    },
) {
    const authoring = createLearningContentAuthoring(options);
    const operations = createLearningContentOperations({
        authoring,
        signal: options.signal,
        publish: options.publish,
        ...(options.resolveSources
            ? { resolveSources: options.resolveSources }
            : {}),
        ...(options.onTool ? { onTool: options.onTool } : {}),
    });
    const tool = (kind: LearningContentTask['kind']) => {
        const capability = learningContentCapability(kind);

        return createTool({
            id: capability.toolId,
            description: `${capability.instruction} Accept a generation brief, not authored blocks. Missing material requirements return needs-clarification without a model call. The tool creates a reviewable proposal and returns a compact receipt. Apply and Save remain learner actions.`,
            inputSchema: capability.inputSchema,
            outputSchema: resultSchema,
            toModelOutput: (result) => JSON.stringify(result),
            execute: async (input) =>
                resultSchema.parse(
                    await operations.generateAndPropose({
                        tasks: [{ ...input, id: 'requested-content', kind }],
                    }),
                ),
        });
    };

    return {
        generate_vocabulary: tool('vocabulary'),
        generate_grammar: tool('grammar'),
        generate_bilingual_text: tool('bilingual-text'),
        generate_exercises: tool('exercises'),
    };
}
