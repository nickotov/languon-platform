import type { GenerationRunCallbacks } from '../../application/ports/generation-run';
import {
    compileLearningUnit,
    readListeningUnit,
    type DecodedLearningUnit,
} from './learning-unit-validation';
import { generationFingerprint } from '../../application/generation-run-revisions';
import { ConversationError } from '../../domain/conversation';
import type {
    GenerationAttemptEvent,
    GenerationUnitAttempt,
} from '../../application/ports/generation-run';
import {
    learningUnitIdentity,
    learningUnitRecovery,
    maximumLearningUnitAttempts,
    unitAttempt,
    unitDependencies,
    unitRepair,
} from './learning-unit-recovery';
import { randomUUID } from 'node:crypto';
import { TutorStructuredOutputError } from './tutor-request-agents';
import {
    GenerationExecutionFailure,
    type GenerationFailureDiagnostic,
} from '../../application/generation-failure';
import { schemaFailureDiagnostic } from './structured-output-diagnostics';
import type { z } from 'zod';
import {
    prepareLearningUnitCall,
    learningContentAuthoringInstructions,
} from './learning-unit-call';
import { structuredCallInputBytes } from '../../application/structured-call-input-bytes';
import type { LearningBlock } from '@languon/contracts';
import {
    LearningContentBriefSchema,
    learningContentRequirements,
    type LearningContentResult,
} from '../../application/learning-content-contract';
import {
    learningContentMinimumCallTimeMs,
    remainingLearningBatches,
    type LearningContentExecutionBudget,
} from '../../application/learning-content-batches';
import {
    mergeLearningContentBatchResults,
    type LearningContentTaskResult,
} from '../../application/learning-content-batch-results';
import {
    learningUnitMinimumOutput,
    learningContentAuthoringOutputTokenLimit,
} from '../../application/learning-content-output-capacity';
import { validateLearningContent } from '../../application/learning-content-validation';
import { createLearningContentBatchBudget } from './learning-content-batch-budget';
import {
    prepareNamedExerciseBrief,
    type ExerciseAuthoringSource,
} from './exercise-authoring-context';

export { learningContentOutputSchema } from '../../application/learning-content-output-contract';

export { learningContentAuthoringInstructions } from './learning-unit-call';

export interface LearningContentModelCall {
    validationId: string;
    prompt: string;
    schema: z.ZodType;
    signal: AbortSignal;
    maxOutputTokens: number;
}

export interface LearningContentAuthoringOptions {
    materializeListeningRecording?: GenerationRunCallbacks['materializeListeningRecording'];
    trackValidatedCalls?: boolean;
    completed?: readonly LearningContentTaskResult[];
    completedBatchKeys?: readonly string[];
    completedTaskIds?: readonly string[];
    run?: { runId: string; revision: number };
    planCreatedInStage?: boolean;
    unitAttempts?: readonly GenerationUnitAttempt[];
    onGenerationAttempt?: (event: GenerationAttemptEvent) => Promise<void>;
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

