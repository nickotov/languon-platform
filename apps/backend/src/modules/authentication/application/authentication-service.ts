import { Buffer } from 'node:buffer';

import { EmailAddress } from '../../users/domain/email-address';
import type { PasswordPolicy } from '../domain/password-policy';
import type { VerificationChallengePurpose } from '../domain/verification-challenge';
import {
    AuthenticationCapabilityUnavailableError,
    AuthenticationRequiredError,
    InvalidCredentialsError,
    PasswordUnchangedError,
    PasskeyOperationFailedError,
    RateLimitExceededError,
    RecentAuthenticationRequiredError,
    VerificationFailedError,
} from './authentication-errors';
import type {
    AuthenticationAccount,
    AuthStore,
    NewStoredVerificationChallenge,
    StoredAuthenticationPasskey,
    StoredPasswordCredential,
    StoredVerificationChallenge,
} from './ports/auth-store';
import type { Clock } from './ports/clock';
import type { VerificationCodeDigester } from './ports/code-digester';
import type { EmailSender } from './ports/email-sender';
import type { VerificationCodeGenerator } from './ports/entropy';
import type { IdGenerator } from './ports/id-generator';
import type {
    PasskeyAuthenticationCredential,
    PasskeyRegistrationCredential,
    PasskeyVerifier,
} from './ports/passkey-verifier';
import type { PasswordHash, PasswordHasher } from './ports/password-hasher';
import type { RateLimiter } from './ports/rate-limiter';
import type { RefreshCredentialService } from './ports/refresh-credential';
import type {
    SecurityEvent,
    SecurityEventRecorder,
} from './ports/security-event';
import type { WebAuthnChallengeStore } from './ports/webauthn-challenge-store';
import type {
    AuthenticationSuccess,
    PreparedAuthenticationSession,
    SessionIssuer,
} from './session-issuer';

const challengeLifetimeMs = 10 * 60 * 1_000;
const resendCooldownMs = 60 * 1_000;

export interface AuthenticationRequestContext {
    clientAddress: string;
    correlationId: string;
    signal?: AbortSignal;
}

export interface VerificationFlowResult {
    expiresAt: Date;
    flowId: string;
    resendAvailableAt: Date;
}

export interface VerificationPendingResult {
    status: 'verification_pending';
    verification: VerificationFlowResult;
}

export interface RecoveryPendingResult {
    recovery: VerificationFlowResult;
    status: 'recovery_pending';
}

export interface EmailVerificationRequiredResult {
    status: 'email_verification_required';
    verification: VerificationFlowResult;
}

export type PasswordLoginResult =
    AuthenticationSuccess | EmailVerificationRequiredResult;

export interface AuthenticationServiceDependencies {
    clock: Clock;
    codeDigester: VerificationCodeDigester;
    codeGenerator: VerificationCodeGenerator;
    dummyPasswordHash: PasswordHash;
    emailSender: EmailSender;
    ids: IdGenerator;
    passwordHasher: PasswordHasher;
    passwordPolicy: PasswordPolicy;
    passkeyVerifier: PasskeyVerifier;
    rateLimiter: RateLimiter;
    refreshCredentials: RefreshCredentialService;
    securityEvents: SecurityEventRecorder;
    sessionIssuer: SessionIssuer;
    store: AuthStore;
    webAuthnChallenges: WebAuthnChallengeStore;
}

export class AuthenticationService {
    public constructor(
        private readonly dependencies: AuthenticationServiceDependencies,
    ) {}

    public capabilities(): {
        email: {
            passwordRecovery: boolean;
            signUp: boolean;
            verification: boolean;
        };
        passwordAuthentication: true;
    } {
        const emailAvailable =
            this.dependencies.emailSender.capability().available;
        return {
            email: {
                passwordRecovery: emailAvailable,
                signUp: emailAvailable,
                verification: emailAvailable,
            },
            passwordAuthentication: true,
        };
    }

