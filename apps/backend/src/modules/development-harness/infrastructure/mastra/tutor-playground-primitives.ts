import { createTool } from '@mastra/core/tools';
import type { Config } from '@mastra/core/mastra';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import {
    KnowledgeBlockProposalSchema,
    ConversationResponseMetadataSchema,
    exerciseActivityCatalog,
    type ExerciseActivityId,
    type KnowledgeBlockProposal,
} from '@languon/contracts';
import {
    LearningContentToolResultSchema,
    namedExerciseToolDefinitions,
} from '../../../conversations/infrastructure/ai/learning-content-tools';
import type { LearningContentTask } from '../../../conversations/application/learning-content-contract';
import { learningContentRegistry } from '../../../conversations/application/learning-content-registry';
import {
    createTutorPlaygroundService,
    type TutorPlaygroundOptions,
} from './tutor-playground-service';
import {
    TutorPlaygroundContextSchema,
    TutorPlaygroundReadInputSchema,
    TutorPlaygroundTurnInputSchema,
} from './tutor-playground-contract';

export {
    TutorPlaygroundContextSchema,
    TutorPlaygroundReadInputSchema,
    TutorPlaygroundTurnInputSchema,
} from './tutor-playground-contract';

const diagnosticsSchema = z
    .object({
        mode: z.enum(['deterministic', 'live']),
        accounting: z.string().max(500),
        metadata: ConversationResponseMetadataSchema.nullable(),
        modelIO: z
            .array(
                z
                    .object({
                        input: z.string().max(24_000),
                        output: z.string().max(24_000),
                    })
                    .strict(),
            )
            .max(5),
        calls: z
            .array(
                z
                    .object({
                        callId: z.uuid(),
                        status: z.enum(['admitted', 'settled', 'failed']),
                        purpose: z
                            .enum([
                                'answer',
                                'planning',
                                'authoring',
                                'observation',
                                'reflection',
                            ])
                            .optional(),
                        inputTokenEstimate: z
                            .number()
                            .int()
                            .nonnegative()
                            .optional(),
                        maxOutputTokens: z
                            .number()
                            .int()
                            .nonnegative()
                            .optional(),
                        outputLimitReached: z.boolean().optional(),
                        providerCompleted: z.boolean().optional(),
                        usage: z
                            .object({
                                inputTokens: z.number().nonnegative(),
                                outputTokens: z.number().nonnegative(),
                            })
                            .strict()
                            .optional(),
                        reason: z
                            .enum([
                                'provider-error',
                                'missing-usage',
                                'aborted',
                            ])
                            .optional(),
                    })
                    .strict(),
            )
            .max(10),
    })
    .strict();

type TutorPlaygroundOutput = {
    sessionId: string;
    turnId: string;
    status: 'succeeded' | 'failed' | 'cancelled';
    failureCode: string | null;
    response: string;
    proposals: KnowledgeBlockProposal[];
    diagnostics: z.infer<typeof diagnosticsSchema>;
    result?: z.infer<typeof LearningContentToolResultSchema> | null | undefined;
};

// Preserve strict runtime validation without exporting its full nested Zod graph.
export const TutorPlaygroundOutputSchema: z.ZodType<TutorPlaygroundOutput> = z
    .object({
        sessionId: z.uuid(),
        turnId: z.uuid(),
        status: z.enum(['succeeded', 'failed', 'cancelled']),
        failureCode: z.string().max(100).nullable(),
        response: z.string(),
        proposals: z.array(KnowledgeBlockProposalSchema).max(100),
        diagnostics: diagnosticsSchema,
        result: LearningContentToolResultSchema.nullable().optional(),
    })
    .strict();

/** Development variant of the canonical generation tool contract. */
export function playgroundContentToolDefinition(
    kind: LearningContentTask['kind'],
) {
    const capability = learningContentRegistry.find(
        (item) => item.kind === kind,
    )!;

    return {
        id: capability.toolId,
        description: `${capability.instruction} Runs in an isolated synthetic session. Inspect returned sessionId and proposal content.`,
        inputSchema: capability.inputSchema,
        outputSchema: TutorPlaygroundOutputSchema,
        requestContextSchema: TutorPlaygroundContextSchema,
    };
}

/** Named Studio metadata uses the same fixed canonical schema as actual execution. */
export function playgroundNamedExerciseToolDefinition(
    activityId: ExerciseActivityId,
) {
    const canonical = namedExerciseToolDefinitions.find(
        (definition) =>
            definition.id === `generate_exercise_${activityId.toLowerCase()}`,
    )!;

    return {
        ...canonical,
        description: `${canonical.description} Runs in an isolated synthetic session with the existing Studio guards.`,
        outputSchema: TutorPlaygroundOutputSchema,
        requestContextSchema: TutorPlaygroundContextSchema,
    };
}

