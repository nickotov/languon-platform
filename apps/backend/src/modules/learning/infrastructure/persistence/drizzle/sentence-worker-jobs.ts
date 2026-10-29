import { getTableColumns, sql, type SQL } from 'drizzle-orm';
import { pgView } from 'drizzle-orm/pg-core';
import { sentenceAiJobsTable } from './sentence-schema';
import type {
    SentenceJobRow,
    SentenceTransaction,
} from './sentence-persistence-support';
import type { SentenceLease } from '../../../application/ports/sentence-worker-store';

/** SQL view is explicitly created by the private-worker migration; not an app writer. */
const columns = getTableColumns(sentenceAiJobsTable);
export const sentenceWorkerJobs = pgView('sentence_worker_jobs').as((qb) =>
    qb
        .select({
            id: columns.id,
            learnerId: columns.learnerId,
            dictionaryId: columns.dictionaryId,
            sourceKind: columns.sourceKind,
            sourceNoteId: sql<
                SentenceJobRow['sourceNoteId']
            >`case when source_kind='dictionary' then source_note_id else null::uuid end`.as(
                'source_note_id',
            ),
            sourceExerciseId: sql<
                SentenceJobRow['sourceExerciseId']
            >`case when source_kind='dictionary' then source_exercise_id else null::uuid end`.as(
                'source_exercise_id',
            ),
            knowledgeSource: sql<
                SentenceJobRow['knowledgeSource']
            >`case when source_kind='dictionary' then knowledge_source else null::jsonb end`.as(
                'knowledge_source',
            ),
            resultKnowledgeExerciseId: sql<
                SentenceJobRow['resultKnowledgeExerciseId']
            >`case when source_kind='dictionary' then result_knowledge_exercise_id else null::uuid end`.as(
                'result_knowledge_exercise_id',
            ),
            resultKnowledgeAttemptId: sql<
                SentenceJobRow['resultKnowledgeAttemptId']
            >`case when source_kind='dictionary' then result_knowledge_attempt_id else null::uuid end`.as(
                'result_knowledge_attempt_id',
            ),
            jobKind: columns.jobKind,
            format: columns.format,
            direction: columns.direction,
            authority: sql<
                SentenceJobRow['authority']
            >`case when source_kind='dictionary' then authority else '{"kind":"owner"}'::jsonb end`.as(
                'authority',
            ),
            operationId: sql<
                SentenceJobRow['operationId']
            >`case when source_kind='dictionary' then operation_id else null::uuid end`.as(
                'operation_id',
            ),
            sessionId: sql<
                SentenceJobRow['sessionId']
            >`case when source_kind='dictionary' then session_id else null::uuid end`.as(
                'session_id',
            ),
            requestFingerprint: sql<
                SentenceJobRow['requestFingerprint']
            >`case when source_kind='dictionary' then request_fingerprint else null::text end`.as(
                'request_fingerprint',
            ),
            referenceRevealed:
                sql<boolean>`case when source_kind='dictionary' then reference_revealed else false end`.as(
                    'reference_revealed',
                ),
            inputPayload: sql<
                SentenceJobRow['inputPayload']
            >`case when source_kind='dictionary' then input_payload else null::jsonb end`.as(
                'input_payload',
            ),
            executionState: columns.executionState,
            failureCategory: columns.failureCategory,
            resultExerciseId: columns.resultExerciseId,
            resultAttemptId: columns.resultAttemptId,
            selectedExecutionSnapshot: columns.selectedExecutionSnapshot,
            selectedExecutionVersion: columns.selectedExecutionVersion,
            executionRevisionId: columns.executionRevisionId,
            attemptCount: columns.attemptCount,
            maxAttempts: columns.maxAttempts,
            fencingToken: columns.fencingToken,
            workerId: columns.workerId,
            leaseDeadline: columns.leaseDeadline,
            heartbeatAt: columns.heartbeatAt,
            cancellationRequestedAt: columns.cancellationRequestedAt,
            nextAttemptAt: columns.nextAttemptAt,
            completedAt: columns.completedAt,
            createdAt: columns.createdAt,
            updatedAt: columns.updatedAt,
            aiCreditAccounted: columns.aiCreditAccounted,
            aiCreditReservationId: columns.aiCreditReservationId,
            aiCreditProviderDispatchedAt: columns.aiCreditProviderDispatchedAt,
            aiCreditPolicyMode: columns.aiCreditPolicyMode,
            aiCreditPricingRevision: columns.aiCreditPricingRevision,
            aiCreditMaxCreditsPerAttempt: columns.aiCreditMaxCreditsPerAttempt,
            aiCreditInputCreditsPerMillionTokens:
                columns.aiCreditInputCreditsPerMillionTokens,
            aiCreditOutputCreditsPerMillionTokens:
                columns.aiCreditOutputCreditsPerMillionTokens,
            providerInputCostMicrosPerMillionTokens:
                columns.providerInputCostMicrosPerMillionTokens,
            providerOutputCostMicrosPerMillionTokens:
                columns.providerOutputCostMicrosPerMillionTokens,
            providerMaxCostMicrosPerAttempt:
                columns.providerMaxCostMicrosPerAttempt,
            providerMaxInputTokensPerAttempt:
                columns.providerMaxInputTokensPerAttempt,
            providerMaxOutputTokensPerAttempt:
                columns.providerMaxOutputTokensPerAttempt,
            providerReservationState: columns.providerReservationState,
            providerReservedAttempts: columns.providerReservedAttempts,
            providerReservedCostMicros: columns.providerReservedCostMicros,
            providerReservedInputTokens: columns.providerReservedInputTokens,
            providerReservedOutputTokens: columns.providerReservedOutputTokens,
            providerReservationSettledAt: columns.providerReservationSettledAt,
            providerActualCostMicros: columns.providerActualCostMicros,
            providerActualInputTokens: columns.providerActualInputTokens,
            providerActualOutputTokens: columns.providerActualOutputTokens,
        })
        .from(sentenceAiJobsTable)
        .where(
            sql`source_kind='dictionary' or execution_state in ('queued','running')`,
        ),
);

