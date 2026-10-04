import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../database/schema';
import type { TextAiExecutionSnapshot } from '../../modules/text-ai/application/text-ai-provider-catalog';
import { dictionaryGenerationProviderCircuitTable as circuits } from '../../modules/dictionaries/infrastructure/persistence/drizzle/schema';

type Transaction = Parameters<
    Parameters<PostgresJsDatabase<typeof databaseSchema>['transaction']>[0]
>[0];
export type TextAiCircuitFailureCategory =
    'provider_error' | 'provider_timeout';
export interface TextAiCircuitScope {
    execution: Pick<TextAiExecutionSnapshot, 'providerId' | 'modelId'>;
    format: string;
    now: Date;
}
export const TEXT_AI_PROVIDER_CIRCUIT_POLICY = {
    failureThreshold: 3,
    openMs: 60_000,
} as const;
export function textAiCircuitKey(
    execution: TextAiCircuitScope['execution'],
    format: string,
): string {
    return `${execution.providerId}/${execution.modelId}/${format}`;
}
export async function isTextAiCircuitOpen(
    tx: Transaction,
    input: TextAiCircuitScope,
): Promise<boolean> {
    const [row] = await tx
        .select({ openUntil: circuits.openUntil })
        .from(circuits)
        .where(eq(circuits.id, textAiCircuitKey(input.execution, input.format)))
        .limit(1);
    return Boolean(row?.openUntil && row.openUntil > input.now);
}
/** Called only after a fenced provider fault. Uses the established row-lock
 * sequence so concurrent failures increment exactly once apiece. */
export async function recordTextAiCircuitFailure(
    tx: Transaction,
    input: TextAiCircuitScope & { category: TextAiCircuitFailureCategory },
): Promise<void> {
    const id = textAiCircuitKey(input.execution, input.format);
    await tx
        .insert(circuits)
        .values({ id, consecutiveFailures: 0, updatedAt: input.now })
        .onConflictDoNothing();
    const [row] = await tx
        .select({
            consecutiveFailures: circuits.consecutiveFailures,
            openUntil: circuits.openUntil,
        })
        .from(circuits)
        .where(eq(circuits.id, id))
        .for('update');
    const failures = (row?.consecutiveFailures ?? 0) + 1;
    await tx
        .update(circuits)
        .set({
            consecutiveFailures: failures,
            openUntil:
                failures >= TEXT_AI_PROVIDER_CIRCUIT_POLICY.failureThreshold
                    ? new Date(
                          input.now.getTime() +
                              TEXT_AI_PROVIDER_CIRCUIT_POLICY.openMs,
                      )
                    : row?.openUntil,
            updatedAt: input.now,
        })
        .where(eq(circuits.id, id));
}
export async function recordTextAiCircuitSuccess(
    tx: Transaction,
    input: TextAiCircuitScope,
): Promise<void> {
    await tx
        .insert(circuits)
        .values({
            id: textAiCircuitKey(input.execution, input.format),
            consecutiveFailures: 0,
            openUntil: null,
            updatedAt: input.now,
        })
        .onConflictDoUpdate({
            target: circuits.id,
            set: {
                consecutiveFailures: 0,
                openUntil: null,
                updatedAt: input.now,
            },
        });
}