    public async signUp(input: {
        context: AuthenticationRequestContext;
        email: string;
        password: string;
    }): Promise<VerificationPendingResult> {
        this.assertEmailAvailable();
        const email = EmailAddress.create(input.email);
        this.dependencies.passwordPolicy.assertAcceptable(input.password);
        await this.limit(input.context, [
            [
                'verification.email_send.cooldown',
                email.canonicalValue,
                1,
                60_000,
            ],
            [
                'verification.email_send.account',
                email.canonicalValue,
                5,
                60 * 60 * 1_000,
            ],
            [
                'verification.email_send.client',
                input.context.clientAddress,
                5,
                60 * 60 * 1_000,
            ],
        ]);

        // Hash for active, pending, and unknown accounts so signup does not expose
        // identity state through the dominant CPU path.
        const passwordHash = await this.dependencies.passwordHasher.hash(
            input.password,
            this.operationOptions(input.context),
        );

        for (let attempt = 0; attempt < 2; attempt += 1) {
            const existing =
                await this.dependencies.store.findAccountByCanonicalEmail(
                    email.canonicalValue,
                );
            const now = this.dependencies.clock.now();
            const userId = existing?.userId ?? this.dependencies.ids.generate();
            const emailId =
                existing?.emailId ?? this.dependencies.ids.generate();
            const issued = this.createChallenge({
                emailId,
                now,
                purpose: 'email_verification',
                userId,
            });
            await Promise.all([
                this.linkRateLimitSubject(input.context, {
                    alias: issued.challenge.flowId,
                    scope: 'verification.email_send.cooldown',
                    subject: email.canonicalValue,
                    ttlMs: 60_000,
                }),
                this.linkRateLimitSubject(input.context, {
                    alias: issued.challenge.flowId,
                    scope: 'verification.email_send.account',
                    subject: email.canonicalValue,
                    ttlMs: 60 * 60_000,
                }),
            ]);
            const result =
                await this.dependencies.store.registerOrReplacePendingSignup({
                    account: {
                        canonicalEmail: email.canonicalValue,
                        createdAt: now,
                        email: email.value,
                        emailId,
                        userId,
                    },
                    challenge: issued.challenge,
                    credential: this.createCredential(
                        userId,
                        passwordHash,
                        now,
                    ),
                });

            if (result === 'retry') {
                continue;
            }

            if (typeof result !== 'string') {
                throw new RateLimitExceededError(result.retryAfterSeconds);
            }

            if (result === 'pending_created') {
                await this.dependencies.emailSender.sendVerificationCode(
                    {
                        code: issued.code,
                        expiresAt: issued.challenge.expiresAt,
                        flowId: issued.challenge.flowId,
                        purpose: issued.challenge.purpose,
                        recipient: existing?.email ?? email.value,
                    },
                    this.operationOptions(input.context),
                );
            }

            await this.record({
                context: input.context,
                eventType: 'auth.signup',
                outcome: 'success',
                ...(result === 'pending_created' ? { userId } : {}),
            });
            return {
                status: 'verification_pending',
                verification: this.toFlow(issued.challenge),
            };
        }

        throw new PasskeyOperationFailedError();
    }

    public async resendEmailVerification(input: {
        context: AuthenticationRequestContext;
        flowId: string;
    }): Promise<VerificationPendingResult> {
        this.assertEmailAvailable();
        await this.limit(input.context, [
            ['verification.email_send.cooldown', input.flowId, 1, 60_000, true],
            [
                'verification.email_send.account',
                input.flowId,
                5,
                60 * 60 * 1_000,
                true,
            ],
            [
                'verification.email_send.client',
                input.context.clientAddress,
                5,
                60 * 60 * 1_000,
            ],
        ]);

        const prior = await this.dependencies.store.findChallenge({
            flowId: input.flowId,
            purpose: 'email_verification',
        });

        const now = this.dependencies.clock.now();
        if (!prior) {
            return {
                status: 'verification_pending',
                verification: this.syntheticFlow(now),
            };
        }

        const issued = this.createChallenge({
            emailId: prior.emailId,
            now,
            purpose: prior.purpose,
            sendCount: prior.sendCount + 1,
            userId: prior.userId,
        });
        const result =
            await this.dependencies.store.replaceEmailVerificationChallenge({
                challenge: issued.challenge,
                previousFlowId: prior.flowId,
            });

        if (result.kind === 'issued') {
            await this.dependencies.emailSender.sendVerificationCode(
                {
                    code: issued.code,
                    expiresAt: issued.challenge.expiresAt,
                    flowId: issued.challenge.flowId,
                    purpose: issued.challenge.purpose,
                    recipient: result.recipient,
                },
                this.operationOptions(input.context),
            );
        }

        return {
            status: 'verification_pending',
            verification:
                result.kind === 'issued'
                    ? this.toFlow(issued.challenge)
                    : this.syntheticFlow(now),
        };
    }

    public async verifyEmail(input: {
        clientLabel?: string;
        code: string;
        context: AuthenticationRequestContext;
        flowId: string;
    }): Promise<AuthenticationSuccess> {
        await this.limit(input.context, [
            ['verification.verify.flow', input.flowId, 10, 10 * 60 * 1_000],
            [
                'verification.verify.client',
                input.context.clientAddress,
                30,
                60 * 60 * 1_000,
            ],
        ]);
        const challenge = await this.dependencies.store.findChallenge({
            flowId: input.flowId,
            purpose: 'email_verification',
        });
        if (!challenge) {
            await this.recordFailure(
                input.context,
                'auth.email_verification',
                'invalid_challenge',
            );
            throw new VerificationFailedError();
        }

        const codeMatches = this.codeMatches(challenge, input.code);
        const prepared = await this.dependencies.sessionIssuer.prepareInitial({
            ...(input.clientLabel === undefined
                ? {}
                : { clientLabel: input.clientLabel }),
            method: 'email_verification',
            userId: challenge.userId,
        });
        const result = await this.dependencies.store.commitEmailVerification({
            codeMatches,
            flowId: challenge.flowId,
            now: this.dependencies.clock.now(),
            session: prepared.storedSession,
        });
        if (result.kind !== 'verified') {
            await this.recordFailure(
                input.context,
                'auth.email_verification',
                result.kind,
            );
            throw new VerificationFailedError();
        }

        await this.record({
            context: input.context,
            eventType: 'auth.email_verification',
            outcome: 'success',
            sessionId: prepared.storedSession.id,
            userId: result.account.userId,
        });
        return this.dependencies.sessionIssuer.toSuccess(
            prepared,
            result.account,
        );
    }

