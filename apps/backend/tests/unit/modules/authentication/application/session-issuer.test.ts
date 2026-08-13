import { describe, expect, it } from "vitest";

import type { AuthenticationAccount } from "../../../../../src/modules/authentication/application/ports/auth-store";
import { SessionIssuer } from "../../../../../src/modules/authentication/application/session-issuer";
import type { AccessTokenClaims } from "../../../../../src/modules/authentication/domain/access-token-claims";

const initialTime = new Date("2026-08-13T12:00:00.000Z");
const dayMs = 24 * 60 * 60 * 1_000;

describe("SessionIssuer", () => {
  it("issues minimal access claims and a 14-day absolute refresh session", async () => {
    let currentTime = initialTime;
    let sequence = 0;
    let signedClaims: AccessTokenClaims | undefined;
    const issuer = new SessionIssuer(
      { now: () => currentTime },
      { generate: () => `id-${++sequence}` },
      {
        digest: (value) => `digest:${value}`,
        issue: () => ({ digest: "digest:opaque", value: "opaque" }),
      },
      {
        sign: async (claims) => {
          signedClaims = claims;
          return "header.payload.signature";
        },
        verify: async () => {
          throw new Error("unused");
        },
      },
      {
        accessTokenAudience: "languon-web",
        accessTokenIssuer: "languon",
        accessTokenTtlMs: 15 * 60 * 1_000,
        refreshTokenTtlMs: 14 * dayMs,
      },
    );

    const prepared = await issuer.prepareInitial({
      method: "password",
      userId: "user-1",
    });

    expect(signedClaims?.toJwtPayload()).toEqual({
      aud: "languon-web",
      exp: Math.floor((initialTime.getTime() + 15 * 60 * 1_000) / 1_000),
      iat: Math.floor(initialTime.getTime() / 1_000),
      iss: "languon",
      jti: "id-3",
      sid: "id-2",
      sub: "user-1",
    });
    expect(prepared.storedSession.absoluteExpiresAt).toEqual(
      new Date(initialTime.getTime() + 14 * dayMs),
    );
    expect(prepared.refreshCredential).toBe("opaque");

    currentTime = new Date(initialTime.getTime() + 10 * 60 * 1_000);
    const account: AuthenticationAccount = {
      createdAt: initialTime,
      email: "user@example.com",
      emailId: "email-1",
      emailVerifiedAt: initialTime,
      passwordCredential: null,
      status: "active",
      userId: "user-1",
    };
    expect(
      issuer.toSuccess(prepared, account).session.recentAuthenticationExpiresAt,
    ).toBeNull();
  });

  it("never extends the predecessor's absolute expiry during rotation", async () => {
    let currentTime = initialTime;
    let sequence = 0;
    const issuer = new SessionIssuer(
      { now: () => currentTime },
      { generate: () => `id-${++sequence}` },
      {
        digest: (value) => value,
        issue: () => ({ digest: "digest", value: "opaque" }),
      },
      {
        sign: async () => "header.payload.signature",
        verify: async () => {
          throw new Error("unused");
        },
      },
      {
        accessTokenAudience: "web",
        accessTokenIssuer: "languon",
        accessTokenTtlMs: 2 * dayMs,
        refreshTokenTtlMs: 14 * dayMs,
      },
    );
    const initial = await issuer.prepareInitial({
      method: "password",
      userId: "user-1",
    });
    currentTime = new Date(initialTime.getTime() + 14 * dayMs - 60_000);

    const successor = await issuer.prepareSuccessor(initial.storedSession);

    expect(successor.storedSession.absoluteExpiresAt).toEqual(
      initial.storedSession.absoluteExpiresAt,
    );
    expect(successor.accessTokenExpiresAt).toEqual(
      initial.storedSession.absoluteExpiresAt,
    );
  });
});
