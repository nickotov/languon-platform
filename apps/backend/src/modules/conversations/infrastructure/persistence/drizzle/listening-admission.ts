import { and, eq, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import type { ConversationSource } from '@languon/contracts';
import type {
    GenerationAdmission,
    GenerationAutomaticAdmission,
    GenerationExecutionContext,
} from '../../../application/ports/generation-run';
import type { ConversationSourceSnapshot } from '../../../domain/conversation';
import type { TurnRow } from './conversation-persistence-context';
import type { ConversationsTransaction } from './conversation-source';
import { listeningAllowances } from './listening-allowance-schema';
import { conflict } from './conversation-persistence-context';

const listeningBudgetSchema = z.object({
    maximumCreditsMilli: z.string().regex(/^\d+$/),
    maximumProviderMicros: z
        .number()
        .int()
        .nonnegative()
        .max(Number.MAX_SAFE_INTEGER),
});

function includeListeningSpeech(
    generation: GenerationAdmission | undefined,
    context: GenerationExecutionContext | undefined,
) {
    if (generation?.kind !== 'generation' || generation.automatic || !context) {
        return false;
    }

    // The existing explicit Continue quote may renew only the unfinished recording work.
    return context.plan.tasks.some(
        (task) =>
            task.kind === 'audio' &&
            !context.artifacts.some(
                (artifact) =>
                    artifact.taskId === task.id && artifact.taskComplete,
            ),
    );
}

export function lessonAdmissionOptions(
    source: ConversationSource,
    snapshot: ConversationSourceSnapshot,
    generation?: GenerationAdmission,
    context?: GenerationExecutionContext,
    recordingPlanAuthorization?: GenerationAutomaticAdmission | null,
    renewRecording = false,
) {
    return {
        ...(renewRecording ? { renewRecording: true } : {}),
        ...(recordingPlanAuthorization ? { recordingPlanAuthorization } : {}),
        includeListeningSpeech: includeListeningSpeech(generation, context),
        mayGenerateLesson:
            generation?.kind === 'generation' ||
            (!generation &&
                source.kind === 'knowledge' &&
                !!snapshot.blockTarget),
        reserveToolContinuation:
            !!snapshot.blockTarget || !!snapshot.dictionaryGenerationContext,
    };
}

export async function persistListeningAllowance(
    tx: ConversationsTransaction,
    turn: TurnRow,
    noteId: string,
    consentRootId?: string,
) {
    const target = turn.sourceSnapshot.blockTarget;
    const consent = turn.execution.recordingConsentMilli;
    const budget = turn.execution.listeningSpeechBudget;
    if ((!budget && consent === undefined) || !target) {
        return;
    }

    const allowance = budget ? listeningBudgetSchema.parse(budget) : null;
    const preauthorizedCredits =
        consent === undefined
            ? null
            : BigInt(z.string().regex(/^\d+$/).parse(consent));

    if (allowance && consentRootId) {
        // Transfer a signed ceiling once in the same transaction as creating the new grant.
        // An ordinary grant or a different owner's consent can never be consumed here.
        const [consumed] = await tx
            .delete(listeningAllowances)
            .where(
                and(
                    eq(listeningAllowances.rootTurnId, consentRootId),
                    eq(listeningAllowances.ownerId, turn.ownerId),
                    eq(listeningAllowances.conversationId, turn.conversationId),
                    eq(listeningAllowances.noteId, noteId),
                    eq(listeningAllowances.branchId, target.branchId),
                    isNotNull(listeningAllowances.preauthorizedCredits),
                ),
            )
            .returning({ id: listeningAllowances.rootTurnId });

        if (!consumed) {
            throw conflict(
                'The recording authorization changed. Review the current allowance.',
            );
        }
    }

    await tx.insert(listeningAllowances).values({
        rootTurnId: turn.id,
        ownerId: turn.ownerId,
        conversationId: turn.conversationId,
        noteId,
        branchId: target.branchId,
        preauthorizedCredits,
        remainingCredits: BigInt(allowance?.maximumCreditsMilli ?? 0),
        remainingProviderMicros: BigInt(allowance?.maximumProviderMicros ?? 0),
    });
}