    public async passwordLogin(input: {
        clientLabel?: string;
        context: AuthenticationRequestContext;
        email: string;
        password: string;
    }): Promise<PasswordLoginResult> {
        const email = EmailAddress.create(input.email);
        await this.limit(input.context, [
            [
                'login.password.account',
                email.canonicalValue,
                10,
                15 * 60 * 1_000,
            ],
            [
                'login.password.client',
                input.context.clientAddress,
                50,
                15 * 60 * 1_000,
            ],
        ]);
        const account =
            await this.dependencies.store.findAccountByCanonicalEmail(
                email.canonicalValue,
            );
        const candidateHash =
            account?.passwordCredential ?? this.dependencies.dummyPasswordHash;
        const verification = await this.dependencies.passwordHasher.verify(
            input.password,
            candidateHash,
            this.operationOptions(input.context),
        );

        if (!account?.passwordCredential || !verification.matches) {
            await this.recordFailure(
                input.context,
                'auth.password_login',
                'invalid_credentials',
                account?.userId,
            );
            throw new InvalidCredentialsError();
        }
        if (account.status === 'pending') {
            const challenge =
                await this.dependencies.store.findActiveChallengeForUser({
                    purpose: 'email_verification',
                    userId: account.userId,
                });
            if (!challenge) {
                throw new VerificationFailedError();
            }
            return {
                status: 'email_verification_required',
                verification: this.toFlow(challenge),
            };
        }
        if (account.status !== 'active' || !account.emailVerifiedAt) {
            await this.recordFailure(
                input.context,
                'auth.password_login',
                'invalid_credentials',
                account.userId,
            );
            throw new InvalidCredentialsError();
        }

        const now = this.dependencies.clock.now();
        const replacementCredential = verification.needsRehash
            ? this.createCredential(
                  account.userId,
                  await this.dependencies.passwordHasher.hash(input.password, {
                      ...(input.context.signal
                          ? { signal: input.context.signal }
                          : {}),
                  }),
                  now,
                  account.passwordCredential.createdAt,
              )
            : undefined;
        const prepared = await this.dependencies.sessionIssuer.prepareInitial({
            ...(input.clientLabel === undefined
                ? {}
                : { clientLabel: input.clientLabel }),
            method: 'password',
            userId: account.userId,
        });
        let committed = await this.dependencies.store.issueSessionForActiveUser(
            {
                expectedPasswordHash: account.passwordCredential.encoded,
                ...(replacementCredential ? { replacementCredential } : {}),
                session: prepared.storedSession,
                userId: account.userId,
            },
        );
        if (committed.kind !== 'issued' && replacementCredential) {
            const current = await this.dependencies.store.findAccountByUserId(
                account.userId,
            );
            if (
                current?.status === 'active' &&
                current.emailVerifiedAt &&
                current.passwordCredential &&
                current.passwordCredential.encoded !==
                    account.passwordCredential.encoded
            ) {
                const currentVerification =
                    await this.dependencies.passwordHasher.verify(
                        input.password,
                        current.passwordCredential,
                        this.operationOptions(input.context),
                    );
                if (currentVerification.matches) {
                    committed =
                        await this.dependencies.store.issueSessionForActiveUser(
                            {
                                expectedPasswordHash:
                                    current.passwordCredential.encoded,
                                session: prepared.storedSession,
                                userId: current.userId,
                            },
                        );
                }
            }
        }
        if (committed.kind !== 'issued') {
            throw new InvalidCredentialsError();
        }

        await this.record({
            context: input.context,
            eventType: 'auth.password_login',
            outcome: 'success',
            sessionId: prepared.storedSession.id,
            userId: account.userId,
        });
        return this.dependencies.sessionIssuer.toSuccess(
            prepared,
            committed.account,
        );
    }

    public async forgotPassword(input: {
        context: AuthenticationRequestContext;
        email: string;
    }): Promise<RecoveryPendingResult> {
        this.assertEmailAvailable();
        const email = EmailAddress.create(input.email);
        await this.limit(input.context, [
            ['password.forgot.cooldown', email.canonicalValue, 1, 60_000],
            [
                'password.forgot.account',
                email.canonicalValue,
                5,
                60 * 60 * 1_000,
            ],
            [
                'password.forgot.client',
                input.context.clientAddress,
                5,
                60 * 60 * 1_000,
            ],
        ]);
        const account =
            await this.dependencies.store.findAccountByCanonicalEmail(
                email.canonicalValue,
            );
        const now = this.dependencies.clock.now();
        if (
            !account ||
            account.status !== 'active' ||
            !account.emailVerifiedAt
        ) {
            return {
                recovery: this.syntheticFlow(now),
                status: 'recovery_pending',
            };
        }

        const issued = this.createChallenge({
            emailId: account.emailId,
            now,
            purpose: 'password_reset',
            userId: account.userId,
        });
        const result =
            await this.dependencies.store.issuePasswordResetChallenge({
                challenge: issued.challenge,
                expectedStatus: 'active',
            });
        if (result.kind === 'limited') {
            throw new RateLimitExceededError(result.retryAfterSeconds);
        }
        if (result.kind === 'issued') {
            await this.dependencies.emailSender.sendVerificationCode(
                {
                    code: issued.code,
                    expiresAt: issued.challenge.expiresAt,
                    flowId: issued.challenge.flowId,
                    purpose: issued.challenge.purpose,
                    recipient: result.recipient,
                },
                this.operationOptions(input.context),
            );
        }
        return {
            recovery:
                result.kind === 'issued'
                    ? this.toFlow(issued.challenge)
                    : this.syntheticFlow(now),
            status: 'recovery_pending',
        };
    }

