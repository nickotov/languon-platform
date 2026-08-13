export type WebAuthnChallengePurpose = "authentication" | "registration";

export interface StoredWebAuthnChallenge {
  challenge: string;
  id: string;
  purpose: WebAuthnChallengePurpose;
  userId: string | null;
}

export interface WebAuthnChallengeStoreOptions {
  signal?: AbortSignal;
}

export interface WebAuthnChallengeStore {
  consume(
    id: string,
    options?: WebAuthnChallengeStoreOptions,
  ): Promise<StoredWebAuthnChallenge | null>;
  issue(
    challenge: StoredWebAuthnChallenge,
    options?: WebAuthnChallengeStoreOptions,
  ): Promise<void>;
}

export class WebAuthnChallengeAlreadyExistsError extends Error {
  public constructor() {
    super("A WebAuthn challenge already exists for this identifier.");
    this.name = "WebAuthnChallengeAlreadyExistsError";
  }
}

export class WebAuthnChallengeStoreUnavailableError extends Error {
  public constructor() {
    super("WebAuthn challenge storage is unavailable.");
    this.name = "WebAuthnChallengeStoreUnavailableError";
  }
}
