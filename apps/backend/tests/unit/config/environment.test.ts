import { describe, expect, it } from "vitest";

import {
  insecureFixedCodeStagingAcknowledgement,
  loadEnvironment,
} from "../../../src/config/environment";

const jwtSecret = "jwt-secret-with-at-least-thirty-two-bytes-123456";
const codeSecret = "code-secret-with-at-least-thirty-two-bytes-654321";

function values(
  appEnvironment: "development" | "production" | "staging" | "test",
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return {
    APP_ENV: appEnvironment,
    AUTH_CODE_HMAC_SECRET: codeSecret,
    AUTH_JWT_SECRET: jwtSecret,
    ...(appEnvironment === "staging" || appEnvironment === "production"
      ? {
          AUTH_ALLOWED_ORIGINS: "https://app.languon.example",
          AUTH_WEBAUTHN_RP_ID: "app.languon.example",
          DATABASE_URL: "postgres://app:secret@db.internal:5432/languon",
          REDIS_URL: "rediss://cache.internal:6379",
        }
      : {}),
    ...overrides,
  };
}

describe("loadEnvironment authentication settings", () => {
  it.each([
    ["development", 2 * 24 * 60 * 60, true],
    ["test", 2 * 24 * 60 * 60, true],
    ["staging", 2 * 24 * 60 * 60, false],
    ["production", 15 * 60, false],
  ] as const)(
    "uses safe %s defaults",
    (appEnvironment, accessTokenTtl, fixedCodeEnabled) => {
      const environment = loadEnvironment(values(appEnvironment));

      expect(environment).toMatchObject({
        APP_ENV: appEnvironment,
        AUTH_ACCESS_TOKEN_TTL: accessTokenTtl,
        AUTH_EMAIL_DELIVERY_MODE: fixedCodeEnabled
          ? "development"
          : "unavailable",
        AUTH_FIXED_VERIFICATION_CODE_ENABLED: fixedCodeEnabled,
        AUTH_REFRESH_TOKEN_TTL: 14 * 24 * 60 * 60,
        AUTH_VERIFICATION_CODE_MODE: fixedCodeEnabled ? "fixed" : "unavailable",
        BACKEND_HOST: "127.0.0.1",
      });
    },
  );

  it("requires APP_ENV instead of inferring it from NODE_ENV", () => {
    expect(() =>
      loadEnvironment({
        AUTH_CODE_HMAC_SECRET: codeSecret,
        AUTH_JWT_SECRET: jwtSecret,
        NODE_ENV: "development",
      }),
    ).toThrow();
  });

  it("accepts bounded duration overrides and returns seconds", () => {
    const environment = loadEnvironment(
      values("production", {
        AUTH_ACCESS_TOKEN_TTL: "10m",
        AUTH_REFRESH_TOKEN_TTL: "7d",
      }),
    );

    expect(environment.AUTH_ACCESS_TOKEN_TTL).toBe(10 * 60);
    expect(environment.AUTH_REFRESH_TOKEN_TTL).toBe(7 * 24 * 60 * 60);
  });

  it("normalizes blank optional Langfuse credentials and preserves configured values", () => {
    const blankEnvironment = loadEnvironment(
      values("development", {
        LANGFUSE_PUBLIC_KEY: "",
        LANGFUSE_SECRET_KEY: "",
      }),
    );
    const configuredEnvironment = loadEnvironment(
      values("development", {
        LANGFUSE_PUBLIC_KEY: "local-public-key",
        LANGFUSE_SECRET_KEY: "local-secret-key",
      }),
    );

    expect(blankEnvironment.LANGFUSE_PUBLIC_KEY).toBeUndefined();
    expect(blankEnvironment.LANGFUSE_SECRET_KEY).toBeUndefined();
    expect(configuredEnvironment.LANGFUSE_PUBLIC_KEY).toBe("local-public-key");
    expect(configuredEnvironment.LANGFUSE_SECRET_KEY).toBe("local-secret-key");
  });

  it("requires an explicit supported backend bind host", () => {
    expect(
      loadEnvironment(values("development", { BACKEND_HOST: "0.0.0.0" }))
        .BACKEND_HOST,
    ).toBe("0.0.0.0");
    expect(() =>
      loadEnvironment(values("development", { BACKEND_HOST: "192.0.2.10" })),
    ).toThrow();
  });

  it.each([
    ["AUTH_ACCESS_TOKEN_TTL", "900"],
    ["AUTH_ACCESS_TOKEN_TTL", "16m"],
    ["AUTH_REFRESH_TOKEN_TTL", "15d"],
    ["AUTH_REFRESH_TOKEN_TTL", "0d"],
  ])("rejects unsafe or malformed %s=%s", (name, value) => {
    expect(() =>
      loadEnvironment(values("production", { [name]: value })),
    ).toThrow();
  });

  it("rejects a refresh lifetime that is not longer than access", () => {
    expect(() =>
      loadEnvironment(
        values("development", {
          AUTH_ACCESS_TOKEN_TTL: "2h",
          AUTH_REFRESH_TOKEN_TTL: "1h",
        }),
      ),
    ).toThrow();
  });

  it("requires separate secrets containing at least 32 UTF-8 bytes", () => {
    expect(() =>
      loadEnvironment(
        values("development", {
          AUTH_CODE_HMAC_SECRET: jwtSecret,
        }),
      ),
    ).toThrow();
    expect(() =>
      loadEnvironment(
        values("development", {
          AUTH_CODE_HMAC_SECRET: "short",
        }),
      ),
    ).toThrow();
  });

  it("enables staging fixed code only with the exact unsafe acknowledgement", () => {
    expect(() =>
      loadEnvironment(
        values("staging", { AUTH_ALLOW_INSECURE_FIXED_CODE: "true" }),
      ),
    ).toThrow();

    const environment = loadEnvironment(
      values("staging", {
        AUTH_ALLOW_INSECURE_FIXED_CODE: insecureFixedCodeStagingAcknowledgement,
      }),
    );

    expect(environment.AUTH_FIXED_VERIFICATION_CODE_ENABLED).toBe(true);
    expect(environment.AUTH_EMAIL_DELIVERY_MODE).toBe("development");
  });

  it("rejects every fixed-code setting and obvious local secrets in production", () => {
    expect(() =>
      loadEnvironment(
        values("production", {
          AUTH_ALLOW_INSECURE_FIXED_CODE:
            insecureFixedCodeStagingAcknowledgement,
        }),
      ),
    ).toThrow();
    expect(() =>
      loadEnvironment(
        values("production", {
          AUTH_JWT_SECRET: "development-only-jwt-secret-change-me-123456789",
        }),
      ),
    ).toThrow();
  });

  it("rejects Argon2 parameters below the approved security floor", () => {
    expect(() =>
      loadEnvironment(
        values("development", { AUTH_ARGON2_MEMORY_COST_KIB: "19455" }),
      ),
    ).toThrow();
    expect(() =>
      loadEnvironment(values("development", { AUTH_ARGON2_TIME_COST: "1" })),
    ).toThrow();
  });

  it("provides localhost WebAuthn and origin defaults only outside deployed environments", () => {
    expect(loadEnvironment(values("development"))).toMatchObject({
      AUTH_ALLOWED_ORIGINS: ["http://localhost:3333"],
      AUTH_TRUST_PROXY: false,
      AUTH_TRUSTED_PROXY_CIDRS: [],
      AUTH_WEBAUTHN_RP_ID: "localhost",
      AUTH_WEBAUTHN_RP_NAME: "Languon",
    });

    expect(() =>
      loadEnvironment({
        APP_ENV: "staging",
        AUTH_CODE_HMAC_SECRET: codeSecret,
        AUTH_JWT_SECRET: jwtSecret,
      }),
    ).toThrow();
  });

  it("requires validated trusted proxy CIDRs when forwarding is enabled", () => {
    expect(() =>
      loadEnvironment(values("development", { AUTH_TRUST_PROXY: "true" })),
    ).toThrow();
    expect(() =>
      loadEnvironment(
        values("development", {
          AUTH_TRUST_PROXY: "true",
          AUTH_TRUSTED_PROXY_CIDRS: "not-an-address",
        }),
      ),
    ).toThrow();

    expect(
      loadEnvironment(
        values("development", {
          AUTH_TRUST_PROXY: "true",
          AUTH_TRUSTED_PROXY_CIDRS: "10.0.0.0/24,2001:db8:1234::/64",
        }),
      ),
    ).toMatchObject({
      AUTH_TRUST_PROXY: true,
      AUTH_TRUSTED_PROXY_CIDRS: ["10.0.0.0/24", "2001:db8:1234::/64"],
    });
  });

  it("requires exact HTTPS origins, matching RP ID, and explicit data services in staging and production", () => {
    const deployed = loadEnvironment(
      values("production", {
        AUTH_ALLOWED_ORIGINS: "https://app.languon.example",
        AUTH_CODE_HMAC_SECRET: "prod-code-secret-7wQdZK6F8pN2XvRt4mHs9LcB",
        AUTH_JWT_SECRET: "prod-jwt-secret-3JpQ8vWz7cNk2sMx5tRy6HdF",
        AUTH_WEBAUTHN_RP_ID: "app.languon.example",
        DATABASE_URL: "postgres://app:secret@db.internal:5432/languon",
        REDIS_URL: "rediss://cache.internal:6379",
      }),
    );

    expect(deployed.AUTH_ALLOWED_ORIGINS).toEqual([
      "https://app.languon.example",
    ]);
    expect(() =>
      loadEnvironment(
        values("production", {
          AUTH_ALLOWED_ORIGINS: "http://app.languon.example",
          AUTH_CODE_HMAC_SECRET: "prod-code-secret-7wQdZK6F8pN2XvRt4mHs9LcB",
          AUTH_JWT_SECRET: "prod-jwt-secret-3JpQ8vWz7cNk2sMx5tRy6HdF",
          AUTH_WEBAUTHN_RP_ID: "different.example",
        }),
      ),
    ).toThrow();
  });
});
