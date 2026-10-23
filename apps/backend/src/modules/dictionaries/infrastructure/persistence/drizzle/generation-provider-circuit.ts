import { dictionaryAiConfigurationRevisionsTable } from '../../../../text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { eq, sql } from 'drizzle-orm';
import type { TextAiExecutionSnapshot as DictionaryAiExecutionSnapshot } from '../../../../text-ai/application/text-ai-provider-catalog';
import {
    dictionaryGenerationJobsTable,
    dictionaryGenerationProviderCircuitTable,
} from './schema';
import type { Transaction } from './generation-context';
import { providerOperationalBudget } from './generation-context';

export function providerCircuitKey(
    format: string,
    snapshot: DictionaryAiExecutionSnapshot | null,
): string {
    return snapshot
        ? `${snapshot.providerId}/${snapshot.modelId}/${format}`
        : format;
}

export async function jobProviderCircuitKey(
    tx: Transaction,
    job: typeof dictionaryGenerationJobsTable.$inferSelect,
): Promise<string> {
    if (job.selectedExecutionSnapshot)
        return providerCircuitKey(job.format, job.selectedExecutionSnapshot);
    if (!job.executionRevisionId) return job.format;
    const [revision] = await tx
        .select({
            snapshot: dictionaryAiConfigurationRevisionsTable.catalogSnapshot,
        })
        .from(dictionaryAiConfigurationRevisionsTable)
        .where(
            eq(
                dictionaryAiConfigurationRevisionsTable.id,
                job.executionRevisionId,
            ),
        )
        .limit(1);

    if (!revision)
        throw new Error('Pinned text AI execution revision is unavailable.');

    return providerCircuitKey(job.format, revision.snapshot);
}

export function providerCircuitAvailableCondition(now: Date) {
    // Keep format-only historical circuits for unmanaged jobs. A known immutable
    // provider/model uses its own scope, including Auto and explicit selections.
    const key = sql`case when ${dictionaryGenerationJobsTable.selectedExecutionSnapshot} is null and ${dictionaryGenerationJobsTable.executionRevisionId} is null then ${dictionaryGenerationJobsTable.format} else
            coalesce(${dictionaryGenerationJobsTable.selectedExecutionSnapshot}->>'providerId', (select ${dictionaryAiConfigurationRevisionsTable.catalogSnapshot}->>'providerId' from ${dictionaryAiConfigurationRevisionsTable} where ${dictionaryAiConfigurationRevisionsTable.id} = ${dictionaryGenerationJobsTable.executionRevisionId})) || '/' ||
            coalesce(${dictionaryGenerationJobsTable.selectedExecutionSnapshot}->>'modelId', (select ${dictionaryAiConfigurationRevisionsTable.catalogSnapshot}->>'modelId' from ${dictionaryAiConfigurationRevisionsTable} where ${dictionaryAiConfigurationRevisionsTable.id} = ${dictionaryGenerationJobsTable.executionRevisionId})) || '/' || ${dictionaryGenerationJobsTable.format} end`;

    return sql`not exists (select 1 from ${dictionaryGenerationProviderCircuitTable} where ${dictionaryGenerationProviderCircuitTable.id} = ${key} and ${dictionaryGenerationProviderCircuitTable.openUntil} > ${now.toISOString()}::timestamptz)`;
}

export async function recordProviderFailure(
    tx: Transaction,
    job: typeof dictionaryGenerationJobsTable.$inferSelect,
    now: Date,
) {
    const key = await jobProviderCircuitKey(tx, job);
    await tx
        .insert(dictionaryGenerationProviderCircuitTable)
        .values({
            consecutiveFailures: 0,
            id: key,
            updatedAt: now,
        })
        .onConflictDoNothing();

    const [circuit] = await tx
        .select()
        .from(dictionaryGenerationProviderCircuitTable)
        .where(eq(dictionaryGenerationProviderCircuitTable.id, key))
        .for('update');
    const consecutiveFailures = (circuit?.consecutiveFailures ?? 0) + 1;
    await tx
        .update(dictionaryGenerationProviderCircuitTable)
        .set({
            consecutiveFailures,
            openUntil:
                consecutiveFailures >=
                providerOperationalBudget.circuitFailureThreshold
                    ? new Date(
                          now.getTime() +
                              providerOperationalBudget.circuitOpenMs,
                      )
                    : circuit?.openUntil,
            updatedAt: now,
        })
        .where(eq(dictionaryGenerationProviderCircuitTable.id, key));
}

export async function recordProviderSuccess(
    tx: Transaction,
    job: typeof dictionaryGenerationJobsTable.$inferSelect,
    now: Date,
) {
    const key = await jobProviderCircuitKey(tx, job);
    await tx
        .insert(dictionaryGenerationProviderCircuitTable)
        .values({
            consecutiveFailures: 0,
            id: key,
            openUntil: null,
            updatedAt: now,
        })
        .onConflictDoUpdate({
            set: {
                consecutiveFailures: 0,
                openUntil: null,
                updatedAt: now,
            },
            target: dictionaryGenerationProviderCircuitTable.id,
        });
}