/** Studio adapters select synthetic authority; production factories own all generation and publication. */
const readProposalOutputSchema: z.ZodType<{
    sessionId: string;
    proposal: KnowledgeBlockProposal;
}> = z
    .object({
        sessionId: z.uuid(),
        proposal: KnowledgeBlockProposalSchema,
    })
    .strict();

export const ReadPlaygroundProposalDefinition = {
    id: 'read-playground-proposal',
    description:
        'Read the exact validated proposal from its own synthetic session.',
    inputSchema: TutorPlaygroundReadInputSchema,
    outputSchema: readProposalOutputSchema,
};

type RegisteredTool = NonNullable<Config['tools']>[string];
type PlaygroundTool = {
    [Key in keyof RegisteredTool]: RegisteredTool[Key] | undefined;
} & { id: string; description: string };

/** Stop SDK/schema implementation types at the Studio composition boundary. */
export interface TutorPlaygroundPrimitives {
    tools: Record<
        | 'generate_vocabulary'
        | 'generate_grammar'
        | 'generate_bilingual_text'
        | 'generate_exercises'
        | 'read-playground-proposal',
        PlaygroundTool
    > &
        Record<string, PlaygroundTool>;
    workflows: {
        runTutorTurn: NonNullable<Config['workflows']>[string];
    };
    toolInputs: Readonly<Record<string, z.ZodType>>;
    requestContextSchema: z.ZodType;
    workflowInputSchema: z.ZodType;
}

export function createTutorPlaygroundPrimitives(
    options: TutorPlaygroundOptions,
): TutorPlaygroundPrimitives {
    const service = createTutorPlaygroundService(options);
    const namedDefinitions = exerciseActivityCatalog.map((activity) => ({
        activityId: activity.id,
        definition: playgroundNamedExerciseToolDefinition(activity.id),
    }));
    const activityTool = (kind: LearningContentTask['kind']) => {
        const capability = learningContentRegistry.find(
            (item) => item.kind === kind,
        )!;

        return createTool({
            ...playgroundContentToolDefinition(kind),
            execute: async (data, context) =>
                TutorPlaygroundOutputSchema.parse(
                    await service.runTool(
                        capability.toolId,
                        data,
                        TutorPlaygroundContextSchema.parse({
                            scenarioId:
                                context.requestContext?.get('scenarioId'),
                            sessionId: context.requestContext?.get('sessionId'),
                        }),
                        context.abortSignal ?? new AbortController().signal,
                    ),
                ),
        });
    };
    const tools = {
        generate_vocabulary: activityTool('vocabulary'),
        generate_grammar: activityTool('grammar'),
        generate_bilingual_text: activityTool('bilingual-text'),
        generate_exercises: activityTool('exercises'),
        ...Object.fromEntries(
            namedDefinitions.map(({ activityId, definition }) => [
                definition.id,
                createTool({
                    ...playgroundNamedExerciseToolDefinition(activityId),
                    execute: async (data, context) =>
                        TutorPlaygroundOutputSchema.parse(
                            await service.runTool(
                                definition.id,
                                data,
                                TutorPlaygroundContextSchema.parse({
                                    scenarioId:
                                        context.requestContext?.get(
                                            'scenarioId',
                                        ),
                                    sessionId:
                                        context.requestContext?.get(
                                            'sessionId',
                                        ),
                                }),
                                context.abortSignal ??
                                    new AbortController().signal,
                            ),
                        ),
                }),
            ]),
        ),
    };
    const readTool = createTool({
        ...ReadPlaygroundProposalDefinition,

        execute: async (input) => service.readProposal(input),
    });
    const step = createStep({
        id: 'run-tutor-turn',
        inputSchema: TutorPlaygroundTurnInputSchema,
        outputSchema: TutorPlaygroundOutputSchema,
        execute: async ({ inputData, abortSignal }) =>
            TutorPlaygroundOutputSchema.parse(
                await service.runTurn(
                    inputData,
                    abortSignal ?? new AbortController().signal,
                ),
            ),
    });
    const workflow = createWorkflow({
        id: 'run-tutor-turn',
        inputSchema: TutorPlaygroundTurnInputSchema,
        outputSchema: TutorPlaygroundOutputSchema,
    })
        .then(step)
        .commit();

    return {
        tools: { ...tools, 'read-playground-proposal': readTool },
        workflows: { runTutorTurn: workflow },
        toolInputs: Object.fromEntries([
            ...learningContentRegistry.map(
                (capability) =>
                    [capability.toolId, capability.inputSchema] as const,
            ),
            ...namedDefinitions.map(
                ({ definition }) =>
                    [definition.id, definition.inputSchema] as const,
            ),
            ['read-playground-proposal', TutorPlaygroundReadInputSchema],
        ]),
        requestContextSchema: TutorPlaygroundContextSchema,
        workflowInputSchema: TutorPlaygroundTurnInputSchema,
    };
}
