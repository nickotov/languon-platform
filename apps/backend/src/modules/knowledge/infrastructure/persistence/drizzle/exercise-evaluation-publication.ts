import { sql } from 'drizzle-orm';
import {
    KnowledgeExerciseEvaluationResultSchema,
    WorkbookLearnerAttemptSchema,
    type KnowledgeExerciseEvaluationResult,
} from '@languon/contracts';
import { TextsAiError } from '../../../../texts/application/ports/texts-ai-provider';
import type {
    TextsJobRow,
    TextsTransaction,
} from '../../../../texts/infrastructure/persistence/drizzle/texts-job-support';

/** Called after successful settlement in the same fenced completion transaction. */
export async function publishKnowledgeExerciseEvaluation(
    tx: TextsTransaction,
    job: TextsJobRow,
    raw: KnowledgeExerciseEvaluationResult,
) {
    if (!job.workerId) throw new TextsAiError('access_revoked');
    const result = KnowledgeExerciseEvaluationResultSchema.parse(raw);
    const [row] = await tx.execute<{ attempt: unknown }>(sql`
        select languon_publish_knowledge_exercise_evaluation(
            ${job.id}::uuid, ${job.workerId}, ${job.fencingToken}::bigint,
            ${JSON.stringify(result)}::jsonb
        ) as attempt
    `);

    return WorkbookLearnerAttemptSchema.parse(row?.attempt);
}