/** Driver errors include bound SQL parameters. Never propagate the secret lease
 * or private provider input into worker logs, telemetry, or application errors. */
export async function privateSentenceQuery(
    tx: SentenceTransaction,
    query: SQL,
) {
    try {
        return await tx.execute(query);
    } catch {
        throw new Error('Private sentence worker authority failed.');
    }
}

export async function claimPrivateSentenceInput(
    tx: SentenceTransaction,
    job: SentenceJobRow,
    workerId: string,
    leaseMs: number,
) {
    const [row] = await privateSentenceQuery(
        tx,
        sql`select public.languon_claim_private_sentence_job(${job.id}::uuid,${workerId},${leaseMs}::integer) as value`,
    );
    const value = row?.value as {
        inputPayload: SentenceJobRow['inputPayload'];
        knowledgeSource: SentenceJobRow['knowledgeSource'];
        sourceExerciseId: SentenceJobRow['sourceExerciseId'];
        capability: string;
    } | null;

    if (!value) return null;

    return { ...job, ...value };
}

export async function authorizePrivateSentenceLease(
    tx: SentenceTransaction,
    job: SentenceJobRow,
    lease: SentenceLease,
) {
    if (!lease.capability) return null;
    const [row] = await privateSentenceQuery(
        tx,
        sql`select public.languon_read_private_sentence_job(${job.id}::uuid,${lease.workerId},${lease.fencingToken}::bigint,${lease.capability}) as value`,
    );
    const value = row?.value as {
        inputPayload: SentenceJobRow['inputPayload'];
        knowledgeSource: SentenceJobRow['knowledgeSource'];
        sourceExerciseId: SentenceJobRow['sourceExerciseId'];
    } | null;

    return value ? { ...job, ...value } : null;
}

export async function authorizePrivateSentenceRecovery(
    tx: SentenceTransaction,
    job: SentenceJobRow,
) {
    const [row] = await privateSentenceQuery(
        tx,
        sql`select public.languon_recover_private_sentence_job(${job.id}::uuid) as available`,
    );

    return row?.available === true;
}

/** Lock the base identity only: SELECT FOR UPDATE on a view would require a
 * writable projection. Private columns remain inaccessible to this statement. */
export async function lockSentenceWorkerRow(
    tx: SentenceTransaction,
    id: string,
) {
    await tx.execute(
        sql`select id from public.sentence_ai_jobs where id=${id}::uuid for update`,
    );
}
