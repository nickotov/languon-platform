import { and, eq, gt, sql } from 'drizzle-orm';
import { dictionaryAiWorkerObservationsTable as observations } from '../../text-ai/infrastructure/persistence/drizzle/configuration-schema';
import type { KnowledgeDatabase } from './persistence/drizzle/knowledge-transaction';
export const knowledgeTranscriptionWorkerFormat = 'knowledge-transcription:v1';
/** Executor capability observation only; no paid provider availability claim. */
export async function publishKnowledgeTranscriptionWorkerObservation(
    database: Pick<KnowledgeDatabase, 'insert'>,
    workerId: string,
    enabled: boolean,
) {
    const now = new Date();
    const row = {
        id: `${workerId}:knowledge-transcription:v1`,
        workerId,
        providerId: 'openai',
        modelId: 'gpt-transcribe',
        adapterRevision: knowledgeTranscriptionWorkerFormat,
        status: enabled ? 'available' : 'unavailable',
        message: enabled
            ? 'Typed transcription executor registered; admission and configuration remain required.'
            : 'Typed transcription execution is unavailable in this worker.',
        checkedAt: now,
        expiresAt: new Date(now.getTime() + 180_000),
        textAiSupportedFormats: enabled
            ? [knowledgeTranscriptionWorkerFormat]
            : [],
    };
    await database
        .insert(observations)
        .values(row)
        .onConflictDoUpdate({ target: observations.id, set: row });
}
export async function knowledgeTranscriptionExecutionReady(
    database: KnowledgeDatabase,
) {
    const [row] = await database
        .select({ id: observations.id })
        .from(observations)
        .where(
            and(
                eq(observations.providerId, 'openai'),
                eq(observations.modelId, 'gpt-transcribe'),
                eq(
                    observations.adapterRevision,
                    knowledgeTranscriptionWorkerFormat,
                ),
                eq(observations.status, 'available'),
                gt(observations.expiresAt, new Date()),
                sql`${observations.textAiSupportedFormats} @> ${JSON.stringify([knowledgeTranscriptionWorkerFormat])}::jsonb`,
            ),
        )
        .limit(1);
    return !!row;
}
