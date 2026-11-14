import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
    exerciseActivityCatalog,
    getExerciseActivity,
    type ExerciseActivityId,
} from '@languon/contracts';
import { learningContentCapability } from '../../application/learning-content-registry';
import {
    createLearningContentOperations,
    LearningContentReceiptSchema,
} from './learning-content-operations';
import type { TutorRunInput } from '../../application/ports/tutor-runner';
import {
    LearningContentLimitationCodeSchema,
    LearningContentTaskSchema,
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

export const LearningContentToolResultSchema = resultSchema;

/** Shared by executable tools and the read-only catalog; contains no operation authority. */
export function learningContentToolDefinition(
    kind: LearningContentTask['kind'],
) {
    const capability = learningContentCapability(kind);

    return {
        id: capability.toolId,
        description: `${capability.instruction} Accept a generation brief, not authored blocks. Missing material requirements return needs-clarification without a model call. The tool creates a reviewable proposal and returns a compact receipt. Apply and Save remain learner actions.`,
        inputSchema: capability.inputSchema,
        outputSchema: resultSchema,
    };
}

export type LearningContentToolOptions = LearningContentAuthoringOptions & {
    signal: AbortSignal;
    publish: NonNullable<TutorRunInput['onBlockProposal']>;
    onTool?: TutorRunInput['onTool'];
    resolveSources?: (
        brief: LearningContentBrief,
    ) => Promise<LearningContentBrief>;
};

function operationsFor(options: LearningContentToolOptions) {
    return createLearningContentOperations({
        authoring: createLearningContentAuthoring(options),
        signal: options.signal,
        publish: options.publish,
        ...(options.resolveSources
            ? { resolveSources: options.resolveSources }
            : {}),
        ...(options.onTool ? { onTool: options.onTool } : {}),
    });
}

function exerciseSource(
    task: LearningContentTask,
    options: LearningContentToolOptions,
): LearningContentTask {
    // A direct Studio call defaults only to its own server-authorized editor.
    // Injected standalone tests may instead supply an explicit authorized context.
    return task.source || !options.resolveSources
        ? task
        : { ...task, source: { kind: 'editor' } };
}

/** Actor tools remain compact; dedicated activity tools are registered separately. */
export function createLearningContentTools(
    options: LearningContentToolOptions,
) {
    const operations = operationsFor(options);
    const tool = (kind: LearningContentTask['kind']) => {
        const definition = learningContentToolDefinition(kind);

        return createTool({
            ...learningContentToolDefinition(kind),
            toModelOutput: (result) => JSON.stringify(result),
            execute: async (input) => {
                const task: LearningContentTask = {
                    ...definition.inputSchema.parse(input),
                    id: 'requested-content',
                    kind,
                };

                return resultSchema.parse(
                    await operations.generateAndPropose({
                        tasks: [
                            kind === 'exercises'
                                ? exerciseSource(task, options)
                                : task,
                        ],
                    }),
                );
            },
        });
    };

    return {
        generate_vocabulary: tool('vocabulary'),
        generate_grammar: tool('grammar'),
        generate_bilingual_text: tool('bilingual-text'),
        generate_exercises: tool('exercises'),
    };
}

export type NamedExerciseToolId =
    `generate_exercise_${Lowercase<ExerciseActivityId>}`;

type NamedExerciseToolInput = Pick<
    LearningContentTask,
    | 'instruction'
    | 'source'
    | 'language'
    | 'explanationLanguage'
    | 'difficulty'
    | 'words'
> & { count: number };

interface NamedExerciseToolDefinition {
    id: NamedExerciseToolId;
    description: string;
    inputSchema: z.ZodType<NamedExerciseToolInput>;
    outputSchema: z.ZodType<z.infer<typeof resultSchema>>;
}

export function namedExerciseToolDefinition(
    activityId: ExerciseActivityId,
): NamedExerciseToolDefinition {
    const activity = getExerciseActivity(activityId);
    const input = LearningContentTaskSchema.pick({
        instruction: true,
        source: true,
        language: true,
        explanationLanguage: true,
        count: true,
        difficulty: true,
        words: true,
    })
        .extend({
            instruction: z
                .string()
                .trim()
                .min(1)
                .max(4_000)
                .default(
                    `Create ${activity.locales.en.name} exercises from the selected source.`,
                ),
            count: z.number().int().min(1).max(25).default(5),
        })
        .strict();

    return {
        id: `generate_exercise_${activityId.toLowerCase()}` as NamedExerciseToolId,
        description: `Create ${activity.locales.en.name} exercises (${activityId}). Requires authorized ${activity.supportedSourceKinds.join('/')} material. Returns one reviewable proposal; Insert and Save stay explicit.`,
        inputSchema:
            activity.category === 'vocabulary'
                ? input
                : input.omit({ words: true }),
        outputSchema: resultSchema,
    };
}

export const namedExerciseToolDefinitions = Object.freeze(
    exerciseActivityCatalog.map((activity) =>
        namedExerciseToolDefinition(activity.id),
    ),
);

const activitiesByToolId = new Map<string, ExerciseActivityId>(
    exerciseActivityCatalog.map((activity) => [
        `generate_exercise_${activity.id.toLowerCase()}`,
        activity.id,
    ]),
);

export function namedExerciseActivityForToolId(
    id: string,
): ExerciseActivityId | undefined {
    return activitiesByToolId.get(id);
}

/** Each Studio invocation still uses the canonical bounded operation facade once. */
export function createNamedExerciseTools(options: LearningContentToolOptions) {
    const operations = operationsFor(options);
    const tool = (activityId: ExerciseActivityId) => {
        const definition = namedExerciseToolDefinition(activityId);

        return createTool({
            ...namedExerciseToolDefinition(activityId),
            toModelOutput: (result) => JSON.stringify(result),
            execute: async (input) => {
                const parsed = definition.inputSchema.parse(input);
                const task = exerciseSource(
                    {
                        ...parsed,
                        id: 'requested-content',
                        kind: 'exercises',
                        activities: [{ activityId, count: parsed.count }],
                    },
                    options,
                );

                return resultSchema.parse(
                    await operations.generateAndPropose({ tasks: [task] }),
                );
            },
        });
    };

    return Object.fromEntries(
        exerciseActivityCatalog.map((activity) => [
            namedExerciseToolDefinition(activity.id).id,
            tool(activity.id),
        ]),
    ) as Record<NamedExerciseToolId, ReturnType<typeof tool>>;
}
