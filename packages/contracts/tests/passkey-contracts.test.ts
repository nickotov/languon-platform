import { describe, expect, it } from "vitest";

import {
  PasskeyAuthenticationOptionsResponseSchema,
  PasskeyAuthenticationVerifyRequestSchema,
  PasskeyMetadataSchema,
  PasskeyNameSchema,
  PasskeyRegistrationOptionsResponseSchema,
  PasskeyRegistrationVerifyRequestSchema,
} from "../src";

const flowId = "0198a941-8ace-7115-aec6-d2b594aaee06";
const passkeyId = "0198a941-7824-7de6-8200-e54baa45a926";
const expiresAt = "2026-08-13T10:05:00.000Z";

describe("passkey option contracts", () => {
  it("requires registration options suitable for a discoverable verified passkey", () => {
    const response = {
      flowId,
      expiresAt,
      options: {
        rp: { id: "localhost", name: "Languon" },
        user: {
          id: "dXNlci0x",
          name: "learner@example.com",
          displayName: "learner@example.com",
        },
        challenge: "cmFuZG9tLWNoYWxsZW5nZQ",
        pubKeyCredParams: [{ alg: -7, type: "public-key" }],
        timeout: 300_000,
        attestation: "none",
        authenticatorSelection: {
          residentKey: "required",
          requireResidentKey: true,
          userVerification: "required",
        },
      },
    } as const;

    expect(PasskeyRegistrationOptionsResponseSchema.parse(response)).toEqual(
      response,
    );
    expect(
      PasskeyRegistrationOptionsResponseSchema.safeParse({
        ...response,
        options: {
          ...response.options,
          authenticatorSelection: {
            ...response.options.authenticatorSelection,
            userVerification: "preferred",
          },
        },
      }).success,
    ).toBe(false);
  });

  it("requires discoverable authentication without a credential allow-list", () => {
    const response = {
      flowId,
      expiresAt,
      options: {
        challenge: "cmFuZG9tLWNoYWxsZW5nZQ",
        timeout: 300_000,
        rpId: "localhost",
        userVerification: "required",
      },
    } as const;

    expect(PasskeyAuthenticationOptionsResponseSchema.parse(response)).toEqual(
      response,
    );
    expect(
      PasskeyAuthenticationOptionsResponseSchema.safeParse({
        ...response,
        options: { ...response.options, allowCredentials: [] },
      }).success,
    ).toBe(false);
  });
});

describe("passkey verification contracts", () => {
  it("accepts bounded browser registration data and a normalized name", () => {
    const parsed = PasskeyRegistrationVerifyRequestSchema.parse({
      flowId,
      name: "  Laptop  ",
      credential: {
        id: "Y3JlZGVudGlhbA",
        rawId: "Y3JlZGVudGlhbA",
        response: {
          clientDataJSON: "Y2xpZW50LWRhdGE",
          attestationObject: "YXR0ZXN0YXRpb24",
          transports: ["internal"],
        },
        type: "public-key",
        authenticatorAttachment: "platform",
        clientExtensionResults: { credProps: { rk: true } },
      },
    });

    expect(parsed.name).toBe("Laptop");
  });

  it("requires a discoverable authentication user handle", () => {
    const credential = {
      id: "Y3JlZGVudGlhbA",
      rawId: "Y3JlZGVudGlhbA",
      response: {
        clientDataJSON: "Y2xpZW50LWRhdGE",
        authenticatorData: "YXV0aGVudGljYXRvci1kYXRh",
        signature: "c2lnbmF0dXJl",
        userHandle: "dXNlci0x",
      },
      type: "public-key",
      clientExtensionResults: {},
    } as const;

    expect(
      PasskeyAuthenticationVerifyRequestSchema.safeParse({
        flowId,
        credential,
      }).success,
    ).toBe(true);
    expect(
      PasskeyAuthenticationVerifyRequestSchema.safeParse({
        flowId,
        credential: {
          ...credential,
          response: { ...credential.response, userHandle: undefined },
        },
      }).success,
    ).toBe(false);
  });
});

describe("safe passkey metadata", () => {
  it("exposes only management identifiers, names, and timestamps", () => {
    const metadata = {
      id: passkeyId,
      name: "Laptop",
      createdAt: "2026-08-13T10:00:00.000Z",
      lastUsedAt: null,
    } as const;

    expect(PasskeyMetadataSchema.parse(metadata)).toEqual(metadata);

    for (const sensitiveField of [
      "credentialId",
      "publicKey",
      "counter",
      "userHandle",
      "backupState",
      "transports",
    ]) {
      expect(
        PasskeyMetadataSchema.safeParse({
          ...metadata,
          [sensitiveField]: "sensitive",
        }).success,
      ).toBe(false);
    }
  });

  it("bounds and normalizes user-visible passkey names", () => {
    expect(PasskeyNameSchema.parse("  Security key  ")).toBe("Security key");
    expect(PasskeyNameSchema.safeParse("🔑".repeat(80)).success).toBe(true);
    expect(PasskeyNameSchema.safeParse("   ").success).toBe(false);
    expect(PasskeyNameSchema.safeParse("🔑".repeat(81)).success).toBe(false);
  });
});