    public async resetPassword(input: {
        code: string;
        context: AuthenticationRequestContext;
        flowId: string;
        newPassword: string;
    }): Promise<{ status: 'password_reset' }> {
        this.dependencies.passwordPolicy.assertAcceptable(input.newPassword);
        await this.limit(input.context, [
            ['password.reset.flow', input.flowId, 10, 10 * 60 * 1_000],
            [
                'password.reset.client',
                input.context.clientAddress,
                30,
                60 * 60 * 1_000,
            ],
        ]);
        const challenge = await this.dependencies.store.findChallenge({
            flowId: input.flowId,
            purpose: 'password_reset',
        });
        const now = this.dependencies.clock.now();
        // Keep the expensive path consistent for usable and unusable recovery flows.
        const passwordHash = await this.dependencies.passwordHasher.hash(
            input.newPassword,
            this.operationOptions(input.context),
        );
        if (!challenge) {
            throw new VerificationFailedError();
        }
        const result = await this.dependencies.store.commitPasswordReset({
            codeMatches: this.codeMatches(challenge, input.code),
            flowId: challenge.flowId,
            newCredential: this.createCredential(
                challenge.userId,
                passwordHash,
                now,
            ),
            now,
        });
        if (result !== 'reset') {
            await this.recordFailure(
                input.context,
                'auth.password_reset',
                result,
                challenge.userId,
            );
            throw new VerificationFailedError();
        }
        await this.record({
            context: input.context,
            eventType: 'auth.password_reset',
            outcome: 'success',
            userId: challenge.userId,
        });
        return { status: 'password_reset' };
    }

    public async changePassword(input: {
        clientLabel?: string;
        context: AuthenticationRequestContext;
        currentPassword: string;
        newPassword: string;
        userId: string;
    }): Promise<AuthenticationSuccess> {
        if (
            this.dependencies.passwordPolicy.areEqual(
                input.currentPassword,
                input.newPassword,
            )
        ) {
            throw new PasswordUnchangedError();
        }
        this.dependencies.passwordPolicy.assertAcceptable(input.newPassword);
        await this.limit(input.context, [
            ['password.change.user', input.userId, 10, 15 * 60 * 1_000],
            [
                'password.change.client',
                input.context.clientAddress,
                30,
                15 * 60 * 1_000,
            ],
        ]);
        const account = await this.dependencies.store.findAccountByUserId(
            input.userId,
        );
        if (!account?.passwordCredential || account.status !== 'active') {
            throw new AuthenticationRequiredError();
        }
        const verification = await this.dependencies.passwordHasher.verify(
            input.currentPassword,
            account.passwordCredential,
            this.operationOptions(input.context),
        );
        if (!verification.matches) {
            throw new InvalidCredentialsError();
        }
        const now = this.dependencies.clock.now();
        const newHash = await this.dependencies.passwordHasher.hash(
            input.newPassword,
            this.operationOptions(input.context),
        );
        const prepared =
            await this.dependencies.sessionIssuer.prepareReplacement({
                ...(input.clientLabel === undefined
                    ? {}
                    : { clientLabel: input.clientLabel }),
                method: 'password',
                userId: account.userId,
            });
        const result =
            await this.dependencies.store.changePasswordAndReplaceSessions({
                expectedPasswordHash: account.passwordCredential.encoded,
                newCredential: this.createCredential(
                    account.userId,
                    newHash,
                    now,
                    account.passwordCredential.createdAt,
                ),
                replacementSession: prepared.storedSession,
                revokedAt: now,
                userId: account.userId,
            });
        if (result.kind !== 'issued') {
            throw new AuthenticationRequiredError();
        }
        await this.record({
            context: input.context,
            eventType: 'auth.password_change',
            outcome: 'success',
            sessionId: prepared.storedSession.id,
            userId: account.userId,
        });
        return this.dependencies.sessionIssuer.toSuccess(
            prepared,
            result.account,
        );
    }

