import type {
  AuthenticatorTransport,
  PasskeyAuthenticationCredential,
  PasskeyAuthenticationPublicKeyOptions,
  PasskeyRegistrationCredential,
  PasskeyRegistrationPublicKeyOptions,
} from "@languon/contracts";

const AUTHENTICATOR_TRANSPORTS = new Set<AuthenticatorTransport>([
  "ble",
  "cable",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb",
]);

function isAuthenticatorTransport(
  value: string,
): value is AuthenticatorTransport {
  return AUTHENTICATOR_TRANSPORTS.has(value as AuthenticatorTransport);
}

function attachment(
  value: string | null,
): "cross-platform" | "platform" | undefined {
  return value === "cross-platform" || value === "platform" ? value : undefined;
}

function extensionResults(credential: PublicKeyCredential) {
  const extensions = credential.getClientExtensionResults();
  return extensions.credProps
    ? {
        credProps: {
          ...(extensions.credProps.rk === undefined
            ? {}
            : { rk: extensions.credProps.rk }),
        },
      }
    : {};
}

function fromBase64Url(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return bytes.buffer;
}

function toBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function supportsPasskeys(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials !== "undefined"
  );
}

export async function createPasskey(
  options: PasskeyRegistrationPublicKeyOptions,
): Promise<PasskeyRegistrationCredential> {
  if (!supportsPasskeys()) {
    throw new Error("Passkeys are not supported in this browser or context.");
  }

  const authenticatorSelection: AuthenticatorSelectionCriteria = {
    residentKey: options.authenticatorSelection.residentKey,
    userVerification: options.authenticatorSelection.userVerification,
    ...(options.authenticatorSelection.authenticatorAttachment
      ? {
          authenticatorAttachment:
            options.authenticatorSelection.authenticatorAttachment,
        }
      : {}),
    ...(options.authenticatorSelection.requireResidentKey === undefined
      ? {}
      : {
          requireResidentKey: options.authenticatorSelection.requireResidentKey,
        }),
  };
  const publicKey: PublicKeyCredentialCreationOptions = {
    attestation: options.attestation,
    authenticatorSelection,
    challenge: fromBase64Url(options.challenge),
    pubKeyCredParams: options.pubKeyCredParams,
    rp: options.rp,
    timeout: options.timeout,
    user: { ...options.user, id: fromBase64Url(options.user.id) },
    ...(options.excludeCredentials
      ? {
          excludeCredentials: options.excludeCredentials.map((credential) => ({
            id: fromBase64Url(credential.id),
            type: credential.type,
          })),
        }
      : {}),
  };
  const result = await navigator.credentials.create({ publicKey });
  if (!(result instanceof PublicKeyCredential)) {
    throw new Error("The browser did not return a passkey credential.");
  }
  const response = result.response;
  if (!(response instanceof AuthenticatorAttestationResponse)) {
    throw new Error("The browser returned an invalid registration response.");
  }

  const resultAttachment = attachment(result.authenticatorAttachment);
  return {
    ...(resultAttachment ? { authenticatorAttachment: resultAttachment } : {}),
    clientExtensionResults: extensionResults(result),
    id: result.id,
    rawId: toBase64Url(result.rawId),
    response: {
      attestationObject: toBase64Url(response.attestationObject),
      clientDataJSON: toBase64Url(response.clientDataJSON),
      transports: response.getTransports().filter(isAuthenticatorTransport),
    },
    type: "public-key",
  };
}

export async function getPasskey(
  options: PasskeyAuthenticationPublicKeyOptions,
): Promise<PasskeyAuthenticationCredential> {
  if (!supportsPasskeys()) {
    throw new Error("Passkeys are not supported in this browser or context.");
  }

  const result = await navigator.credentials.get({
    publicKey: {
      challenge: fromBase64Url(options.challenge),
      rpId: options.rpId,
      timeout: options.timeout,
      userVerification: options.userVerification,
    },
  });
  if (!(result instanceof PublicKeyCredential)) {
    throw new Error("The browser did not return a passkey credential.");
  }
  const response = result.response;
  if (
    !(response instanceof AuthenticatorAssertionResponse) ||
    !response.userHandle
  ) {
    throw new Error("The browser returned an invalid authentication response.");
  }

  const resultAttachment = attachment(result.authenticatorAttachment);
  return {
    ...(resultAttachment ? { authenticatorAttachment: resultAttachment } : {}),
    clientExtensionResults: extensionResults(result),
    id: result.id,
    rawId: toBase64Url(result.rawId),
    response: {
      authenticatorData: toBase64Url(response.authenticatorData),
      clientDataJSON: toBase64Url(response.clientDataJSON),
      signature: toBase64Url(response.signature),
      userHandle: toBase64Url(response.userHandle),
    },
    type: "public-key",
  };
}
