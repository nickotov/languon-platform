import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from '@languon/database';
import type { databaseSchema } from '../../../infrastructure/database/schema';

type Database = PostgresJsDatabase<typeof databaseSchema>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Current worker stores understand immutable tariff revisions; older binaries do not set this fence. */
export function modelPricingTransaction<T>(
    database: Database,
    operation: (transaction: Transaction) => Promise<T>,
) {
    return database.transaction(async (transaction) => {
        await transaction.execute(
            sql`select set_config('languon.model_pricing_revision', '1', true)`,
        );
        return operation(transaction);
    });
}
