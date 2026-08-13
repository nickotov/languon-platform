import { randomUUID } from "node:crypto";

import { and, count, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createDrizzleDatabase,
  type PostgresClient,
  type PostgresJsDatabase,
} from "@languon/database";

import { databaseSchema } from "../../../../../src/infrastructure/database/schema";
import { EmailAddress } from "../../../../../src/modules/users/domain/email-address";
import {
  UserEmailAlreadyExistsError,
  type UserRepository,
} from "../../../../../src/modules/users/domain/user.repository";
import { User } from "../../../../../src/modules/users/domain/user";
import { DrizzleUserRepository } from "../../../../../src/modules/users/infrastructure/persistence/drizzle/drizzle-user-repository";
import { DrizzleUsersUnitOfWork } from "../../../../../src/modules/users/infrastructure/persistence/drizzle/drizzle-users-unit-of-work";
import {
  userEmailsTable,
  usersTable,
} from "../../../../../src/modules/users/infrastructure/persistence/drizzle/schema";
import {
  createTestPostgresClient,
  isDatabaseIntegrationEnabled,
  migrateTestDatabase,
  resetTestDatabase,
} from "../../../support/test-database";

let client: PostgresClient;
let database: PostgresJsDatabase<typeof databaseSchema>;
let unitOfWork: DrizzleUsersUnitOfWork;
let reader: DrizzleUserRepository;
const now = new Date("2026-08-13T09:00:00.000Z");

function createIdentity(email: string) {
  return {
    emailId: randomUUID(),
    primaryEmail: EmailAddress.create(email),
    user: User.createPending({ id: randomUUID(), now }),
  };
}

describe.runIf(isDatabaseIntegrationEnabled())("DrizzleUserRepository", () => {
  beforeAll(async () => {
    client = createTestPostgresClient();
    database = createDrizzleDatabase(client, databaseSchema);
    unitOfWork = new DrizzleUsersUnitOfWork(database);
    reader = DrizzleUserRepository.readOnly(database);
    await resetTestDatabase(client);
    await migrateTestDatabase(client);
  });

  beforeEach(async () => {
    await database.delete(userEmailsTable);
    await database.delete(usersTable);
  });

  afterAll(async () => {
    await client.end();
  });

  it("commits a user and separate primary-email record and reads both lookup paths", async () => {
    const identity = createIdentity("Learner@Example.com");

    await unitOfWork.execute((users) => users.addWithPrimaryEmail(identity));

    await expect(reader.findById(identity.user.id)).resolves.toMatchObject({
      primaryEmail: {
        canonicalValue: "learner@example.com",
        value: "Learner@Example.com",
      },
      user: {
        id: identity.user.id,
        status: "pending",
      },
      verifiedAt: null,
    });
    await expect(
      reader.findByCanonicalEmail("learner@example.com"),
    ).resolves.toMatchObject({ user: { id: identity.user.id } });
  });

  it("rolls back both records when the application transaction fails", async () => {
    const identity = createIdentity("rollback@example.com");
    const failure = new Error("forced transaction failure");

    await expect(
      unitOfWork.execute(async (users) => {
        await users.addWithPrimaryEmail(identity);
        throw failure;
      }),
    ).rejects.toBe(failure);

    await expect(reader.findById(identity.user.id)).resolves.toBeNull();
  });

  it("does not expose compound identity writes on a root database reader", () => {
    expect("addWithPrimaryEmail" in reader).toBe(false);
    expect("transactional" in DrizzleUserRepository).toBe(false);
  });

  it("allows only one canonical identity under concurrent case-variant creation", async () => {
    const first = createIdentity("Concurrent@Example.com");
    const second = createIdentity("concurrent@example.COM");
    let readyCount = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const race = (identity: ReturnType<typeof createIdentity>) =>
      unitOfWork.execute(async (users: UserRepository) => {
        readyCount += 1;
        if (readyCount === 2) {
          release();
        }
        await gate;
        await users.addWithPrimaryEmail(identity);
      });

    const results = await Promise.allSettled([race(first), race(second)]);
    const identityCount = await database
      .select({ value: count() })
      .from(usersTable);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === "rejected")).toEqual([
      expect.objectContaining({
        reason: expect.any(UserEmailAlreadyExistsError),
      }),
    ]);
    expect(identityCount[0]?.value).toBe(1);
  });

  it("enforces canonical consistency, foreign keys, and one primary email", async () => {
    const identity = createIdentity("constraints@example.com");
    await unitOfWork.execute((users) => users.addWithPrimaryEmail(identity));

    await expect(
      database.insert(userEmailsTable).values({
        canonicalEmail: "different@example.com",
        email: "same@example.com",
        id: randomUUID(),
        userId: identity.user.id,
      }),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(
      database.insert(userEmailsTable).values({
        canonicalEmail: "orphan@example.com",
        email: "orphan@example.com",
        id: randomUUID(),
        userId: randomUUID(),
      }),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
    await expect(
      database.insert(userEmailsTable).values({
        canonicalEmail: "second@example.com",
        email: "second@example.com",
        id: randomUUID(),
        isPrimary: true,
        userId: identity.user.id,
      }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });

    const persisted = await database
      .select({ id: userEmailsTable.id })
      .from(userEmailsTable)
      .where(
        and(
          eq(userEmailsTable.userId, identity.user.id),
          eq(userEmailsTable.isPrimary, true),
        ),
      );
    expect(persisted).toHaveLength(1);
  });
});
