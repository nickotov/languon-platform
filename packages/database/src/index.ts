import Redis from "ioredis";
import postgres, { type Sql } from "postgres";

export interface DatabaseClientOptions {
  databaseUrl: string;
  redisUrl: string;
}

export interface DatabaseClients {
  close: () => Promise<void>;
  redis: Redis;
  sql: Sql;
}

export function createDatabaseClients(
  options: DatabaseClientOptions,
): DatabaseClients {
  const sql = postgres(options.databaseUrl, {
    max: 10,
    onnotice: () => undefined,
  });
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
