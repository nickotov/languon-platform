import { describe, expect, it } from "vitest";

import {
  EmailAddress,
  InvalidEmailAddressError,
} from "../../../../../src/modules/users/domain/email-address";

describe("EmailAddress", () => {
  it("trims display whitespace and creates a case-insensitive canonical value", () => {
    const email = EmailAddress.create("  Learner.Name+Course@Example.COM  ");

    expect(email.value).toBe("Learner.Name+Course@Example.COM");
    expect(email.canonicalValue).toBe("learner.name+course@example.com");
  });

  it("preserves provider-significant dots and tags", () => {
    const dotted = EmailAddress.create("learner.name@example.com");
    const compact = EmailAddress.create("learnername@example.com");
    const tagged = EmailAddress.create("learner+course@example.com");

    expect(dotted.equals(compact)).toBe(false);
    expect(tagged.equals(dotted)).toBe(false);
  });

  it("compares addresses by canonical value", () => {
    const first = EmailAddress.create("Learner@Example.com");
    const second = EmailAddress.create("learner@example.COM");

    expect(first.equals(second)).toBe(true);
  });

  it.each([
    "",
    "   ",
    "learner",
    "@example.com",
    "learner@",
    "learner @example.com",
    "learner@example .com",
    "léarner@example.com",
  ])("rejects malformed input %j", (value) => {
    expect(() => EmailAddress.create(value)).toThrow(InvalidEmailAddressError);
  });
});
