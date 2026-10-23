import type {
    AuthStore,
    AuthenticationAccount,
    ChallengeIssueResult,
    EmailVerificationCommitResult,
    NewStoredAuthenticationPasskey,
    NewStoredAuthenticationSession,
    NewStoredVerificationChallenge,
    PasskeyAuthenticationCommitResult,
    PasswordResetCommitResult,
    RefreshRotationCommitResult,
    SessionIssueCommitResult,
    SignUpCommitResult,
    StoredAuthenticationPasskey,
    StoredAuthenticationSession,
    StoredPasswordCredential,
    StoredVerificationChallenge,
} from '../../../application/ports/auth-store';
import type { SessionRevocationReason } from '../../../domain/refresh-session';
import {
    findAccountByCanonicalEmail,
    findAccountByUserId,
    findActiveChallengeForUser,
    findChallenge,
    findPasskeyByCredentialId,
    findRefreshSessionByDigest,
    getActiveSession,
    listActivePasskeys,
} from './auth-account-access';
import {
    commitPasskeyAuthentication,
    registerPasskey,
    renamePasskey,
    revokePasskey,
} from './auth-passkey-operations';
import { type AuthenticationDatabase } from './auth-persistence-support';
import {
    changePasswordAndReplaceSessions,
    issueSessionForActiveUser,
    revokeAllSessions,
    revokeSessionFamilyByDigest,
    rotateRefreshSession,
} from './auth-session-operations';
import {
    commitEmailVerification,
    commitPasswordReset,
    issuePasswordResetChallenge,
    registerOrReplacePendingSignup,
    replaceEmailVerificationChallenge,
} from './auth-verification-operations';
export class DrizzleAuthStore implements AuthStore {
    public constructor(private readonly database: AuthenticationDatabase) {}

    public findAccountByCanonicalEmail(
        canonicalEmail: string,
    ): Promise<AuthenticationAccount | null> {
        return findAccountByCanonicalEmail(
            { database: this.database },
            canonicalEmail,
        );
    }

    public findAccountByUserId(
        userId: string,
    ): Promise<AuthenticationAccount | null> {
        return findAccountByUserId({ database: this.database }, userId);
    }

    public async findChallenge(input: {
        flowId: string;
        purpose: StoredVerificationChallenge['purpose'];
    }): Promise<StoredVerificationChallenge | null> {
        return findChallenge({ database: this.database }, input);
    }

    public async findActiveChallengeForUser(input: {
        purpose: StoredVerificationChallenge['purpose'];
        userId: string;
    }): Promise<StoredVerificationChallenge | null> {
        return findActiveChallengeForUser({ database: this.database }, input);
    }

    public async findPasskeyByCredentialId(
        credentialId: string,
    ): Promise<StoredAuthenticationPasskey | null> {
        return findPasskeyByCredentialId(
            { database: this.database },
            credentialId,
        );
    }

    public async findRefreshSessionByDigest(
        digest: string,
    ): Promise<StoredAuthenticationSession | null> {
        return findRefreshSessionByDigest({ database: this.database }, digest);
    }

    public async getActiveSession(input: {
        now: Date;
        sessionId: string;
        userId: string;
    }): Promise<StoredAuthenticationSession | null> {
        return getActiveSession({ database: this.database }, input);
    }

    public async listActivePasskeys(
        userId: string,
    ): Promise<StoredAuthenticationPasskey[]> {
        return listActivePasskeys({ database: this.database }, userId);
    }

    public registerOrReplacePendingSignup(input: {
        account: {
            canonicalEmail: string;
            createdAt: Date;
            email: string;
            emailId: string;
            userId: string;
        };
        challenge: NewStoredVerificationChallenge;
        credential: StoredPasswordCredential;
    }): Promise<SignUpCommitResult> {
        return registerOrReplacePendingSignup(
            { database: this.database },
            input,
        );
    }

    public issuePasswordResetChallenge(input: {
        challenge: NewStoredVerificationChallenge;
        expectedStatus: 'active';
    }): Promise<ChallengeIssueResult> {
        return issuePasswordResetChallenge({ database: this.database }, input);
    }

    public replaceEmailVerificationChallenge(input: {
        challenge: NewStoredVerificationChallenge;
        previousFlowId: string;
    }): Promise<ChallengeIssueResult> {
        return replaceEmailVerificationChallenge(
            { database: this.database },
            input,
        );
    }

    public commitEmailVerification(input: {
        codeMatches: boolean;
        flowId: string;
        now: Date;
        session: NewStoredAuthenticationSession;
    }): Promise<EmailVerificationCommitResult> {
        return commitEmailVerification({ database: this.database }, input);
    }

    public commitPasswordReset(input: {
        codeMatches: boolean;
        flowId: string;
        newCredential: StoredPasswordCredential;
        now: Date;
    }): Promise<PasswordResetCommitResult> {
        return commitPasswordReset({ database: this.database }, input);
    }

    public issueSessionForActiveUser(input: {
        expectedPasswordHash?: string;
        replacementCredential?: StoredPasswordCredential;
        session: NewStoredAuthenticationSession;
        userId: string;
    }): Promise<SessionIssueCommitResult> {
        return issueSessionForActiveUser({ database: this.database }, input);
    }

    public changePasswordAndReplaceSessions(input: {
        expectedPasswordHash: string;
        newCredential: StoredPasswordCredential;
        replacementSession: NewStoredAuthenticationSession;
        revokedAt: Date;
        userId: string;
    }): Promise<SessionIssueCommitResult> {
        return changePasswordAndReplaceSessions(
            { database: this.database },
            input,
        );
    }

    public revokeAllSessions(input: {
        reason: SessionRevocationReason;
        revokedAt: Date;
        userId: string;
    }): Promise<void> {
        return revokeAllSessions({ database: this.database }, input);
    }

    public async revokeSessionFamilyByDigest(input: {
        digest: string;
        reason: SessionRevocationReason;
        revokedAt: Date;
    }): Promise<void> {
        return revokeSessionFamilyByDigest({ database: this.database }, input);
    }

    public rotateRefreshSession(input: {
        digest: string;
        now: Date;
        successor: NewStoredAuthenticationSession;
    }): Promise<RefreshRotationCommitResult> {
        return rotateRefreshSession({ database: this.database }, input);
    }

    public registerPasskey(input: {
        now: Date;
        passkey: NewStoredAuthenticationPasskey;
        sessionId: string;
        userId: string;
    }): Promise<boolean> {
        return registerPasskey({ database: this.database }, input);
    }

    public commitPasskeyAuthentication(input: {
        expectedCounter: number;
        now: Date;
        passkeyId: string;
        session: NewStoredAuthenticationSession;
        verifiedBackedUp: boolean;
        verifiedCounter: number;
        verifiedDeviceType: StoredAuthenticationPasskey['deviceType'];
    }): Promise<PasskeyAuthenticationCommitResult> {
        return commitPasskeyAuthentication({ database: this.database }, input);
    }

    public renamePasskey(input: {
        name: string;
        now: Date;
        passkeyId: string;
        userId: string;
    }): Promise<StoredAuthenticationPasskey | null> {
        return renamePasskey({ database: this.database }, input);
    }

    public revokePasskey(input: {
        now: Date;
        passkeyId: string;
        sessionId: string;
        userId: string;
    }): Promise<boolean> {
        return revokePasskey({ database: this.database }, input);
    }
}
