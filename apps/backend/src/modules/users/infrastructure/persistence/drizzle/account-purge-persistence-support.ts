import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';

export type AccountPurgeDatabase = PostgresJsDatabase<typeof databaseSchema>;

export const leaseMs = 5 * 60_000;

export const retryMs = 5 * 60_000;

export interface AccountPurgeContext {
    readonly database: AccountPurgeDatabase;
}
