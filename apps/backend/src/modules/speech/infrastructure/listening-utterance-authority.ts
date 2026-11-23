import { and, eq, gt, sql } from 'drizzle-orm';
import type { AiCreditTransaction } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { generationRunsTable as runs } from '../../conversations/infrastructure/persistence/drizzle/conversation-generation-schema';
import { listeningAllowances } from '../../conversations/infrastructure/persistence/drizzle/listening-allowance-schema';
import { conversationTurnsTable as turns } from '../../conversations/infrastructure/persistence/drizzle/schema';
import type { ListeningUtteranceAdmission } from './audio/prepare-listening-recording';
import { SpeechError } from '../domain/speech-policy';

export async function lockListeningSpeechAuthority(
    tx: AiCreditTransaction,
    input: ListeningUtteranceAdmission,
) {
    // Source locks precede the active turn, then the run, as in the conversation worker.
    const [turn] = await tx
        .select({ id: turns.id })
        .from(turns)
        .where(
            and(
                eq(turns.id, input.turnId),
                eq(turns.ownerId, input.actorId),
                eq(turns.status, 'running'),
                eq(turns.leaseToken, input.leaseToken),
                eq(turns.cancelRequested, false),
                gt(turns.leaseUntil, sql`clock_timestamp()`),
            ),
        )
        .for('share');

    if (!turn) {
        throw new SpeechError('listening_authorization_expired');
    }

    const [run] = await tx
        .select()
        .from(runs)
        .where(
            and(
                eq(runs.id, input.runId),
                eq(runs.ownerId, input.actorId),
                eq(runs.noteId, input.noteId),
                eq(runs.state, 'running'),
                eq(runs.activeTurnId, input.turnId),
                eq(runs.revision, input.revision),
                sql`(${runs.automation}->>'expiresAt')::timestamptz > clock_timestamp()`,
            ),
        )
        .for('share');
    const auth = run?.automation;
    if (
        !run ||
        !auth ||
        auth.revision !== input.revision ||
        !auth.actionIds.includes(input.turnId) ||
        run.sourceSnapshot.blockTarget?.branchId !== input.branchId ||
        !run.taskManifest.some(
            (task) => task.id === input.taskId && task.kind === 'audio',
        )
    ) {
        throw new SpeechError('listening_authorization_required');
    }

    const [allowance] = await tx
        .select()
        .from(listeningAllowances)
        .where(
            and(
                eq(listeningAllowances.rootTurnId, auth.rootActionId),
                eq(listeningAllowances.ownerId, input.actorId),
                eq(listeningAllowances.conversationId, run.conversationId),
                eq(listeningAllowances.noteId, input.noteId),
                eq(listeningAllowances.branchId, input.branchId),
                sql`exists(select 1 from ai_credit_actions a where a.id=${listeningAllowances.rootTurnId}
                    and a.owner_id=${listeningAllowances.ownerId} and a.deadline_at>clock_timestamp()
                    and a.created_at+interval '15 minutes'>clock_timestamp())`,
            ),
        )
        .for('update');

    if (!allowance) {
        throw new SpeechError('listening_authorization_required');
    }

    // Reserve the full liability. Confirmed and unknown dispatches cannot grant a second job headroom.
    return {
        rootTurnId: allowance.rootTurnId,
        reserve: async (credits: bigint, providerMicros: bigint) => {
            const remainingCredits = allowance.remainingCredits - credits;
            const remainingProviderMicros =
                allowance.remainingProviderMicros - providerMicros;

            if (
                credits < 0n ||
                providerMicros < 0n ||
                remainingCredits < 0n ||
                remainingProviderMicros < 0n
            ) {
                throw new SpeechError('listening_budget_exhausted');
            }

            await tx
                .update(listeningAllowances)
                .set({ remainingCredits, remainingProviderMicros })
                .where(
                    eq(listeningAllowances.rootTurnId, allowance.rootTurnId),
                );
        },
    };
}
