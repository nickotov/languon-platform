import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
    LearningContentTaskSchema,
    LearningContentLimitationCodeSchema,
    learningContentCapabilities,
    type LearningContentTask,
} from '../../application/learning-content-contract';
import {
    createLearningContentAuthoring,
    learningContentOutputSchema,
    type LearningContentAuthoringOptions,
} from './learning-content-authoring';

const toolInputSchema = LearningContentTaskSchema.omit({
    id: true,
    kind: true,
});
const resultSchema = z.discriminatedUnion('status', [
    z
        .object({
            status: z.literal('ready'),
            proposal: z
                .object({
                    blocks: learningContentOutputSchema.shape.tasks.element
                        .shape.blocks,
                })
                .strict(),
            summary: z.string(),
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
    options: LearningContentAuthoringOptions & { signal: AbortSignal },
) {
    const authoring = createLearningContentAuthoring(options);
    const tool = (kind: LearningContentTask['kind']) => {
        const capability = learningContentCapabilities.find(
            (item) => item.kind === kind,
        )!;

        return createTool({
            id: capability.toolId,
            description: `${capability.instruction} Accept a generation brief, not authored blocks. Missing material requirements return needs-clarification without a model call. This tool returns content only; it does not change or publish a document.`,
            inputSchema: toolInputSchema,
            outputSchema: resultSchema,
            execute: async (input) =>
                resultSchema.parse(
                    await authoring.generate(
                        {
                            tasks: [
                                { ...input, id: 'requested-content', kind },
                            ],
                        },
                        options.signal,
                    ),
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
