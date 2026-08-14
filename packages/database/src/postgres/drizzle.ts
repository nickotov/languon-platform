import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { PostgresClient } from './client';

export function createDrizzleDatabase<TSchema extends Record<string, unknown>>(
    client: PostgresClient,
    schema: TSchema,
): PostgresJsDatabase<TSchema> {
    return drizzle(client, { schema });
}

export type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
