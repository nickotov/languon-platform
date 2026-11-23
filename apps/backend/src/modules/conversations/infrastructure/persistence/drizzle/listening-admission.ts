import { z } from 'zod';
import type {
    ConversationSource,
    SubmitConversationTurnRequest,
} from '@languon/contracts';
import type {
    GenerationAdmission,
    GenerationExecutionContext,
} from '../../../application/ports/generation-run';
import type { ConversationSourceSnapshot } from '../../../domain/conversation';
import type { TurnRow } from './conversation-persistence-context';
import type { ConversationsTransaction } from './conversation-source';
import { listeningAllowances } from './listening-allowance-schema';

const listeningBudgetSchema = z.object({
    maximumCreditsMilli: z.string().regex(/^\d+$/),
    maximumProviderMicros: z
        .number()
        .int()
        .nonnegative()
        .max(Number.MAX_SAFE_INTEGER),
});

function includeListeningSpeech(
    input: SubmitConversationTurnRequest,
    generation: GenerationAdmission | undefined,
    context: GenerationExecutionContext | undefined,
    snapshot: ConversationSourceSnapshot,
) {
    if (!generation) {
        return !!snapshot.blockTarget && input.includeListeningSpeech === true;
    }

    if (generation.kind !== 'generation' || generation.automatic || !context) {
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
    input: SubmitConversationTurnRequest,
    source: ConversationSource,
    snapshot: ConversationSourceSnapshot,
    generation?: GenerationAdmission,
    context?: GenerationExecutionContext,
) {
    return {
        includeListeningSpeech: includeListeningSpeech(
            input,
            generation,
            context,
            snapshot,
        ),
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
) {
    const target = turn.sourceSnapshot.blockTarget;
    if (!turn.execution.listeningSpeechBudget || !target) {
        return;
    }

    const allowance = listeningBudgetSchema.parse(
        turn.execution.listeningSpeechBudget,
    );

    await tx.insert(listeningAllowances).values({
        rootTurnId: turn.id,
        ownerId: turn.ownerId,
        conversationId: turn.conversationId,
        noteId,
        branchId: target.branchId,
        remainingCredits: BigInt(allowance.maximumCreditsMilli),
        remainingProviderMicros: BigInt(allowance.maximumProviderMicros),
    });
}
