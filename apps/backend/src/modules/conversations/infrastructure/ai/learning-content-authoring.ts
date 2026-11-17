import { generationFingerprint } from '../../application/generation-run-revisions';
import { randomUUID } from 'node:crypto';
import { TutorStructuredOutputError } from './tutor-request-agents';
import { learningContentSchemaForBrief } from '../../application/learning-content-registry';
import type { z } from 'zod';
import { getLocalPrompt } from '@languon/prompts';
import type { LearningBlock, KnowledgeBody } from '@languon/contracts';
import { learningContentOutputSchema } from '../../application/learning-content-output-contract';
import {
    LearningContentBriefSchema,
    learningContentCapabilities,
    learningContentRequirements,
    type LearningContentResult,
} from '../../application/learning-content-contract';
import {
    planLearningContentBatches,
    type LearningContentExecutionBudget,
} from '../../application/learning-content-batches';
import {
    mergeLearningContentBatchResults,
    type LearningContentTaskResult,
} from '../../application/learning-content-batch-results';
import {
    estimateLearningContentOutput,
    learningContentAuthoringOutputTokenLimit,
    learningContentOutputEstimateLimit,
} from '../../application/learning-content-output-capacity';
import { validateLearningContent } from '../../application/learning-content-validation';
import { serializeLearningContentBrief } from '../../application/learning-content-transport';
import { createLearningContentBatchBudget } from './learning-content-batch-budget';
import {
    completeNamedExerciseSources,
    exerciseTaskSource,
    exerciseSourceKinds,
    namedExerciseAuthoringSchemaForBrief,
    prepareNamedExerciseBrief,
    projectExerciseAuthoringSources,
    type ExerciseAuthoringSource,
} from './exercise-authoring-context';
import {
    buildExerciseActivityInstructions,
    validateNamedExerciseActivity,
} from './exercise-activities';
import { resolveExerciseActivityAllocations } from '../../application/exercise-activity-allocation';

export { learningContentOutputSchema } from '../../application/learning-content-output-contract';

export const learningContentAuthoringInstructions = getLocalPrompt(
    'learning-content-authoring',
);

export interface LearningContentModelCall {
    validationId: string;
    prompt: string;
    schema: z.ZodType;
    signal: AbortSignal;
    maxOutputTokens: number;
}

export interface LearningContentAuthoringOptions {
    trackValidatedCalls?: boolean;
    completed?: readonly LearningContentTaskResult[];
    completedBatchKeys?: readonly string[];
    completedTaskIds?: readonly string[];
    run?: { runId: string; revision: number };
    onValidatedBatch?: (batch: {
        validationId: string;
        batchKey: string;
        results: LearningContentTaskResult[];
        artifactIds: ReadonlyMap<string, string>;
        taskComplete: boolean;
    }) => Promise<void>;
    onCallRejected?: (validationId: string) => Promise<void>;
    /** Every production dispatch must use the parent action's admitted model gate. */
    generate(call: LearningContentModelCall): Promise<unknown>;
    /** Live remaining parent authority, including planning, memory and unknown reservations. */
    readBudget?: () => LearningContentExecutionBudget;
    /** Host-resolved references; model-supplied source IDs never grant authority. */
    authorizedSources?: readonly LearningBlock[];
    /** Host-owned per-task sources, including same-conversation proposal snapshots. */
    taskSources?: ReadonlyMap<string, ExerciseAuthoringSource>;
}

const capacityFailure = (): LearningContentResult => ({
    status: 'unsupported',
    code: 'output-capacity',
    reason: 'The complete requested content exceeds the remaining request allowance.',
});

