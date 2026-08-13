import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import { createPostgresClient, runPostgresMigrations } from "@languon/database";
import { z } from "zod";

const localEnvironmentFile = new URL(
  "../../../../../.env.local",
  import.meta.url,
);

if (existsSync(localEnvironmentFile)) {
  loadEnvFile(localEnvironmentFile);
}

const MigrationEnvironmentSchema = z.object({
  APP_ENV: z.enum(["development", "test", "staging", "production"]),
  DATABASE_URL: z
    .url()
    .refine(
      (value) => ["postgres:", "postgresql:"].includes(new URL(value).protocol),
      "DATABASE_URL must use PostgreSQL.",
    ),
});

function resolveMigrationsFolder(): string {
  const sourceFolder = new URL("../../../drizzle", import.meta.url);
  const builtFolder = new URL("../../drizzle", import.meta.url);

  if (existsSync(builtFolder)) {
    return fileURLToPath(builtFolder);
  }

  if (existsSync(sourceFolder)) {
    return fileURLToPath(sourceFolder);
  }

  throw new Error("The checked-in Drizzle migration directory is unavailable.");
}

const environment = MigrationEnvironmentSchema.parse(process.env);
const client = createPostgresClient({
  databaseUrl: environment.DATABASE_URL,
  maxConnections: 1,
});

try {
  await runPostgresMigrations({
    client,
    migrationsFolder: resolveMigrationsFolder(),
    purpose: { kind: "application" },
  });
} finally {
  await client.end();
}