            if (
                parsed.data.tasks.some((task) => task.kind === 'audio') &&
                (!options.run || !options.materializeListeningRecording)
            ) {
                throw new ConversationError(
                    'generation_scope_change',
                    'New recordings require a durable listening lesson.',
                );
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

            const plan = remainingLearningBatches(
                brief,
                !!options.run,
                options,
            );
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

            const required = plan.batches.map((batch) =>
                learningUnitMinimumOutput(batch.brief),
            );
            let completed: LearningContentTaskResult[] = [
                ...(options.completed ?? []),
            ];
            const exerciseGroups = new Map(
                completed.flatMap((task) =>
                    task.blocks.flatMap((block) =>
                        block.type === 'exercise' && block.group
                            ? [[task.taskId, block.group] as const]
                            : [],
                    ),
                ),
            );
            let progress = false;
            const validatedCallIds: string[] = [];
            const blocked = new Set<string>();
            let exhausted: GenerationFailureDiagnostic | undefined;

            for (const [index, batch] of plan.batches.entries()) {
                const batchKey = generationFingerprint(batch);
                if (
                    batch.brief.tasks.some((task) => blocked.has(task.id)) ||
                    [...unitDependencies(batch)].some((id) => blocked.has(id))
                ) {
                    batch.brief.tasks.forEach((task) => blocked.add(task.id));
                    continue;
                }

                const identity = learningUnitIdentity(
                    batch,
                    completed,
                    options.taskSources,
                );
                const recovery = learningUnitRecovery(
                    identity,
                    options.unitAttempts ?? [],
                );

                if (recovery.uncertain) {
                    throw new GenerationExecutionFailure({
                        code: 'provider-outcome-unknown',
                        phase: 'dispatch',
                        taskId: identity.taskId,
                    });
                }

                let attemptIndex = recovery.index;
                let failureDiagnostic = recovery.diagnostic;
                const attemptLimit = options.run
                    ? maximumLearningUnitAttempts
                    : 2;
                const taskLocation =
                    batch.brief.tasks.length === 1
                        ? { taskId: batch.brief.tasks[0]!.id }
                        : {};
                const artifactIds = new Map(
                    batch.brief.tasks.map((task) => [task.id, randomUUID()]),
                );
                let accepted = false;
                let failureReason: 'invalid-output' | 'output-limit' =
                    recovery.diagnostic?.code === 'output-limit'
                        ? 'output-limit'
                        : 'invalid-output';

                while (!accepted) {
                    if (attemptIndex >= attemptLimit) {
                        exhausted ??= failureDiagnostic ?? {
                            code: 'content-invalid',
                            ...taskLocation,
                        };

                        batch.brief.tasks.forEach((task) =>
                            blocked.add(task.id),
                        );

                        break;
                    }

                    const repairing = attemptIndex > 0;
                    signal.throwIfAborted();
                    const remaining = budget.remaining();
                    if (
                        (options.run &&
                            remaining.remainingTimeMs !== undefined &&
                            remaining.remainingTimeMs <
                                learningContentMinimumCallTimeMs) ||
                        remaining.remainingCalls < 1 ||
                        remaining.remainingOutputTokens < required[index]!
                    ) {
                        // A completed invalid candidate is a technical failure, not a
                        // chargeable capacity answer after part of the work was spent.
                        return repairing && !options.onGenerationAttempt
                            ? {
                                  status: 'failed',
                                  reason: failureReason,
                                  ...(options.run && failureDiagnostic
                                      ? { diagnostic: failureDiagnostic }
                                      : {}),
                              }
                            : progress || options.planCreatedInStage
                              ? {
                                    status: 'paused',
                                    reason: 'budget',
                                    completed,
                                }
                              : capacityFailure();
                    }

                    // An estimate alone does not reserve tokens: the provider
                    // may consume its entire advertised output cap.
                    const repairReserve =
                        options.run &&
                        batch.exercisePart &&
                        !repairing &&
                        remaining.remainingCalls >= 2 &&
                        remaining.remainingOutputTokens >= 2 * required[index]!
                            ? required[index]!
                            : 0;
                    const maxOutputTokens = Math.min(
                        learningContentAuthoringOutputTokenLimit,
                        remaining.remainingOutputTokens - repairReserve,
                    );
                    const projected = prepareLearningUnitCall({
                        brief,
                        batch,
                        completed,
                        durable: !!options.run,
                        taskSources: options.taskSources,
                        authorizedSources: options.authorizedSources,
                        maxOutputTokens,
                        repair: unitRepair(attemptIndex, failureDiagnostic),
                    });

                    if (projected.status !== 'ready') {
                        return projected;
                    }

                    const { prompt, schema, contexts } = projected;
                    if (
                        options.run &&
                        remaining.perCallInputLimit !== undefined &&
                        structuredCallInputBytes({
                            prompt,
                            schema,
                            instructions: learningContentAuthoringInstructions,
                        }) > remaining.perCallInputLimit
                    ) {
                        if (!progress && !options.planCreatedInStage) {
                            throw new GenerationExecutionFailure({
                                code: 'admission-blocked',
                                admissionReason: 'context-too-large',
                                ...taskLocation,
                            });
                        }

                        // A different unit may need a larger allowance than the previous one.
                        // Persist progress and let fresh admission size it before dispatch.
                        return {
                            status: 'paused',
                            reason: 'budget',
                            completed,
                        };
                    }

                    const previous = completed.flatMap((task) => task.blocks);

                    budget.reserve(maxOutputTokens);
                    const validationId = randomUUID();
                    const attempt = unitAttempt(
                        identity,
                        attemptIndex,
                        validationId,
                    );

                    await options.onGenerationAttempt?.(attempt);
                    signal.throwIfAborted();
                    let received = false;
                    try {
                        // Transport failures propagate; only known completed invalid responses may recover.
                        const output = await options.generate({
                            validationId,
                            prompt,
                            schema,
                            signal,
                            maxOutputTokens,
                        });

                        signal.throwIfAborted();
                        received = true;

                        const decoded = projected.decode(
                            output,
                        ) as DecodedLearningUnit;

                        const audio = readListeningUnit(batch.brief, decoded);
                        if (audio) {
                            // Operational failures while storing or speaking a valid script
                            // are never model-format failures eligible for immediate repair.
                            received = false;
                            const recording =
                                await options.materializeListeningRecording!({
                                    ...options.run!,
                                    taskId: audio.task.id,
                                    validationId,
                                    language: audio.task.language!,
                                    ...(audio.task.maxDurationSeconds !==
                                        undefined && {
                                        maxDurationSeconds:
                                            audio.task.maxDurationSeconds,
                                    }),
                                    script: audio.script,
                                });

                            audio.item.blocks = [recording];
                            received = true;
                        }

                        const result = compileLearningUnit({
                            decoded,
                            brief: batch.brief,
                            lesson: brief,
                            contexts,
                            exerciseGroups,
                            linkableBlocks: [
                                ...(options.authorizedSources ?? []),
                                ...previous,
                            ],
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
                        try {
                            await options.onCallRejected?.(validationId);
                        } catch (receiptError) {
                            signal.throwIfAborted();
                            if (
                                !options.run ||
                                receiptError instanceof ConversationError
                            ) {
                                throw receiptError;
                            }

                            throw new GenerationExecutionFailure({
                                code: 'publication',
                                phase: 'receipt',
                                ...taskLocation,
                            });
                        }

                        if (
                            !received &&
                            !(error instanceof TutorStructuredOutputError)
                        ) {
                            if (
                                options.run &&
                                error instanceof GenerationExecutionFailure
                            ) {
                                throw new GenerationExecutionFailure({
                                    ...error.generationFailure,
                                    ...taskLocation,
                                });
                            }

                            if (
                                !options.run ||
                                error instanceof ConversationError
                            ) {
                                throw error;
                            }

                            // The outer gate still classifies evidenced provider/authority failures.
                            throw new GenerationExecutionFailure({
                                code: 'unknown',
                                phase: 'dispatch',
                                ...taskLocation,
                            });
                        }

                        failureReason =
                            error instanceof TutorStructuredOutputError
                                ? error.reason
                                : 'invalid-output';

                        failureDiagnostic = {
                            phase: 'validation',
                            ...(error instanceof TutorStructuredOutputError
                                ? error.diagnostic
                                : schemaFailureDiagnostic(error)),
                            ...taskLocation,
                        };

                        // Settlement and the durable rejection must both succeed before
                        // another strategy can acquire authority for this unit.
                        await options.onGenerationAttempt?.({
                            ...attempt,
                            outcome: 'rejected',
                            diagnostic: failureDiagnostic,
                        });

                        progress ||= Boolean(options.onGenerationAttempt);
                        attemptIndex += 1;
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

            if (exhausted) {
                return {
                    status: 'failed',
                    reason:
                        exhausted.code === 'output-limit'
                            ? 'output-limit'
                            : 'invalid-output',
                    ...(options.run
                        ? {
                              diagnostic: {
                                  ...exhausted,
                                  recoveryExhausted: true,
                              },
                          }
                        : {}),
                };
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