    public async refresh(input: {
        context: AuthenticationRequestContext;
        refreshCredential: string;
    }): Promise<AuthenticationSuccess> {
        const digest = this.dependencies.refreshCredentials.digest(
            input.refreshCredential,
        );
        await this.limit(input.context, [
            ['session.refresh.token', digest, 30, 15 * 60 * 1_000],
            [
                'session.refresh.client',
                input.context.clientAddress,
                60,
                15 * 60 * 1_000,
            ],
        ]);
        const predecessor =
            await this.dependencies.store.findRefreshSessionByDigest(digest);
        if (!predecessor || predecessor.revokedAt) {
            await this.recordFailure(
                input.context,
                'auth.session_refresh',
                'unavailable',
                predecessor?.userId,
            );
            throw new AuthenticationRequiredError();
        }
        if (predecessor.consumedAt) {
            // The atomic rotation operation is still invoked so the store can revoke
            // the complete family while holding the relevant session lock.
            const replay = await this.dependencies.store.rotateRefreshSession({
                digest,
                now: this.dependencies.clock.now(),
                successor: predecessor,
            });
            if (replay.kind !== 'replay') {
                await this.recordFailure(
                    input.context,
                    'auth.session_refresh',
                    replay.kind,
                    predecessor.userId,
                );
                throw new AuthenticationRequiredError();
            }
            await this.recordFailure(
                input.context,
                'auth.session_refresh',
                'replay',
                predecessor.userId,
            );
            throw new AuthenticationRequiredError();
        }

        let prepared: PreparedAuthenticationSession;
        try {
            prepared =
                await this.dependencies.sessionIssuer.prepareSuccessor(
                    predecessor,
                );
        } catch (error) {
            if (error instanceof RangeError) {
                throw new AuthenticationRequiredError();
            }
            throw error;
        }
        const result = await this.dependencies.store.rotateRefreshSession({
            digest,
            now: this.dependencies.clock.now(),
            successor: prepared.storedSession,
        });
        if (result.kind !== 'rotated') {
            await this.recordFailure(
                input.context,
                'auth.session_refresh',
                result.kind,
                predecessor.userId,
            );
            throw new AuthenticationRequiredError();
        }
        return this.dependencies.sessionIssuer.toSuccess(
            prepared,
            result.account,
        );
    }

    public async logout(input: {
        context: AuthenticationRequestContext;
        refreshCredential: string | null;
    }): Promise<{ status: 'signed_out' }> {
        if (input.refreshCredential) {
            await this.dependencies.store.revokeSessionFamilyByDigest({
                digest: this.dependencies.refreshCredentials.digest(
                    input.refreshCredential,
                ),
                reason: 'logout',
                revokedAt: this.dependencies.clock.now(),
            });
        }
        return { status: 'signed_out' };
    }

    public async logoutAll(input: {
        context: AuthenticationRequestContext;
        userId: string;
    }): Promise<{ status: 'all_sessions_revoked' }> {
        await this.dependencies.store.revokeAllSessions({
            reason: 'logout_all',
            revokedAt: this.dependencies.clock.now(),
            userId: input.userId,
        });
        await this.record({
            context: input.context,
            eventType: 'auth.logout_all',
            outcome: 'success',
            userId: input.userId,
        });
        return { status: 'all_sessions_revoked' };
    }

    public async requireActiveSession(input: {
        sessionId: string;
        userId: string;
    }): Promise<{
        account: AuthenticationAccount;
        session: NonNullable<
            Awaited<ReturnType<AuthStore['getActiveSession']>>
        >;
    }> {
        const [account, session] = await Promise.all([
            this.dependencies.store.findAccountByUserId(input.userId),
            this.dependencies.store.getActiveSession({
                now: this.dependencies.clock.now(),
                sessionId: input.sessionId,
                userId: input.userId,
            }),
        ]);
        if (
            !account ||
            account.status !== 'active' ||
            !account.emailVerifiedAt ||
            !session
        ) {
            throw new AuthenticationRequiredError();
        }
        return { account, session };
    }

    public async requireRecentlyAuthenticatedSession(input: {
        sessionId: string;
        userId: string;
    }): Promise<{
        account: AuthenticationAccount;
        session: NonNullable<
            Awaited<ReturnType<AuthStore['getActiveSession']>>
        >;
    }> {
        const active = await this.requireActiveSession(input);
        if (
            !this.dependencies.sessionIssuer.isRecentlyAuthenticated(
                active.session,
            )
        ) {
            throw new RecentAuthenticationRequiredError();
        }
        return active;
    }

    public async listPasskeys(input: {
        sessionId: string;
        userId: string;
    }): Promise<
        Array<
            Pick<
                StoredAuthenticationPasskey,
                'createdAt' | 'id' | 'lastUsedAt' | 'name'
            >
        >
    > {
        await this.requireActiveSession(input);
        const passkeys = await this.dependencies.store.listActivePasskeys(
            input.userId,
        );
        return passkeys.map(({ createdAt, id, lastUsedAt, name }) => ({
            createdAt,
            id,
            lastUsedAt,
            name,
        }));
    }

