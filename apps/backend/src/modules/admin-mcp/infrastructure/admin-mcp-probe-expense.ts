import { and, eq } from 'drizzle-orm';
import { aiProviderExpenseRecordsTable } from '../../ai-credits/infrastructure/persistence/drizzle/accounting-schema';
import type { AdminMcpDatabase } from './persistence/drizzle/admin-mcp-persistence';

/** Unique authoritative attempt-reference lookup; never copy request content into audit. */
export async function probeExpenseId(
    database: AdminMcpDatabase,
    probeId: string,
): Promise<string | null> {
    const [expense] = await database
        .select({ id: aiProviderExpenseRecordsTable.id })
        .from(aiProviderExpenseRecordsTable)
        .where(
            and(
                eq(
                    aiProviderExpenseRecordsTable.attemptReference,
                    `admin-probe:${probeId}`,
                ),
                eq(aiProviderExpenseRecordsTable.sourceKind, 'admin-probe'),
            ),
        )
        .limit(1);
    return expense?.id ?? null;
}
