import {
    learningUnitIdentity,
    learningUnitRecovery,
    maximumLearningUnitAttempts,
    unitDependencies,
    unitRepair,
} from './learning-unit-recovery';
import { ConversationError } from '../../domain/conversation';
import {
    acknowledgedGenerationAttempts,
    type GenerationExecutionContext,
} from '../../application/ports/generation-run';
import { remainingLearningBatches } from '../../application/learning-content-batches';
import { generationRevisionCall } from '../../application/generation-revision-call';
import { structuredCallInputBytes } from '../../application/structured-call-input-bytes';
import {
    learningContentAuthoringOutputTokenLimit,
    learningUnitMinimumOutput,
    estimateLearningContentOutput,
} from '../../application/learning-content-output-capacity';
import { restoreGenerationExecution } from './learning-generation-plan';
import {
    prepareNamedExerciseBrief,
    exerciseTaskSource,
} from './exercise-authoring-context';
import {
    learningContentAuthoringInstructions,
    prepareLearningUnitCall,
    measureProspectiveUnit,
} from './learning-unit-call';

function prepareGenerationWork(context: GenerationExecutionContext) {
    const restored = restoreGenerationExecution(context);
    const authorizedSources = context.sources
        .filter((source) => !source.proposalId)
        .flatMap((source) => source.blocks);
    const prepared = prepareNamedExerciseBrief(
        restored.brief,
        restored.taskSources,
        authorizedSources,
    );

    if (prepared.status !== 'ready') {
        throw new ConversationError(
            'generation_scope_change',
            'The saved lesson needs a revised plan before generation can continue.',
        );
    }

    const planned = remainingLearningBatches(prepared.brief, true, restored);
    if (!planned) {
        throw new ConversationError(
            'generation_scope_change',
            'The saved lesson needs smaller sections before generation can continue.',
        );
    }

    return { restored, authorizedSources, prepared, planned };
}

/** Prepared actions execute solely from frozen plan inputs. Chat history, the open document and superseded checkpoint bodies are never sent to this call. */
export function generationAdmissionInput(
    context: GenerationExecutionContext,
    learnerRequest: string,
    acknowledgedTurnId?: string,
) {
    if (context.purpose === 'revision') {
        const minimumInputBound = structuredCallInputBytes(
            generationRevisionCall(context.plan, learnerRequest),
        );

        return {
            minimumInputBound,
            inputTokenBound: minimumInputBound,
            minimumOutputTokens: 0,
        };
    }

    const { restored, authorizedSources, prepared, planned } =
        prepareGenerationWork(context);
    const history = acknowledgedTurnId
        ? acknowledgedGenerationAttempts(
              context.unitAttempts ?? [],
              acknowledgedTurnId,
          )
        : (context.unitAttempts ?? []);
    const blocked = new Set<string>();
    let repair: ReturnType<typeof unitRepair>;
    const batch = planned.batches.find((candidate) => {
        const identity = learningUnitIdentity(
            candidate,
            restored.completed,
            restored.taskSources,
        );
        const recovery = learningUnitRecovery(identity, history);
        if (recovery.uncertain) {
            throw new ConversationError(
                'generation_acknowledgement_required',
                'The prior dispatch requires reconciliation.',
            );
        }

        if (
            blocked.has(identity.taskId) ||
            [...unitDependencies(candidate)].some((id) => blocked.has(id)) ||
            recovery.index >= maximumLearningUnitAttempts
        ) {
            blocked.add(identity.taskId);

            return false;
        }

        repair = unitRepair(recovery.index, recovery.diagnostic);

        return true;
    });

    if (!batch) {
        // A fully checkpointed run can still need local final proposal assembly.
        return {
            minimumInputBound: 1,
            inputTokenBound: 1,
            minimumOutputTokens: 0,
        };
    }

    const projected = prepareLearningUnitCall({
        ...restored,
        authorizedSources,
        brief: prepared.brief,
        batch,
        durable: true,
        repair,
        maxOutputTokens: learningContentAuthoringOutputTokenLimit,
    });

    if (projected.status !== 'ready') {
        throw new ConversationError(
            'generation_scope_change',
            'The next lesson unit needs a revised material dependency.',
        );
    }

    const minimumInputBound = structuredCallInputBytes({
        instructions: learningContentAuthoringInstructions,
        prompt: projected.prompt,
        schema: projected.schema,
    });

    // Repair may append compact-regeneration guidance and up to eight sanitized schema paths.
    // Reserve prospective headroom while keeping the first valid attempt admissible.
    return {
        minimumInputBound,
        inputTokenBound: minimumInputBound + 4096,
        minimumOutputTokens: learningUnitMinimumOutput(batch.brief),
    };
}

/** Quote only known material and a planning estimate for future dependency text.
 * Admission measures the complete native request again after real checkpoints. */
export function prospectiveLessonCalls(context: GenerationExecutionContext) {
    const { restored, authorizedSources, prepared, planned } =
        prepareGenerationWork(context);
    const complete = new Set(restored.completedTaskIds);

    return planned.batches.map((batch) => {
        const task = batch.brief.tasks[0]!;
        const dependencies = [...unitDependencies(batch)];
        const available = dependencies.filter((id) => complete.has(id));
        const unresolved = dependencies.filter((id) => !complete.has(id));
        const taskSources = new Map(restored.taskSources);
        if (unresolved.length && available.length) {
            taskSources.set(
                task.id,
                exerciseTaskSource(
                    {
                        ...task,
                        source: { kind: 'task', taskId: available[0]! },
                        dependencies: available,
                    },
                    restored.completed,
                    restored.taskSources,
                    authorizedSources,
                ),
            );
        }

        const relevantSources = new Map(
            [...taskSources].filter(([id]) => id === task.id),
        );
        const recovery = learningUnitRecovery(
            learningUnitIdentity(
                batch,
                restored.completed,
                restored.taskSources,
            ),
            context.unitAttempts ?? [],
        );
        const requestBytes = Array.from(
            { length: maximumLearningUnitAttempts - recovery.index },
            (_, offset) => {
                const index = recovery.index + offset;
                const diagnostic =
                    offset === 0 && recovery.diagnostic
                        ? recovery.diagnostic
                        : { code: 'output-limit' as const };
                const measured = measureProspectiveUnit(
                    {
                        ...restored,
                        durable: true,
                        batch,
                        brief: prepared.brief,
                        authorizedSources,
                        maxOutputTokens:
                            learningContentAuthoringOutputTokenLimit,
                        repair: unitRepair(index, diagnostic),
                    },
                    relevantSources,
                    unresolved.length > 0,
                );

                // Persisted paths are at most eight fields of 200 bytes. A future
                // repair can require that extra feedback after the initial quote.
                return index === 1 && !recovery.diagnostic
                    ? measured + 1_650
                    : measured;
            },
        );
        const futureSourceTokens = unresolved.reduce((sum, id) => {
            const producer = prepared.brief.tasks.find(
                (candidate) => candidate.id === id,
            )!;

            return sum + estimateLearningContentOutput({ tasks: [producer] });
        }, 0);

        return {
            requestBytes,
            futureSourceTokens,
            outputTokens: learningUnitMinimumOutput(batch.brief),
        };
    });
}