    public async renamePasskey(input: {
        context: AuthenticationRequestContext;
        name: string;
        passkeyId: string;
        sessionId: string;
        userId: string;
    }): Promise<
        Pick<
            StoredAuthenticationPasskey,
            'createdAt' | 'id' | 'lastUsedAt' | 'name'
        >
    > {
        try {
            await this.requireActiveSession(input);
            const renamed = await this.dependencies.store.renamePasskey({
                name: input.name,
                now: this.dependencies.clock.now(),
                passkeyId: input.passkeyId,
                userId: input.userId,
            });
            if (!renamed) {
                throw new PasskeyOperationFailedError();
            }
            await this.record({
                context: input.context,
                eventType: 'auth.passkey_rename',
                metadata: { passkeyId: renamed.id },
                outcome: 'success',
                userId: input.userId,
            });
            return {
                createdAt: renamed.createdAt,
                id: renamed.id,
                lastUsedAt: renamed.lastUsedAt,
                name: renamed.name,
            };
        } catch (error) {
            await this.recordFailure(
                input.context,
                'auth.passkey_rename',
                'failed',
                input.userId,
            );
            throw error;
        }
    }

    public async revokePasskey(input: {
        context: AuthenticationRequestContext;
        passkeyId: string;
        sessionId: string;
        userId: string;
    }): Promise<{ status: 'passkey_revoked' }> {
        try {
            const { session } = await this.requireActiveSession(input);
            if (
                !this.dependencies.sessionIssuer.isRecentlyAuthenticated(
                    session,
                )
            ) {
                throw new RecentAuthenticationRequiredError();
            }
            const revoked = await this.dependencies.store.revokePasskey({
                now: this.dependencies.clock.now(),
                passkeyId: input.passkeyId,
                sessionId: input.sessionId,
                userId: input.userId,
            });
            if (!revoked) {
                throw new PasskeyOperationFailedError();
            }
            await this.record({
                context: input.context,
                eventType: 'auth.passkey_revoke',
                metadata: { passkeyId: input.passkeyId },
                outcome: 'success',
                userId: input.userId,
            });
            return { status: 'passkey_revoked' };
        } catch (error) {
            await this.recordFailure(
                input.context,
                'auth.passkey_revoke',
                'failed',
                input.userId,
            );
            throw error;
        }
    }

    public async beginPasskeyRegistration(input: {
        context: AuthenticationRequestContext;
        sessionId: string;
        userId: string;
    }): Promise<{
        expiresAt: Date;
        flowId: string;
        options: Awaited<
            ReturnType<PasskeyVerifier['generateRegistrationOptions']>
        >;
    }> {
        const { account, session } = await this.requireActiveSession(input);
        if (!this.dependencies.sessionIssuer.isRecentlyAuthenticated(session)) {
            throw new RecentAuthenticationRequiredError();
        }
        await this.limit(input.context, [
            ['passkey.registration.user', input.userId, 10, 15 * 60 * 1_000],
            [
                'passkey.registration.client',
                input.context.clientAddress,
                30,
                15 * 60 * 1_000,
            ],
        ]);
        const existing = await this.dependencies.store.listActivePasskeys(
            input.userId,
        );
        const userHandle = Buffer.from(account.userId, 'utf8').toString(
            'base64url',
        );
        const options =
            await this.dependencies.passkeyVerifier.generateRegistrationOptions(
                {
                    displayName: account.email,
                    excludeCredentials: existing.map((passkey) => ({
                        id: passkey.credentialId,
                        transports: passkey.transports,
                        type: 'public-key' as const,
                    })),
                    userHandle,
                    userName: account.email,
                },
            );
        const flowId = this.dependencies.ids.generate();
        await this.dependencies.webAuthnChallenges.issue(
            {
                challenge: options.challenge,
                id: flowId,
                purpose: 'registration',
                userId: input.userId,
            },
            this.operationOptions(input.context),
        );
        return {
            expiresAt: new Date(
                this.dependencies.clock.now().getTime() + 5 * 60 * 1_000,
            ),
            flowId,
            options,
        };
    }

    public async finishPasskeyRegistration(input: {
        context: AuthenticationRequestContext;
        credential: PasskeyRegistrationCredential;
        flowId: string;
        name: string;
        sessionId: string;
        userId: string;
    }): Promise<{
        passkey: Pick<
            StoredAuthenticationPasskey,
            'createdAt' | 'id' | 'lastUsedAt' | 'name'
        >;
        status: 'passkey_registered';
    }> {
        try {
            await this.limit(input.context, [
                [
                    'passkey.registration.finish.user',
                    input.userId,
                    10,
                    15 * 60_000,
                ],
                [
                    'passkey.registration.finish.client',
                    input.context.clientAddress,
                    30,
                    15 * 60_000,
                ],
            ]);
            const { session } = await this.requireActiveSession(input);
            if (
                !this.dependencies.sessionIssuer.isRecentlyAuthenticated(
                    session,
                )
            ) {
                throw new RecentAuthenticationRequiredError();
            }
            const challenge =
                await this.dependencies.webAuthnChallenges.consume(
                    input.flowId,
                    this.operationOptions(input.context),
                );
            if (
                !challenge ||
                challenge.purpose !== 'registration' ||
                challenge.userId !== input.userId
            ) {
                throw new PasskeyOperationFailedError();
            }
            const verified =
                await this.dependencies.passkeyVerifier.verifyRegistration({
                    credential: input.credential,
                    expectedChallenge: challenge.challenge,
                });
            const now = this.dependencies.clock.now();
            const passkey: StoredAuthenticationPasskey = {
                backedUp: verified.backedUp,
                counter: verified.counter,
                createdAt: now,
                credentialId: verified.credentialId,
                credentialPublicKey: verified.credentialPublicKey,
                deviceType: verified.deviceType,
                id: this.dependencies.ids.generate(),
                lastUsedAt: null,
                name: input.name.trim(),
                revokedAt: null,
                transports: verified.transports,
                userHandle: Buffer.from(input.userId, 'utf8').toString(
                    'base64url',
                ),
                userId: input.userId,
            };
            const registered = await this.dependencies.store.registerPasskey({
                now,
                passkey,
                sessionId: input.sessionId,
                userId: input.userId,
            });
            if (!registered) {
                throw new PasskeyOperationFailedError();
            }
            await this.record({
                context: input.context,
                eventType: 'auth.passkey_registration',
                metadata: { passkeyId: passkey.id },
                outcome: 'success',
                sessionId: input.sessionId,
                userId: input.userId,
            });
            return {
                passkey: {
                    createdAt: passkey.createdAt,
                    id: passkey.id,
                    lastUsedAt: passkey.lastUsedAt,
                    name: passkey.name,
                },
                status: 'passkey_registered',
            };
        } catch (error) {
            await this.recordFailure(
                input.context,
                'auth.passkey_registration',
                'failed',
                input.userId,
            );
            throw error;
        }
    }

