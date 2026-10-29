import { eq, sql } from 'drizzle-orm';
import {
    DrizzleAiCreditTransactionParticipant,
    type AiCreditTransaction,
} from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import {
    speechJobsTable as jobs,
    speechRecordingsTable as recordings,
} from './schema';
import { settleSpeechProviderExpense } from './speech-accounting';
import type { AudioObjectReference } from '../application/ports';

export type KnowledgeSpeechSourceState = 'legacy' | 'available' | 'unavailable';
export async function knowledgeSpeechSourceState(
    tx: AiCreditTransaction,
    jobId: string,
    leaseToken?: string,
): Promise<KnowledgeSpeechSourceState> {
    const rows = await tx.execute(
        sql`select public.languon_speech_knowledge_source_state(${jobId}::uuid,${leaseToken ?? null}::uuid) as state`,
    );
    const state = rows[0]?.state;
    return state === 'legacy' || state === 'available' ? state : 'unavailable';
}

/** Caller has the current row/lease and has already locked source authority before accounting. */
export async function rejectKnowledgeSpeechResult(
    tx: AiCreditTransaction,
    row: typeof jobs.$inferSelect,
    now: Date,
    outcome: 'ready' | 'not_submitted' | 'unknown',
    storage?: AudioObjectReference,
) {
    await settleSpeechProviderExpense(tx, row, outcome, now);
    await tx.update(jobs).set({ state: 'failed' }).where(eq(jobs.id, row.id));
    let billingState = row.billingState;
    if (row.reservationId && row.payerId && row.billingState === 'reserved') {
        await new DrizzleAiCreditTransactionParticipant(tx).settleSpeechAttempt(
            {
                ownerId: row.payerId,
                reservationId: row.reservationId,
                settledAt: now,
                outcome: 'failure',
            },
        );
        billingState = 'released_no_charge';
    }
    await tx
        .update(jobs)
        .set({
            state: 'failed',
            billingState,
            error: 'speech_source_unavailable',
            leaseToken: null,
            leaseExpiresAt: null,
        })
        .where(eq(jobs.id, row.id));
    await tx
        .update(recordings)
        .set({
            state: 'deleting',
            text: '',
            ...(storage ? { storage } : {}),
            version: sql`${recordings.version}+1`,
        })
        .where(eq(recordings.id, row.recordingId));
}
