import { describe, expect, it } from "vitest";

import {
  assertAppliedMigrationPrefix,
  grantDisposableMigrationPurpose,
  MigrationHistoryMismatchError,
  runPostgresMigrations,
  type PostgresClient,
} from "../src";

describe("migration purpose", () => {
  it("grants an explicit disposable migration capability", () => {
    expect(grantDisposableMigrationPurpose()).toMatchObject({
      kind: "disposable",
    });
  });

  it("rejects a structurally forged disposable purpose before connecting", async () => {
    await expect(
      runPostgresMigrations({
        client: {} as PostgresClient,
        migrationsFolder: "unused",
        purpose: { kind: "disposable" } as ReturnType<
          typeof grantDisposableMigrationPurpose
        >,
      }),
    ).rejects.toThrow(
      "Disposable migrations require an explicit trusted capability.",
    );
  });

  it("accepts only an exact ordered prefix of the checked-in history", () => {
    const expected = [
      { createdAt: 1, hash: "first" },
      { createdAt: 2, hash: "second" },
      { createdAt: 3, hash: "third" },
    ];

    expect(() =>
      assertAppliedMigrationPrefix(expected.slice(0, 2), expected),
    ).not.toThrow();
    expect(() =>
      assertAppliedMigrationPrefix([expected[0]!, expected[2]!], expected),
    ).toThrow(MigrationHistoryMismatchError);
    expect(() =>
      assertAppliedMigrationPrefix([expected[0]!, expected[0]!], expected),
    ).toThrow(MigrationHistoryMismatchError);
  });
});