    public async beginPasskeyAuthentication(input: {
        context: AuthenticationRequestContext;
    }): Promise<{
        expiresAt: Date;
        flowId: string;
        options: Awaited<
            ReturnType<PasskeyVerifier['generateAuthenticationOptions']>
        >;
    }> {
        await this.limit(input.context, [
            [
                'passkey.authentication.client',
                input.context.clientAddress,
                30,
                15 * 60 * 1_000,
            ],
        ]);
        const options =
            await this.dependencies.passkeyVerifier.generateAuthenticationOptions();
        const flowId = this.dependencies.ids.generate();
        await this.dependencies.webAuthnChallenges.issue(
            {
                challenge: options.challenge,
                id: flowId,
                purpose: 'authentication',
                userId: null,
            },
            this.operationOptions(input.context),
        );
        return {
            expiresAt: new Date(
                this.dependencies.clock.now().getTime() + 5 * 60 * 1_000,
            ),
            flowId,
            options,
        };
    }

    public async finishPasskeyAuthentication(input: {
        clientLabel?: string;
        context: AuthenticationRequestContext;
        credential: PasskeyAuthenticationCredential;
        flowId: string;
    }): Promise<AuthenticationSuccess> {
        let auditedUserId: string | undefined;
        try {
            await this.limit(input.context, [
                [
                    'passkey.authentication.finish.flow',
                    input.flowId,
                    5,
                    5 * 60_000,
                ],
                [
                    'passkey.authentication.finish.client',
                    input.context.clientAddress,
                    30,
                    15 * 60_000,
                ],
            ]);
            const challenge =
                await this.dependencies.webAuthnChallenges.consume(
                    input.flowId,
                    this.operationOptions(input.context),
                );
            if (!challenge || challenge.purpose !== 'authentication') {
                throw new PasskeyOperationFailedError();
            }
            const passkey =
                await this.dependencies.store.findPasskeyByCredentialId(
                    input.credential.id,
                );
            if (!passkey || passkey.revokedAt) {
                throw new PasskeyOperationFailedError();
            }
            auditedUserId = passkey.userId;
            const verified =
                await this.dependencies.passkeyVerifier.verifyAuthentication({
                    credential: input.credential,
                    expectedChallenge: challenge.challenge,
                    storedCredential: {
                        backedUp: passkey.backedUp,
                        counter: passkey.counter,
                        credentialId: passkey.credentialId,
                        credentialPublicKey: passkey.credentialPublicKey,
                        deviceType: passkey.deviceType,
                        transports: passkey.transports,
                        userHandle: passkey.userHandle,
                    },
                });
            if (
                verified.credentialId !== passkey.credentialId ||
                verified.userHandle !== passkey.userHandle
            ) {
                throw new PasskeyOperationFailedError();
            }
            const prepared =
                await this.dependencies.sessionIssuer.prepareInitial({
                    ...(input.clientLabel === undefined
                        ? {}
                        : { clientLabel: input.clientLabel }),
                    method: 'passkey',
                    userId: passkey.userId,
                });
            const result =
                await this.dependencies.store.commitPasskeyAuthentication({
                    expectedCounter: passkey.counter,
                    now: this.dependencies.clock.now(),
                    passkeyId: passkey.id,
                    session: prepared.storedSession,
                    verifiedBackedUp: verified.backedUp,
                    verifiedCounter: verified.counter,
                    verifiedDeviceType: verified.deviceType,
                });
            if (result.kind !== 'authenticated') {
                throw new PasskeyOperationFailedError();
            }
            await this.record({
                context: input.context,
                eventType: 'auth.passkey_authentication',
                metadata: { passkeyId: passkey.id },
                outcome: 'success',
                sessionId: prepared.storedSession.id,
                userId: passkey.userId,
            });
            return this.dependencies.sessionIssuer.toSuccess(
                prepared,
                result.account,
            );
        } catch (error) {
            await this.recordFailure(
                input.context,
                'auth.passkey_authentication',
                'failed',
                auditedUserId,
            );
            throw error;
        }
    }