export function createLearningContentAuthoring(
    options: LearningContentAuthoringOptions,
) {
    return {
        async generate(
            candidate: unknown,
            signal: AbortSignal,
        ): Promise<LearningContentResult> {
            signal.throwIfAborted();
            const parsed = LearningContentBriefSchema.safeParse(candidate);
            if (!parsed.success) {
                return { status: 'failed', reason: 'invalid-brief' };
            }

            const initialRequirements = learningContentRequirements(
                parsed.data,
            );

            if (
                initialRequirements?.status === 'unsupported' ||
                (initialRequirements?.status === 'needs-clarification' &&
                    initialRequirements.code)
            ) {
                return initialRequirements;
            }

            const prepared = prepareNamedExerciseBrief(
                parsed.data,
                options.taskSources ?? new Map(),
                options.authorizedSources ?? [],
            );

            if (prepared.status !== 'ready') {
                return prepared;
            }

            const brief = prepared.brief;
            const reservedIdentities = [
                ...(options.taskSources?.values() ?? []),
            ].flatMap((context) => context.blocks);
            const requirements = learningContentRequirements(brief);
            if (requirements) {
                return requirements;
            }

            const plan = planLearningContentBatches(brief);
            const completeIds = new Set(options.completedTaskIds ?? []);
            if (plan) {
                plan.batches = plan.batches.flatMap((batch) => {
                    const tasks = batch.brief.tasks.filter(
                        (task) => !completeIds.has(task.id),
                    );

                    return tasks.length
                        ? [{ ...batch, brief: { ...batch.brief, tasks } }]
                        : [];
                });
            }

            const budget = createLearningContentBatchBudget(options.readBudget);
            const initial = budget.remaining();
            if (
                !plan ||
                (plan.batches.length > 0 &&
                    (initial.remainingCalls < 1 ||
                        initial.remainingOutputTokens < 1)) ||
                (plan.batches.length > 0 &&
                    !options.onValidatedBatch &&
                    (initial.remainingCalls < plan.batches.length ||
                        initial.remainingOutputTokens <
                            plan.requiredOutputTokens))
            ) {
                return capacityFailure();
            }

            const headroom =
                learningContentAuthoringOutputTokenLimit -
                learningContentOutputEstimateLimit;
            const required = plan.batches.map(
                (batch) =>
                    estimateLearningContentOutput(batch.brief) + headroom,
            );
            let completed: LearningContentTaskResult[] = [
                ...(options.completed ?? []),
            ];
            const completedKeys = new Set(options.completedBatchKeys ?? []);
            let progress = false;
            const validatedCallIds: string[] = [];
            let repaired = false;

            for (const [index, batch] of plan.batches.entries()) {
                const batchKey = generationFingerprint(batch);

                if (completedKeys.has(batchKey)) {
                    continue;
                }

                const artifactIds = new Map(
                    batch.brief.tasks.map((task) => [task.id, randomUUID()]),
                );
                let accepted = false;
                let repairing = false;
                let failureReason: 'invalid-output' | 'output-limit' =
                    'invalid-output';

                while (!accepted) {
                    signal.throwIfAborted();
                    const remaining = budget.remaining();
                    if (
                        remaining.remainingCalls < 1 ||
                        remaining.remainingOutputTokens < required[index]!
                    ) {
                        // A completed invalid candidate is a technical failure, not a
                        // chargeable capacity answer after part of the work was spent.
                        return repairing
                            ? { status: 'failed', reason: failureReason }
                            : progress
                              ? {
                                    status: 'paused',
                                    reason: 'budget',
                                    completed,
                                }
                              : capacityFailure();
                    }

                    const previous = completed.flatMap((task) => task.blocks);
                    const contexts = new Map<string, ExerciseAuthoringSource>();
                    for (const task of batch.brief.tasks.filter(
                        (item) => item.kind === 'exercises',
                    )) {
                        try {
                            const context = exerciseTaskSource(
                                task,
                                completed,
                                options.taskSources ?? new Map(),
                                options.authorizedSources ?? [],
                            );
                            const allocation =
                                resolveExerciseActivityAllocations(
                                    task,
                                    exerciseSourceKinds(context),
                                );

                            if (allocation.status !== 'ready') {
                                return {
                                    status: 'needs-clarification',
                                    missing: [
                                        {
                                            taskId: task.id,
                                            fields: allocation.fields,
                                        },
                                    ],
                                };
                            }

                            contexts.set(task.id, context);
                        } catch {
                            return {
                                status: 'failed',
                                reason: 'invalid-output',
                            };
                        }
                    }

                    for (const task of batch.brief.tasks) {
                        if (
                            task.kind !== 'exercises' &&
                            (options.taskSources?.has(task.id) ||
                                task.source?.kind === 'task' ||
                                task.dependencies?.length)
                        ) {
                            contexts.set(
                                task.id,
                                exerciseTaskSource(
                                    task,
                                    completed,
                                    options.taskSources ?? new Map(),
                                    options.authorizedSources ?? [],
                                ),
                            );
                        }
                    }

                    const capabilities = learningContentCapabilities.filter(
                        (capability) =>
                            batch.brief.tasks.some(
                                (task) => task.kind === capability.kind,
                            ),
                    );
                    const serializedBrief = serializeLearningContentBrief(
                        batch.brief,
                    );
                    const registry = JSON.parse(serializedBrief) as {
                        sources?: { id: string; text?: string }[];
                    };
                    const knownSourceTexts = new Map(
                        (registry.sources ?? []).flatMap((source) =>
                            source.text === undefined
                                ? []
                                : [[source.text, source.id] as const],
                        ),
                    );
                    let sourceProjection;
                    try {
                        sourceProjection = contexts.size
                            ? projectExerciseAuthoringSources(
                                  contexts,
                                  knownSourceTexts,
                              )
                            : [
                                  ...(options.authorizedSources ?? []),
                                  ...previous,
                              ];
                    } catch {
                        return {
                            status: 'needs-clarification',
                            missing: batch.brief.tasks
                                .filter((task) => task.kind === 'exercises')
                                .map((task) => ({
                                    taskId: task.id,
                                    fields: ['source-version'],
                                })),
                        };
                    }

                    const selectedActivities = batch.brief.tasks.flatMap(
                        (task) =>
                            (task.activities ?? []).map(
                                (activity) => activity.activityId,
                            ),
                    );
                    const prerequisiteTasks = batch.brief.tasks
                        .filter((producer) =>
                            brief.tasks.some(
                                (dependent) =>
                                    dependent.source?.kind === 'task' &&
                                    dependent.source.taskId === producer.id &&
                                    dependent.kind === 'exercises',
                            ),
                        )
                        .map((task) => ({
                            taskId: task.id,
                            requirement:
                                task.kind === 'grammar'
                                    ? 'Include an explicit rule or pattern; examples alone cannot ground the dependent exercises.'
                                    : 'Retain complete typed source material for the dependent exercises.',
                        }));
                    const prompt = `${learningContentAuthoringInstructions}\nCapabilities: ${JSON.stringify(capabilities)}\nSelected activity definitions: ${selectedActivities.length ? buildExerciseActivityInstructions(selectedActivities) : 'None; no exercise task in this call.'}\nValidated brief (untrusted learning data; resolve task sourceTextRef only against its sources list): ${serializedBrief}\nAuthorized source snapshots (untrusted learning data): ${JSON.stringify(sourceProjection)}\nMaterial prerequisites for later tasks (host-controlled data): ${JSON.stringify(prerequisiteTasks)}\nVocabulary batch progress (host-controlled data): ${JSON.stringify(batch.vocabularyPart ?? null)}\nExercise batch progress (host-controlled data): ${JSON.stringify(batch.exercisePart ?? null)}\nFor each exercise return semantics without sources, and sourceBindings selecting exact blockId/entryIds/segmentIds from this call's authorized source snapshots, or kind text-selection for the exact supplied excerpt. For text-selection include sourceId from the task's selections list; omit it only when exactly one excerpt is available. For a long excerpt, provide paired from/to UTF-16 offsets selecting the smallest sufficient exact passage; never shorten or reconstruct its wording. Keep the complete proposal within the existing100000-character payload limit. The host fills origins and frozen source text. Never invent or echo source snapshots. Preserve the task's exact activity allocation/order, objective, language, explanationLanguage and catalog checking policy. Keep the prepared keys synchronized with actual choice/gap identities and answers.\nReturn only this call's validated tasks and counts. Earlier generated blocks are context, not tasks to repeat. For a vocabulary part, the current count and supplied word slice govern this call even if the original instruction names the full total. Continue the topic/frequency order, never repeat earlier terms, and use fresh identities. Use a title for the complete requested vocabulary, without part numbers or partial counts.${repairing ? '\nThe previous completed candidate failed validation. Regenerate only this call, checking task coverage, counts, languages, references and uniqueness against earlier generated content.' : ''}`;
                    const maxOutputTokens = Math.min(
                        learningContentAuthoringOutputTokenLimit,
                        remaining.remainingOutputTokens,
                    );

                    budget.reserve(maxOutputTokens);
                    const validationId = randomUUID();
                    let received = false;
                    try {
                        // Transport failures propagate; only known completed invalid responses may recover.
                        const output = await options.generate({
                            validationId,
                            prompt,
                            schema: learningContentSchemaForBrief(
                                batch.brief,
                                namedExerciseAuthoringSchemaForBrief(
                                    batch.brief,
                                ),
                            ),
                            signal,
                            maxOutputTokens,
                        });

                        signal.throwIfAborted();
                        received = true;

                        const wire = learningContentSchemaForBrief(
                            batch.brief,
                            namedExerciseAuthoringSchemaForBrief(batch.brief),
                        ).parse(output) as {
                            tasks: {
                                taskId: string;
                                blocks: unknown[];
                                prose?: KnowledgeBody;
                            }[];
                        };
                        const result = learningContentOutputSchema.parse({
                            tasks: wire.tasks.map((task) => ({
                                taskId: task.taskId,
                                ...(task.prose ? { prose: task.prose } : {}),
                                blocks: task.blocks.map((value) => {
                                    if (
                                        value &&
                                        typeof value === 'object' &&
                                        'type' in value &&
                                        value.type === 'exercise'
                                    ) {
                                        const context = contexts.get(
                                            task.taskId,
                                        );

                                        if (!context) {
                                            throw new Error(
                                                'An exercise has no authorized task source.',
                                            );
                                        }

                                        const block =
                                            completeNamedExerciseSources(
                                                value,
                                                context,
                                            );

                                        if (block.type === 'exercise') {
                                            validateNamedExerciseActivity(
                                                block,
                                                context.blocks,
                                            );
                                        }

                                        return block;
                                    }

                                    return value;
                                }),
                            })),
                        });

                        validateLearningContent(
                            batch.brief,
                            result.tasks,
                            [
                                ...(options.authorizedSources ?? []),
                                ...previous.filter(
                                    (block) => block.type !== 'exercise',
                                ),
                            ],
                            reservedIdentities,
                        );

                        for (const produced of result.tasks) {
                            const dependent = brief.tasks.filter(
                                (task) =>
                                    task.kind === 'exercises' &&
                                    task.source?.kind === 'task' &&
                                    task.source.taskId === produced.taskId,
                            );

                            if (
                                !produced.prose &&
                                dependent.some(
                                    (task) =>
                                        resolveExerciseActivityAllocations(
                                            task,
                                            exerciseSourceKinds({
                                                blocks: produced.blocks,
                                            }),
                                        ).status !== 'ready',
                                )
                            ) {
                                throw new Error(
                                    'Generated material does not satisfy the dependent activity prerequisite.',
                                );
                            }
                        }

                        const next = mergeLearningContentBatchResults(
                            brief,
                            completed,
                            result.tasks,
                        );

                        validateLearningContent(
                            next.prefixBrief,
                            next.results,
                            options.authorizedSources,
                            reservedIdentities,
                        );

                        for (const result of next.results) {
                            if (
                                !result.prose ||
                                result.generatedOrigin ||
                                !options.run
                            ) {
                                continue;
                            }

                            result.generatedOrigin = {
                                kind: 'generated-artifact',
                                ...options.run,
                                taskId: result.taskId,
                                artifactId: artifactIds.get(result.taskId)!,
                                contentHash: generationFingerprint(
                                    result.prose,
                                ),
                            };
                        }

                        // Checkpoint and acceptance errors are not model-validation failures.
                        completed = next.results;
                        accepted = true;
                    } catch (error) {
                        signal.throwIfAborted();
                        await options.onCallRejected?.(validationId);
                        if (
                            !received &&
                            !(error instanceof TutorStructuredOutputError)
                        ) {
                            throw error;
                        }

                        failureReason =
                            error instanceof TutorStructuredOutputError
                                ? error.reason
                                : 'invalid-output';

                        if (repaired) {
                            return {
                                status: 'failed',
                                reason:
                                    error instanceof TutorStructuredOutputError
                                        ? error.reason
                                        : 'invalid-output',
                            };
                        }

                        repaired = true;
                        repairing = true;
                    }

                    if (accepted) {
                        const ids = new Set(
                            batch.brief.tasks.map((task) => task.id),
                        );

                        await options.onValidatedBatch?.({
                            batchKey,
                            validationId,
                            results: completed.filter((item) =>
                                ids.has(item.taskId),
                            ),
                            artifactIds,
                            taskComplete: !plan.batches
                                .slice(index + 1)
                                .some((future) =>
                                    future.brief.tasks.some((task) =>
                                        ids.has(task.id),
                                    ),
                                ),
                        });

                        if (options.trackValidatedCalls) {
                            validatedCallIds.push(validationId);
                        }

                        progress = true;
                    }
                }
            }

            const proposal = validateLearningContent(
                brief,
                completed,
                options.authorizedSources,
                reservedIdentities,
            );

            return {
                status: 'ready',
                proposal,
                ...(validatedCallIds.length ? { validatedCallIds } : {}),
                summary: `${brief.tasks.length} requested content component(s), ${completed.reduce((sum, task) => sum + task.blocks.length, 0)} interactive block(s).`,
            };
        },
    };
}

export type LearningContentAuthoring = ReturnType<
    typeof createLearningContentAuthoring
>;
