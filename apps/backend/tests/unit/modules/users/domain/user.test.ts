import { describe, expect, it } from "vitest";

import {
  InvalidUserTransitionError,
  User,
} from "../../../../../src/modules/users/domain/user";

const userId = "0198a8dc-9aca-7b1d-a791-81a52953dcca";
const createdAt = new Date("2026-08-13T08:00:00.000Z");

describe("User", () => {
  it("creates a stable pending identity", () => {
    const user = User.createPending({ id: userId, now: createdAt });

    expect(user).toMatchObject({
      createdAt,
      id: userId,
      status: "pending",
      updatedAt: createdAt,
      version: 1,
    });
    expect(Object.keys(user)).not.toEqual(
      expect.arrayContaining([
        "password",
        "passwordHash",
        "passkeys",
        "refreshToken",
        "session",
      ]),
    );
  });

  it("activates a pending identity without changing its id or creation time", () => {
    const user = User.createPending({ id: userId, now: createdAt });
    const activatedAt = new Date("2026-08-13T08:05:00.000Z");

    const active = user.activate(activatedAt);

    expect(active).toMatchObject({
      createdAt,
      id: userId,
      status: "active",
      updatedAt: activatedAt,
      version: 2,
    });
  });

  it("does not mutate an already-active identity when activation repeats", () => {
    const active = User.createPending({ id: userId, now: createdAt }).activate(
      new Date("2026-08-13T08:05:00.000Z"),
    );

    expect(active.activate(new Date("2026-08-13T08:06:00.000Z"))).toBe(active);
  });

  it("does not allow a disabled identity to become active", () => {
    const disabled = User.restore({
      createdAt,
      id: userId,
      status: "disabled",
      updatedAt: createdAt,
      version: 2,
    });

    expect(() => disabled.activate(new Date())).toThrow(
      InvalidUserTransitionError,
    );
  });
});
