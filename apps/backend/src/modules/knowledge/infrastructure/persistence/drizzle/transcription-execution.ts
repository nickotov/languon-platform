import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { and, eq, gt, sql } from 'drizzle-orm';
import { KnowledgeTranscriptionDispatchPermitSchema } from '@languon/contracts';
import type { KnowledgeTranscriptionLease } from '../../../application/transcription-job-store';
import type { TranscriptionDispatchRequest } from '../../../application/transcription-provider';
import { DrizzleActionAccountingParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant';
import { knowledgeTranscriptionJobsTable as jobs } from './transcription-accounting-schema';
import { type TranscriptionContext } from './transcription-context';
import { readTranscriptionWorkerAudio } from './transcription-worker-source';
import { KnowledgeDomainError } from '../../../domain/knowledge';
import {
    lockKnowledgeOwner,
    type KnowledgeTransaction,
} from './knowledge-transaction';

/** Only queue/lease metadata is readable with worker credentials. Transcript
 * payloads stay behind author reads; immutable audio requires the private lease. */
const workerProjection = {
    id: jobs.id,
    ownerId: jobs.ownerId,
    noteId: jobs.noteId,
    assetId: jobs.assetId,
    languages: jobs.languages,
    state: jobs.state,
    workerId: jobs.workerId,
    fencingToken: jobs.fencingToken,
    leaseDeadline: jobs.leaseDeadline,
    deadlineAt: jobs.deadlineAt,
    cancellationRequestedAt: jobs.cancellationRequestedAt,
    sourceDurationMs: jobs.sourceDurationMs,
    byteLength: jobs.byteLength,
};

export async function lockTranscriptionLease(
    tx: KnowledgeTransaction,
    lease: KnowledgeTranscriptionLease,
) {
    await lockTextAiCapacity(tx);
    await new DrizzleActionAccountingParticipant(tx).lockForSettlement(
        lease.ownerId,
    );

    await lockKnowledgeOwner(tx, lease.ownerId);
    const [row] = await tx
        .select(workerProjection)
        .from(jobs)
        .where(
            and(
                eq(jobs.id, lease.operationId),
                eq(jobs.ownerId, lease.ownerId),
            ),
        );

    if (
        !row ||
        row.state !== 'running' ||
        row.workerId !== lease.workerId ||
        row.fencingToken !== lease.fencingToken ||
        row.leaseDeadline === null ||
        row.leaseDeadline <= new Date()
    )
        throw new KnowledgeDomainError(
            'version_conflict',
            'The transcription lease is no longer active.',
        );

    return row;
}

export async function claimTranscription(
    context: TranscriptionContext,
    workerId: string,
) {
    if (!workerId.trim() || workerId.length > 200)
        throw new Error('Invalid transcription worker identity.');

    return context.database.transaction(async (tx) => {
        const at = context.clock.now();
        const [candidate] = await tx
            .select({ id: jobs.id, ownerId: jobs.ownerId })
            .from(jobs)
            .where(and(eq(jobs.state, 'queued'), gt(jobs.deadlineAt, at)))
            .orderBy(jobs.createdAt)
            .limit(1);

        if (!candidate) return null;
        await lockTextAiCapacity(tx);
        await new DrizzleActionAccountingParticipant(tx).lockForSettlement(
            candidate.ownerId,
        );

        await lockKnowledgeOwner(tx, candidate.ownerId);
        const [job] = await tx
            .select(workerProjection)
            .from(jobs)
            .where(and(eq(jobs.id, candidate.id), eq(jobs.state, 'queued')));

        if (!job || job.deadlineAt <= at) return null;
        const claimedResult = await tx.execute(
            sql`select languon_claim_transcription(${job.id}::uuid,${workerId}::text) as claimed`,
        );

        if (!claimedResult[0]?.claimed) return null;
        const [claimed] = await tx
            .select(workerProjection)
            .from(jobs)
            .where(eq(jobs.id, job.id));
        const leaseDeadline = claimed!.leaseDeadline!;

        return {
            operationId: claimed!.id,
            noteId: claimed!.noteId,
            assetId: claimed!.assetId,
            languages: claimed!.languages,
            ownerId: claimed!.ownerId,
            workerId,
            fencingToken: claimed!.fencingToken,
            leaseToken: String(claimedResult[0]!.claimed),
            deadlineAt: claimed!.deadlineAt,
            leaseDeadline,
        };
    });
}

export async function heartbeatTranscription(
    context: TranscriptionContext,
    lease: KnowledgeTranscriptionLease,
) {
    return context.database.transaction(async (tx) => {
        try {
            const job = await lockTranscriptionLease(tx, lease);
            const now = context.clock.now();
            if (job.deadlineAt <= now || job.cancellationRequestedAt)
                return false;
            await readTranscriptionWorkerAudio(tx, job, lease.leaseToken);

            const renewed = await tx.execute(
                sql`select languon_heartbeat_transcription(${job.id}::uuid,${lease.workerId}::text,${lease.fencingToken}::integer,${lease.leaseToken}::uuid) as renewed`,
            );

            return renewed[0]?.renewed === true;
        } catch (error) {
            if (error instanceof KnowledgeDomainError) return false;

            throw error;
        }
    });
}

export async function transcriptionAudio(
    context: TranscriptionContext,
    lease: KnowledgeTranscriptionLease,
) {
    return context.database.transaction(async (tx) => {
        const job = await lockTranscriptionLease(tx, lease);
        if (
            job.cancellationRequestedAt ||
            job.deadlineAt <= context.clock.now()
        )
            throw new KnowledgeDomainError(
                'version_conflict',
                'Transcription was cancelled or expired.',
            );

        return readTranscriptionWorkerAudio(tx, job, lease.leaseToken);
    });
}

export async function authorizeTranscription(
    context: TranscriptionContext,
    lease: KnowledgeTranscriptionLease,
    input: TranscriptionDispatchRequest,
) {
    input.signal.throwIfAborted();
    if (
        input.operationId !== lease.operationId ||
        input.noteId !== lease.noteId ||
        input.assetId !== lease.assetId ||
        JSON.stringify(input.languages) !== JSON.stringify(lease.languages)
    )
        throw new KnowledgeDomainError(
            'invalid_request',
            'Dispatch input differs from its admitted operation.',
        );

    return context.database.transaction(async (tx) => {
        let result;
        try {
            result = await tx.execute(
                sql`select languon_authorize_transcription_dispatch_fenced(${lease.operationId}::uuid,${lease.workerId}::text,${lease.fencingToken}::integer,${lease.leaseToken}::uuid,${input.checksum}::text,${input.byteLength}::integer,${input.durationMs}::integer,${context.credentialFingerprint ?? null}::text) as permit`,
            );
        } catch {
            input.signal.throwIfAborted();

            // Drizzle errors include SQL parameters: keep private lease/credential pins out of errors.
            throw new KnowledgeDomainError(
                'service_unavailable',
                'Transcription dispatch authorization was rejected.',
            );
        }

        input.signal.throwIfAborted();

        return KnowledgeTranscriptionDispatchPermitSchema.parse(
            result[0]?.permit,
        );
    });
}
