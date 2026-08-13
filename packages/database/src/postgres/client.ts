import postgres, { type Options, type Sql } from "postgres";

export interface PostgresClientOptions {
  connectTimeoutSeconds?: number;
  databaseUrl: string;
  idleTimeoutSeconds?: number;
  maxConnections?: number;
}

export type PostgresClient = Sql;

export function createPostgresClient(
  options: PostgresClientOptions,
): PostgresClient {
  const postgresOptions: Options<Record<string, never>> = {
    connect_timeout: options.connectTimeoutSeconds ?? 10,
    idle_timeout: options.idleTimeoutSeconds ?? 20,
    max: options.maxConnections ?? 10,
    onnotice: () => undefined,
  };

  return postgres(options.databaseUrl, postgresOptions);
}
