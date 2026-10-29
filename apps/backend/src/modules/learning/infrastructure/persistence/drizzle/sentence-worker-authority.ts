import { lockSentenceWorkerRow } from './sentence-worker-jobs';
import {
    sentenceWorkerJobs as workerJobs,
    authorizePrivateSentenceLease,
} from './sentence-worker-jobs';
import type { SentenceJobFailure } from '@languon/contracts';
import { eq, inArray, sql } from 'drizzle-orm';
import { dictionaryCardsTable as cards } from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import type { SentenceLease } from '../../../application/ports/sentence-worker-store';
import { SentenceUnavailableError } from '../../../domain/sentence-errors';
import type {
    SentenceCheckInput,
    SentenceGenerationInput,
} from '../../../domain/sentence-types';
import { settleSentenceAttempt } from './sentence-job-accounting';
import {
    authorizeSentence,
    lockSentenceLearner,
    readableExercise,
    type SentenceJobRow,
    type SentenceTransaction,
} from './sentence-persistence-support';
import {
    sentenceJobEntriesTable as jobEntries,
    sentenceAiJobsTable as jobs,
} from './sentence-schema';
import type { Usage } from './sentence-worker-context';
import {
    clearLease,
    leased,
    type SentenceWorkerPersistenceContext,
} from './sentence-worker-context';

export async function sentenceWorkerValid(
    tx: SentenceTransaction,
    job: SentenceJobRow,
): Promise<SentenceJobFailure | null> {
    if (job.sourceKind === 'knowledge-vocabulary') {
        try {
            const [valid] = await tx.execute(
                sql`select public.languon_knowledge_job_source_available(${job.id}::uuid,${job.jobKind},${job.learnerId}::uuid) as available`,
            );

            if (valid?.available !== true) return 'access_revoked';

            return null;
        } catch (error) {
            const cause = error as { code?: string; cause?: { code?: string } };
            if (cause.code === '23514' || cause.cause?.code === '23514')
                return 'access_revoked';

            throw error;
        }
    }

    if (!job.dictionaryId) return 'access_revoked';
    try {
        const access =
            job.authority.kind === 'owner'
                ? {
                      kind: 'owner' as const,
                      dictionaryId: job.dictionaryId,
                      learnerId: job.learnerId,
                  }
                : {
                      kind: 'shared' as const,
                      shareId: job.authority.shareId,
                      keyDigest: job.authority.keyDigest,
                      learnerId: job.learnerId,
                  };

        await authorizeSentence(tx, access, true);
        if (job.jobKind === 'sentence-generation') {
            const version = (job.inputPayload as SentenceGenerationInput)
                .generationPolicyVersion;

            if (
                (['sentence-generation:v1', 'sentence-preparation:v1'].includes(
                    job.format,
                ) &&
                    version !== 1) ||
                (['sentence-generation:v2', 'sentence-preparation:v2'].includes(
                    job.format,
                ) &&
                    version !== 2)
            )
                return 'invalid_model_output';
        }
    } catch (error) {
        if (error instanceof SentenceUnavailableError) return 'access_revoked';

        throw error;
    }

    const provenance = await tx
        .select()
        .from(jobEntries)
        .where(eq(jobEntries.jobId, job.id));

    if (!provenance.length) return 'stale_content';
    const current = await tx
        .select({
            id: cards.id,
            dictionaryId: cards.dictionaryId,
            lifecycle: cards.lifecycle,
            learningVersion: cards.learningVersion,
        })
        .from(cards)
        .where(
            inArray(
                cards.id,
                provenance.map((e) => e.entryId),
            ),
        );

    if (
        provenance.some(
            (e) =>
                !current.some(
                    (c) =>
                        c.id === e.entryId &&
                        c.dictionaryId === job.dictionaryId &&
                        c.lifecycle === 'active' &&
                        c.learningVersion === e.learningVersion,
                ),
        )
    )
        return 'stale_content';
    if (job.jobKind === 'sentence-check') {
        try {
            await readableExercise(
                tx,
                (job.inputPayload as SentenceCheckInput).exerciseId,
                job.dictionaryId,
                job.learnerId,
                true,
            );
        } catch (error) {
            if (error instanceof SentenceUnavailableError)
                return 'stale_content';

            throw error;
        }
    }

    return null;
}

export async function sentenceWorkerTerminal(
    tx: SentenceTransaction,
    job: SentenceJobRow,
    now: Date,
    failure: SentenceJobFailure | null,
    usage?: Usage,
) {
    await settleSentenceAttempt(
        tx,
        job,
        now,
        usage,
        failure || job.failureCategory === 'access_revoked'
            ? 'failure'
            : 'stopped',
    );

    await tx
        .update(jobs)
        .set({
            ...clearLease,
            executionState: failure ? 'failed' : 'cancelled',
            failureCategory:
                failure ??
                (job.failureCategory === 'access_revoked'
                    ? 'access_revoked'
                    : 'explicit_stop'),
            cancellationRequestedAt: failure
                ? job.cancellationRequestedAt
                : (job.cancellationRequestedAt ?? now),
            completedAt: now,
            updatedAt: now,
        })
        .where(eq(jobs.id, job.id));
}

export async function sentenceWorkerLocked(
    persistence: SentenceWorkerPersistenceContext,
    tx: SentenceTransaction,
    lease: SentenceLease,
    now: Date,
) {
    const [candidate] = await tx
        .select()
        .from(workerJobs)
        .where(eq(workerJobs.id, lease.jobId));

    if (!candidate) return null;
    const invalid = await sentenceWorkerValid(tx, candidate);
    await lockSentenceLearner(tx, candidate.learnerId);
    await lockSentenceWorkerRow(tx, lease.jobId);
    let [job] = await tx
        .select()
        .from(workerJobs)
        .where(eq(workerJobs.id, lease.jobId));

    if (job?.sourceKind === 'knowledge-vocabulary') {
        const authorized = await authorizePrivateSentenceLease(tx, job, lease);
        if (!authorized) return null;
        job = authorized;
    }

    if (!job || !leased(job, lease, now)) return null;

    return { job, invalid };
}
