import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { and, eq, sql } from 'drizzle-orm';
import {
    KnowledgeTranscriptionResultSchema,
    providerSecondsToAudioMilliseconds,
    type KnowledgeTranscriptionResult,
} from '@languon/contracts';
import type { KnowledgeTranscriptionLease } from '../../../application/transcription-job-store';
import { DrizzleActionAccountingParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant';
import { aiCreditActionsTable as actions } from '../../../../ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import { knowledgeTranscriptionJobsTable as jobs } from './transcription-accounting-schema';
import {
    transcriptionJob,
    type TranscriptionContext,
    type TranscriptionJobRow,
} from './transcription-context';
import {
    lockKnowledgeOwner,
    type KnowledgeTransaction,
} from './knowledge-transaction';
import { readTranscriptionWorkerAudio } from './transcription-worker-source';
import { KnowledgeDomainError } from '../../../domain/knowledge';

export async function terminateTranscription(
    tx: KnowledgeTransaction,
    row: TranscriptionJobRow,
    at: Date,
    result: KnowledgeTranscriptionResult | null,
    failureCode?: string,
) {
    if (result) {
        if (result.receiptId !== row.receiptId)
            throw new KnowledgeDomainError(
                'invalid_request',
                'The transcript receipt does not match its operation.',
            );
        const duration = result.usage
            ? providerSecondsToAudioMilliseconds(result.usage.seconds)
            : null;

        await tx.execute(
            sql`select languon_observe_transcription_call(${row.id}::uuid,${result.receiptId}::uuid,${duration}::bigint)`,
        );
    }

    if (!['confirmation-required', 'queued', 'running'].includes(row.state))
        return false;
    let sourceValid = false;
    if (
        result &&
        !failureCode &&
        !row.cancellationRequestedAt &&
        row.deadlineAt > at &&
        row.leaseDeadline &&
        row.leaseDeadline > at
    ) {
        try {
            const source = await readTranscriptionWorkerAudio(tx, row);
            sourceValid =
                source.durationMs === row.sourceDurationMs &&
                source.bytes.length === row.byteLength;
        } catch (error) {
            if (!(error instanceof KnowledgeDomainError)) throw error;
        }
    }

    const succeeded = Boolean(sourceValid && result);
    const explicitStop =
        row.cancellationRequestedAt !== null &&
        row.failureCode === 'explicit_stop';
    const state = succeeded
        ? 'completed'
        : explicitStop
          ? 'cancelled'
          : 'failed';
    const code = succeeded
        ? null
        : explicitStop
          ? 'explicit_stop'
          : (failureCode ??
            (row.deadlineAt <= at
                ? 'deadline_exceeded'
                : 'transcription_failed'));

    await tx
        .update(jobs)
        .set({
            state,
            result: succeeded ? result : null,
            observedAudioInputMs: result?.usage
                ? providerSecondsToAudioMilliseconds(result.usage.seconds)
                : null,
            failureCode: code,
            updatedAt: at,
        })
        .where(eq(jobs.id, row.id));

    const [action] = await tx
        .select({ id: actions.id })
        .from(actions)
        .where(eq(actions.id, row.id));

    if (action) {
        await tx.execute(
            sql`select languon_settle_transcription_attempt(${row.id}::uuid,${succeeded})`,
        );

        await new DrizzleActionAccountingParticipant(tx).settle({
            actionId: row.id,
            ownerId: row.ownerId,
            outcome: succeeded
                ? 'success'
                : explicitStop
                  ? 'stopped'
                  : 'failure',
            at,
        });
    }

    return true;
}

export async function finishTranscription(
    context: TranscriptionContext,
    lease: KnowledgeTranscriptionLease,
    raw: KnowledgeTranscriptionResult | null,
    failureCode?: string,
) {
    const result = raw ? KnowledgeTranscriptionResultSchema.parse(raw) : null;

    return context.database.transaction(async (tx) => {
        const finished = await tx.execute(
            sql`select languon_finish_transcription(${lease.operationId}::uuid,${lease.workerId}::text,${lease.fencingToken}::integer,${lease.leaseToken}::uuid,${result ? JSON.stringify(result) : null}::jsonb,${failureCode ?? null}::text) as finished`,
        );

        return finished[0]?.finished === true;
    });
}

export async function cancelTranscription(
    context: TranscriptionContext,
    ownerId: string,
    noteId: string,
    id: string,
) {
    return context.database.transaction(async (tx) => {
        await lockTextAiCapacity(tx);
        await new DrizzleActionAccountingParticipant(tx).lockForSettlement(
            ownerId,
        );

        await lockKnowledgeOwner(tx, ownerId);
        const [row] = await tx
            .select()
            .from(jobs)
            .where(
                and(
                    eq(jobs.id, id),
                    eq(jobs.ownerId, ownerId),
                    eq(jobs.noteId, noteId),
                ),
            )
            .for('update');

        if (!row)
            throw new KnowledgeDomainError(
                'knowledge_not_found',
                'The transcription is unavailable.',
            );
        const at = context.clock.now();
        if (
            ['confirmation-required', 'queued', 'running'].includes(row.state)
        ) {
            const stopped = {
                ...row,
                cancellationRequestedAt: at,
                failureCode: 'explicit_stop',
            };

            await tx
                .update(jobs)
                .set({
                    cancellationRequestedAt: at,
                    failureCode: 'explicit_stop',
                })
                .where(eq(jobs.id, row.id));

            await terminateTranscription(
                tx,
                stopped,
                at,
                null,
                'explicit_stop',
            );
        }

        const [saved] = await tx.select().from(jobs).where(eq(jobs.id, id));

        return transcriptionJob(saved!);
    });
}

export async function recoverTranscriptions(context: TranscriptionContext) {
    const at = context.clock.now();
    const candidates = await context.database
        .select({ id: jobs.id, ownerId: jobs.ownerId })
        .from(jobs)
        .where(
            and(
                sql`${jobs.state} in ('queued','running')`,
                sql`(${jobs.deadlineAt}<=${at.toISOString()}::timestamptz or (${jobs.state}='running' and ${jobs.leaseDeadline}<=${at.toISOString()}::timestamptz))`,
            ),
        )
        .limit(20);
    let recovered = 0;
    for (const candidate of candidates) {
        const result = await context.database.execute(
            sql`select languon_recover_transcription(${candidate.id}::uuid) as recovered`,
        );

        recovered += result[0]?.recovered === true ? 1 : 0;
    }

    return recovered;
}
