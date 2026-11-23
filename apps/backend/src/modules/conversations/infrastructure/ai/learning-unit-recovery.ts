import type { GenerationFailure } from '@languon/contracts';
import type { LearningContentBatch } from '../../application/learning-content-batches';
import type { LearningContentTaskResult } from '../../application/learning-content-batch-results';
import { generationFingerprint } from '../../application/generation-run-revisions';
import {
    generationUnitStrategies as strategies,
    type GenerationAttemptEvent,
    type GenerationUnitAttempt,
} from '../../application/ports/generation-run';
import type { ExerciseAuthoringSource } from './exercise-authoring-context';

export const authoringSchemaVersion = 'learning-unit-v2';

export function unitDependencies(batch: LearningContentBatch) {
    return new Set(
        batch.brief.tasks.flatMap((task) => [
            ...(task.dependencies ?? []),
            ...(task.source?.kind === 'task' ? [task.source.taskId] : []),
        ]),
    );
}

/** Stable across worker handoffs. Only predecessor material and this unit's
 * frozen source affect its identity, never unrelated progress or rejected text. */
export function learningUnitIdentity(
    batch: LearningContentBatch,
    completed: readonly LearningContentTaskResult[],
    taskSources?: ReadonlyMap<string, ExerciseAuthoringSource>,
) {
    const dependencies = unitDependencies(batch);
    const taskId = batch.brief.tasks[0]!.id;
    const sources = taskSources?.get(taskId);

    return {
        taskId,
        unitOrdinal:
            (batch.exercisePart?.offset ?? batch.vocabularyPart?.offset ?? 0) +
            1,
        schemaVersion: authoringSchemaVersion,
        dependencyFingerprint: generationFingerprint({
            batch,
            dependencies: completed
                .filter((item) => dependencies.has(item.taskId))
                .map(({ taskId, blocks, prose }) => ({ taskId, blocks, prose }))
                .sort((a, b) => a.taskId.localeCompare(b.taskId)),
            sources: sources && {
                ...sources,
                proposalIds: [...(sources.proposalIds ?? [])],
                capturedOrigins: [...(sources.capturedOrigins ?? [])],
            },
        }),
    };
}

export function learningUnitRecovery(
    identity: ReturnType<typeof learningUnitIdentity>,
    attempts: readonly GenerationUnitAttempt[],
): { index: number; diagnostic?: GenerationFailure; uncertain?: boolean } {
    const history = attempts.filter(
        (attempt) =>
            attempt.taskId === identity.taskId &&
            attempt.unitOrdinal === identity.unitOrdinal &&
            attempt.schemaVersion === identity.schemaVersion &&
            attempt.dependencyFingerprint === identity.dependencyFingerprint,
    );

    if (history.some((attempt) => attempt.outcome === 'started')) {
        return { index: strategies.length, uncertain: true };
    }

    const rejected = history.filter((attempt) =>
        ['rejected', 'acknowledged', 'abandoned'].includes(attempt.outcome),
    );
    const last = rejected.sort(
        (a, b) =>
            strategies.indexOf(b.strategy) - strategies.indexOf(a.strategy),
    )[0];

    return last
        ? {
              index: strategies.indexOf(last.strategy) + 1,
              ...(last.diagnostic ? { diagnostic: last.diagnostic } : {}),
          }
        : { index: 0 };
}

export function unitAttempt(
    identity: ReturnType<typeof learningUnitIdentity>,
    index: number,
    validationId: string,
): GenerationAttemptEvent {
    return {
        ...identity,
        validationId,
        strategy: strategies[index]!,
        outcome: 'started',
    };
}

export const maximumLearningUnitAttempts = strategies.length;

export function unitRepair(index: number, diagnostic?: GenerationFailure) {
    if (index === 0) {
        return undefined;
    }

    return {
        strategy: index === 2 ? ('fallback' as const) : ('repair' as const),
        reason:
            diagnostic?.code === 'output-limit'
                ? ('output-limit' as const)
                : ('invalid-output' as const),
        diagnostic,
    };
}