    private assertEmailAvailable(): void {
        if (!this.dependencies.emailSender.capability().available) {
            throw new AuthenticationCapabilityUnavailableError();
        }
    }

    private createChallenge(input: {
        emailId: string;
        now: Date;
        purpose: VerificationChallengePurpose;
        sendCount?: number;
        userId: string;
    }): { challenge: NewStoredVerificationChallenge; code: string } {
        const flowId = this.dependencies.ids.generate();
        const code = this.dependencies.codeGenerator.generate();
        const codeDigest = this.dependencies.codeDigester.digest({
            code,
            flowId,
            purpose: input.purpose,
            userId: input.userId,
        });
        return {
            challenge: {
                attemptsUsed: 0,
                codeDigest,
                consumedAt: null,
                emailId: input.emailId,
                expiresAt: new Date(input.now.getTime() + challengeLifetimeMs),
                flowId,
                invalidatedAt: null,
                issuedAt: input.now,
                lastSentAt: input.now,
                purpose: input.purpose,
                sendCount: input.sendCount ?? 1,
                userId: input.userId,
            },
            code,
        };
    }

    private createCredential(
        userId: string,
        hash: PasswordHash,
        now: Date,
        createdAt = now,
    ): StoredPasswordCredential {
        return {
            createdAt,
            encoded: hash.encoded,
            parametersVersion: hash.parametersVersion,
            updatedAt: now,
            userId,
        };
    }

    private codeMatches(
        challenge: StoredVerificationChallenge,
        code: string,
    ): boolean {
        return this.dependencies.codeDigester.matches({
            code,
            digest: challenge.codeDigest,
            flowId: challenge.flowId,
            purpose: challenge.purpose,
            userId: challenge.userId,
        });
    }

    private async limit(
        context: AuthenticationRequestContext,
        limits: Array<
            [
                scope: string,
                subject: string,
                limit: number,
                windowMs: number,
                resolveSubjectAlias?: boolean,
            ]
        >,
    ): Promise<void> {
        for (const [
            scope,
            subject,
            limit,
            windowMs,
            resolveSubjectAlias,
        ] of limits) {
            const decision = await this.dependencies.rateLimiter.consume({
                limit,
                ...(resolveSubjectAlias ? { resolveSubjectAlias: true } : {}),
                scope,
                ...(context.signal ? { signal: context.signal } : {}),
                subject,
                windowMs,
            });
            if (!decision.allowed) {
                throw new RateLimitExceededError(decision.retryAfterSeconds);
            }
        }
    }

    private linkRateLimitSubject(
        context: AuthenticationRequestContext,
        input: { alias: string; scope: string; subject: string; ttlMs: number },
    ): Promise<void> {
        return this.dependencies.rateLimiter.linkSubject({
            ...input,
            ...(context.signal ? { signal: context.signal } : {}),
        });
    }

    private async record(input: {
        context: AuthenticationRequestContext;
        errorCategory?: string;
        eventType: string;
        metadata?: SecurityEvent['metadata'];
        outcome: SecurityEvent['outcome'];
        sessionId?: string;
        userId?: string;
    }): Promise<void> {
        const event: SecurityEvent = {
            correlationId: input.context.correlationId,
            eventType: input.eventType,
            ...(input.metadata ? { metadata: input.metadata } : {}),
            occurredAt: this.dependencies.clock.now(),
            outcome: input.outcome,
            ...(input.errorCategory
                ? { errorCategory: input.errorCategory }
                : {}),
            ...(input.sessionId ? { sessionId: input.sessionId } : {}),
            ...(input.userId ? { userId: input.userId } : {}),
        };
        // Recording must never turn an already committed authentication mutation
        // into an externally reported failure. The recorder owns its own alerting.
        await this.dependencies.securityEvents
            .record(event)
            .catch(() => undefined);
    }

    private recordFailure(
        context: AuthenticationRequestContext,
        eventType: string,
        errorCategory: string,
        userId?: string,
    ): Promise<void> {
        return this.record({
            context,
            errorCategory,
            eventType,
            outcome: 'failure',
            ...(userId ? { userId } : {}),
        });
    }

    private syntheticFlow(now: Date): VerificationFlowResult {
        return {
            expiresAt: new Date(now.getTime() + challengeLifetimeMs),
            flowId: this.dependencies.ids.generate(),
            resendAvailableAt: new Date(now.getTime() + resendCooldownMs),
        };
    }

    private operationOptions(
        context: AuthenticationRequestContext,
    ): { signal: AbortSignal } | undefined {
        return context.signal ? { signal: context.signal } : undefined;
    }

    private toFlow(
        challenge: StoredVerificationChallenge,
    ): VerificationFlowResult {
        return {
            expiresAt: challenge.expiresAt,
            flowId: challenge.flowId,
            resendAvailableAt: new Date(
                challenge.lastSentAt.getTime() + resendCooldownMs,
            ),
        };
    }
}
