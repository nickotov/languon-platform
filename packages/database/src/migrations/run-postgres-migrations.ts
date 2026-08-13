import { drizzle } from "drizzle-orm/postgres-js";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/postgres-js/migrator";

import type { PostgresClient } from "../postgres/client";

const disposableMigrationPurposeBrand = Symbol(
  "languon.disposableMigrationPurpose",
);

export interface ApplicationMigrationPurpose {
  kind: "application";
}

export interface DisposableMigrationPurpose {
  readonly [disposableMigrationPurposeBrand]: true;
  kind: "disposable";
}

export type MigrationPurpose =
  ApplicationMigrationPurpose | DisposableMigrationPurpose;

export interface RunPostgresMigrationsOptions {
  client: PostgresClient;
  migrationsFolder: string;
  purpose: MigrationPurpose;
}

export class MigrationHistoryMismatchError extends Error {
  public constructor(createdAt: number) {
    super(
      `Applied migration ${createdAt} does not match the checked-in history.`,
    );
    this.name = "MigrationHistoryMismatchError";
  }
}

interface MigrationHistoryEntry {
  createdAt: number;
  hash: string;
}

export function assertAppliedMigrationPrefix(
  appliedMigrations: readonly MigrationHistoryEntry[],
  expectedMigrations: readonly MigrationHistoryEntry[],
): void {
  for (const [index, applied] of appliedMigrations.entries()) {
    const expected = expectedMigrations[index];

    if (
      !expected ||
      expected.createdAt !== applied.createdAt ||
      expected.hash !== applied.hash
    ) {
      throw new MigrationHistoryMismatchError(applied.createdAt);
    }
  }
}

const advisoryLockNamespace = 1_814_072_415;
const advisoryLockIdentifier = 1_297_895_956;

export function grantDisposableMigrationPurpose(): DisposableMigrationPurpose {
  return {
    [disposableMigrationPurposeBrand]: true,
    kind: "disposable",
  };
}

function assertMigrationPurpose(purpose: MigrationPurpose): void {
  if (
    purpose.kind === "disposable" &&
    purpose[disposableMigrationPurposeBrand] !== true
  ) {
    throw new TypeError(
      "Disposable migrations require an explicit trusted capability.",
    );
  }
}

async function assertMigrationHistoryMatches(
  connection: PostgresClient,
  migrationsFolder: string,
): Promise<void> {
  const relation = await connection<{ name: string | null }[]>`
    select to_regclass('languon_migrations.history')::text as name
  `;

  if (!relation[0]?.name) {
    return;
  }

  const appliedMigrations = await connection<
    { created_at: string; hash: string }[]
  >`
    select created_at, hash
    from languon_migrations.history
    order by created_at
  `;
  const expectedMigrations = readMigrationFiles({ migrationsFolder }).map(
    (migration) => ({
      createdAt: migration.folderMillis,
      hash: migration.hash,
    }),
  );

  assertAppliedMigrationPrefix(
    appliedMigrations.map((migration) => ({
      createdAt: Number(migration.created_at),
      hash: migration.hash,
    })),
    expectedMigrations,
  );
}

export async function runPostgresMigrations(
  options: RunPostgresMigrationsOptions,
): Promise<void> {
  assertMigrationPurpose(options.purpose);

  const connection = await options.client.reserve();
  // postgres.js reserved connections intentionally omit pool-only properties.
  // Drizzle needs the parsers plus `begin`; the small transaction adapter keeps
  // every migration statement on this reserved session so the advisory lock
  // covers the complete migration.
  Object.assign(connection, {
    begin: async <T>(work: (transaction: typeof connection) => Promise<T>) => {
      await connection.unsafe("begin");
      try {
        const result = await work(connection);
        await connection.unsafe("commit");
        return result;
      } catch (error) {
        await connection.unsafe("rollback");
        throw error;
      }
    },
    options: options.client.options,
  });

  try {
    await connection`select pg_advisory_lock(${advisoryLockNamespace}, ${advisoryLockIdentifier})`;

    try {
      await assertMigrationHistoryMatches(connection, options.migrationsFolder);
      await migrate(drizzle(connection), {
        migrationsFolder: options.migrationsFolder,
        migrationsSchema: "languon_migrations",
        migrationsTable: "history",
      });
    } finally {
      await connection`select pg_advisory_unlock(${advisoryLockNamespace}, ${advisoryLockIdentifier})`;
    }
  } finally {
    connection.release();
  }
}
