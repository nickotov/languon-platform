import Redis from "ioredis";

import { createPostgresClient, type PostgresClient } from "./postgres/client";

export interface DatabaseClientOptions {
  databaseUrl: string;
  redisUrl: string;
}

export interface DatabaseClients {
  close: () => Promise<void>;
  redis: Redis;
  sql: PostgresClient;
}

export function createDatabaseClients(
  options: DatabaseClientOptions,
): DatabaseClients {
  const sql = createPostgresClient({ databaseUrl: options.databaseUrl });
  const redis = new Redis(options.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });

  return {
    close: async () => {
      await Promise.all([sql.end(), redis.quit()]);
    },
    redis,
    sql,
  };
}

export {
  assertAppliedMigrationPrefix,
  grantDisposableMigrationPurpose,
  MigrationHistoryMismatchError,
  runPostgresMigrations,
  type ApplicationMigrationPurpose,
  type DisposableMigrationPurpose,
  type MigrationPurpose,
  type RunPostgresMigrationsOptions,
} from "./migrations/run-postgres-migrations";
export {
  createPostgresClient,
  type PostgresClient,
  type PostgresClientOptions,
} from "./postgres/client";
export {
  createDrizzleDatabase,
  type PostgresJsDatabase,
} from "./postgres/drizzle";
