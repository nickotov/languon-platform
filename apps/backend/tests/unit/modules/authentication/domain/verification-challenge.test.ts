import { describe, expect, it } from "vitest";

import { VerificationChallenge } from "../../../../../src/modules/authentication/domain/verification-challenge";

const issuedAt = new Date("2026-08-13T10:00:00.000Z");
const expiresAt = new Date("2026-08-13T10:10:00.000Z");

function createChallenge(): VerificationChallenge {
  return VerificationChallenge.issue({
    codeDigest: "digest",
    expiresAt,
    id: "0198a941-7824-7de6-8200-e54baa45a926",
    issuedAt,
    purpose: "email_verification",
    userId: "0198a941-8ace-7115-aec6-d2b594aaee06",
  });
}

describe("VerificationChallenge", () => {
  it("allows a correct fifth attempt and consumes the challenge once", () => {
    let challenge = createChallenge();

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const result = challenge.verify({ matches: false, now: issuedAt });
      expect(result.outcome).toBe("incorrect");
      challenge = result.challenge;
    }

    const success = challenge.verify({ matches: true, now: issuedAt });
    expect(success.outcome).toBe("verified");
    expect(success.challenge.consumedAt).toEqual(issuedAt);
    expect(
      success.challenge.verify({ matches: true, now: issuedAt }).outcome,
    ).toBe("unavailable");
  });

  it("exhausts the challenge after the fifth incorrect attempt", () => {
    let challenge = createChallenge();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      challenge = challenge.verify({
        matches: false,
        now: issuedAt,
      }).challenge;
    }

    expect(challenge.attemptsUsed).toBe(5);
    expect(challenge.verify({ matches: true, now: issuedAt }).outcome).toBe(
      "unavailable",
    );
  });

  it("rejects an attempt at the exact expiry boundary without incrementing", () => {
    const challenge = createChallenge();
    const result = challenge.verify({ matches: true, now: expiresAt });

    expect(result.outcome).toBe("unavailable");
    expect(result.challenge).toBe(challenge);
  });

  it("invalidates a superseded challenge without affecting its purpose", () => {
    const invalidatedAt = new Date("2026-08-13T10:01:00.000Z");
    const invalidated = createChallenge().invalidate(invalidatedAt);

    expect(invalidated.invalidatedAt).toEqual(invalidatedAt);
    expect(invalidated.purpose).toBe("email_verification");
    expect(
      invalidated.verify({ matches: true, now: invalidatedAt }).outcome,
    ).toBe("unavailable");
  });
});
