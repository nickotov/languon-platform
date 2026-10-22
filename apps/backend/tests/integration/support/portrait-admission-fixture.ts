import type { PostgresJsDatabase } from '@languon/database';
import type { databaseSchema } from '../../../src/infrastructure/database/schema';
import { dictionaryAiWorkerObservationsTable } from '../../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { portraitInterviewExecutionObservationId } from '../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness';
import { seedDictionaryAccountingFixture } from '../../support/dictionary-accounting-fixture';
/** Synthetic canonical model/rates and the current portrait worker execution revisions. */
export async function seedPortraitAdmissionFixture(
    database: PostgresJsDatabase<typeof databaseSchema>,
    at: Date,
) {
    await seedDictionaryAccountingFixture(database, at);
    await database
        .insert(dictionaryAiWorkerObservationsTable)
        .values({
            id: portraitInterviewExecutionObservationId(
                'portrait-accounting-fixture',
                'deepseek',
                'deepseek-flash',
            ),
            workerId: 'portrait-accounting-fixture',
            providerId: 'deepseek',
            modelId: 'deepseek-flash',
            adapterRevision: 'openai-compatible:v1',
            checkedAt: at,
            expiresAt: new Date(at.getTime() + 60000),
            status: 'available',
            message: 'Synthetic reviewed portrait accounting worker',
            textAiSelectionRevision: 1,
            textAiCapacityRevision: 1,
            textsCapacityRevision: 1,
            conversationCapacityRevision: 1,
            conversationExecutionRevision: 1,
            creditSettlementRevision: 1,
            textAiSupportedFormats: [
                'portrait-interview:v1',
                'conversation:v1',
            ],
        })
        .onConflictDoUpdate({
            target: dictionaryAiWorkerObservationsTable.id,
            set: { checkedAt: at, expiresAt: new Date(at.getTime() + 60000) },
        });
}
