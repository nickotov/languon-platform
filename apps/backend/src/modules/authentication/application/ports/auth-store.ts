import type { PasskeyDeviceType } from "../../domain/passkey";
import type { SessionRevocationReason } from "../../domain/refresh-session";
import type { VerificationChallengePurpose } from "../../domain/verification-challenge";
import type { PasswordHash } from "./password-hasher";

export type AuthenticationMethod =
  "email_verification" | "passkey" | "password";

export type AuthenticationUserStatus = "active" | "disabled" | "pending";

export interface AuthenticationAccount {
  createdAt: Date;
  email: string;
  emailId: string;
  emailVerifiedAt: Date | null;
  passwordCredential: StoredPasswordCredential | null;
  status: AuthenticationUserStatus;
  userId: string;
}

export interface StoredPasswordCredential extends PasswordHash {
  createdAt: Date;
  updatedAt: Date;
  userId: string;
}

export interface StoredVerificationChallenge {
  attemptsUsed: number;
  codeDigest: string;
  consumedAt: Date | null;
  emailId: string;
  expiresAt: Date;
  flowId: string;
  invalidatedAt: Date | null;
  issuedAt: Date;
  lastSentAt: Date;
  purpose: VerificationChallengePurpose;
  sendCount: number;
  userId: string;
}

export interface StoredAuthenticationSession {
  absoluteExpiresAt: Date;
  authenticatedAt: Date;
  authenticationMethod: AuthenticationMethod;
  clientLabel: string | null;
  consumedAt: Date | null;
  createdAt: Date;
  familyId: string;
  id: string;
  predecessorSessionId: string | null;
  refreshDigest: string;
  revokedAt: Date | null;
  revocationReason: SessionRevocationReason | null;
  successorId: string | null;
  userId: string;
}

export interface StoredAuthenticationPasskey {
  backedUp: boolean;
  counter: number;
  createdAt: Date;
  credentialId: string;
  credentialPublicKey: Uint8Array;
  deviceType: PasskeyDeviceType;
  id: string;
  lastUsedAt: Date | null;
  name: string;
  revokedAt: Date | null;
  transports: Array<
    "ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb"
  >;
  userHandle: string;
  userId: string;
}

export type NewStoredAuthenticationSession = StoredAuthenticationSession;

export type NewStoredVerificationChallenge = StoredVerificationChallenge;

export type NewStoredAuthenticationPasskey = StoredAuthenticationPasskey;

export type SignUpCommitResult =
  | "active_noop"
  | "pending_created"
  | "retry"
  | { kind: "limited"; retryAfterSeconds: number };

export type ChallengeIssueResult =
  | { kind: "issued"; recipient: string }
  | { kind: "limited"; retryAfterSeconds: number }
  | { kind: "noop" };

export type EmailVerificationCommitResult =
  | { account: AuthenticationAccount; kind: "verified" }
  | { kind: "incorrect" | "unavailable" };

export type PasswordResetCommitResult = "incorrect" | "reset" | "unavailable";

export type SessionIssueCommitResult =
  { account: AuthenticationAccount; kind: "issued" } | { kind: "unavailable" };

export type RefreshRotationCommitResult =
  | { account: AuthenticationAccount; kind: "rotated" }
  | { kind: "replay" | "unavailable" };

export type PasskeyAuthenticationCommitResult =
  | { account: AuthenticationAccount; kind: "authenticated" }
  | { kind: "counter_conflict" | "unavailable" };

/**
 * Application-facing persistence contract. Every mutating method is one atomic
 * database operation and must re-check the state represented by its expected
 * values while holding the required locks.
 */
export interface AuthStore {
  changePasswordAndReplaceSessions(input: {
    expectedPasswordHash: string;
    newCredential: StoredPasswordCredential;
    replacementSession: NewStoredAuthenticationSession;
    revokedAt: Date;
    userId: string;
  }): Promise<SessionIssueCommitResult>;
  commitEmailVerification(input: {
    codeMatches: boolean;
    flowId: string;
    now: Date;
    session: NewStoredAuthenticationSession;
  }): Promise<EmailVerificationCommitResult>;
  commitPasswordReset(input: {
    codeMatches: boolean;
    flowId: string;
    newCredential: StoredPasswordCredential;
    now: Date;
  }): Promise<PasswordResetCommitResult>;
  commitPasskeyAuthentication(input: {
    expectedCounter: number;
    now: Date;
    passkeyId: string;
    session: NewStoredAuthenticationSession;
    verifiedBackedUp: boolean;
    verifiedCounter: number;
    verifiedDeviceType: PasskeyDeviceType;
  }): Promise<PasskeyAuthenticationCommitResult>;
  findAccountByCanonicalEmail(
    canonicalEmail: string,
  ): Promise<AuthenticationAccount | null>;
  findAccountByUserId(userId: string): Promise<AuthenticationAccount | null>;
  findChallenge(input: {
    flowId: string;
    purpose: VerificationChallengePurpose;
  }): Promise<StoredVerificationChallenge | null>;
  findActiveChallengeForUser(input: {
    purpose: VerificationChallengePurpose;
    userId: string;
  }): Promise<StoredVerificationChallenge | null>;
  findPasskeyByCredentialId(
    credentialId: string,
  ): Promise<StoredAuthenticationPasskey | null>;
  findRefreshSessionByDigest(
    digest: string,
  ): Promise<StoredAuthenticationSession | null>;
  getActiveSession(input: {
    now: Date;
    sessionId: string;
    userId: string;
  }): Promise<StoredAuthenticationSession | null>;
  issuePasswordResetChallenge(input: {
    challenge: NewStoredVerificationChallenge;
    expectedStatus: "active";
  }): Promise<ChallengeIssueResult>;
  issueSessionForActiveUser(input: {
    expectedPasswordHash?: string;
    replacementCredential?: StoredPasswordCredential;
    session: NewStoredAuthenticationSession;
    userId: string;
  }): Promise<SessionIssueCommitResult>;
  listActivePasskeys(userId: string): Promise<StoredAuthenticationPasskey[]>;
  registerPasskey(input: {
    now: Date;
    passkey: NewStoredAuthenticationPasskey;
    sessionId: string;
    userId: string;
  }): Promise<boolean>;
  registerOrReplacePendingSignup(input: {
    account: {
      canonicalEmail: string;
      createdAt: Date;
      email: string;
      emailId: string;
      userId: string;
    };
    challenge: NewStoredVerificationChallenge;
    credential: StoredPasswordCredential;
  }): Promise<SignUpCommitResult>;
  renamePasskey(input: {
    name: string;
    now: Date;
    passkeyId: string;
    userId: string;
  }): Promise<StoredAuthenticationPasskey | null>;
  replaceEmailVerificationChallenge(input: {
    challenge: NewStoredVerificationChallenge;
    previousFlowId: string;
  }): Promise<ChallengeIssueResult>;
  revokeAllSessions(input: {
    reason: SessionRevocationReason;
    revokedAt: Date;
    userId: string;
  }): Promise<void>;
  revokePasskey(input: {
    now: Date;
    passkeyId: string;
    sessionId: string;
    userId: string;
  }): Promise<boolean>;
  revokeSessionFamilyByDigest(input: {
    digest: string;
    reason: SessionRevocationReason;
    revokedAt: Date;
  }): Promise<void>;
  rotateRefreshSession(input: {
    digest: string;
    now: Date;
    successor: NewStoredAuthenticationSession;
  }): Promise<RefreshRotationCommitResult>;
}
