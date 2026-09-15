import { describe, expect, it, vi } from 'vitest';

import {
    AuthenticationRequiredError,
    InvalidCredentialsError,
    VerificationFailedError,
} from '../../../../../src/modules/authentication/application/authentication-errors';
import { AuthenticationService } from '../../../../../src/modules/authentication/application/authentication-service';
import type { AuthenticationServiceDependencies } from '../../../../../src/modules/authentication/application/authentication-service';
import type {
    AuthenticationAccount,
    AuthStore,
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
} from '../../../../../src/modules/authentication/application/ports/auth-store';
import type { PasswordHash } from '../../../../../src/modules/authentication/application/ports/password-hasher';
import type { SecurityEvent } from '../../../../../src/modules/authentication/application/ports/security-event';
import { SessionIssuer } from '../../../../../src/modules/authentication/application/session-issuer';
import { PasswordPolicy } from '../../../../../src/modules/authentication/domain/password-policy';

const now = new Date('2026-08-13T12:00:00.000Z');
const password = 'correct horse battery';

class MemoryStore implements AuthStore {
    public accounts = new Map<string, AuthenticationAccount>();
    public challenges = new Map<string, StoredVerificationChallenge>();
    public sessions = new Map<string, StoredAuthenticationSession>();
    public passkeys = new Map<string, StoredAuthenticationPasskey>();

    public async findAccountByCanonicalEmail(email: string) {
        return (
            [...this.accounts.values()].find(
                (account) => account.email.toLowerCase() === email,
            ) ?? null
        );
    }
    public async findAccountByUserId(userId: string) {
        return this.accounts.get(userId) ?? null;
    }
    public async findChallenge(input: {
        flowId: string;
        purpose: StoredVerificationChallenge['purpose'];
    }) {
        const challenge = this.challenges.get(input.flowId);
        return challenge?.purpose === input.purpose ? challenge : null;
    }
    public async findActiveChallengeForUser(input: {
        purpose: StoredVerificationChallenge['purpose'];
        userId: string;
    }) {
        return (
            [...this.challenges.values()].find(
                (challenge) =>
                    challenge.userId === input.userId &&
                    challenge.purpose === input.purpose &&
                    !challenge.consumedAt &&
                    !challenge.invalidatedAt,
            ) ?? null
        );
    }
    public async findPasskeyByCredentialId(credentialId: string) {
        return (
            [...this.passkeys.values()].find(
                (passkey) => passkey.credentialId === credentialId,
            ) ?? null
        );
    }
    public async findPasskeyById(input: { passkeyId: string; userId: string }) {
        const passkey = this.passkeys.get(input.passkeyId);
        return passkey?.userId === input.userId ? passkey : null;
    }
    public async findRefreshSessionByDigest(digest: string) {
        return (
            [...this.sessions.values()].find(
                (session) => session.refreshDigest === digest,
            ) ?? null
        );
    }
    public async getActiveSession(input: {
        now: Date;
        sessionId: string;
        userId: string;
    }) {
        const session = this.sessions.get(input.sessionId);
        return session?.userId === input.userId &&
            !session.revokedAt &&
            session.absoluteExpiresAt > input.now
            ? session
            : null;
    }
    public async registerOrReplacePendingSignup(input: {
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
        const existing = await this.findAccountByCanonicalEmail(
            input.account.canonicalEmail,
        );
        if (existing?.status === 'active') return 'active_noop';
        const account: AuthenticationAccount = existing
            ? { ...existing, passwordCredential: input.credential }
            : {
                  createdAt: input.account.createdAt,
                  email: input.account.email,
                  emailId: input.account.emailId,
                  emailVerifiedAt: null,
                  handle: null,
                  passwordCredential: input.credential,
                  status: 'pending',
                  userId: input.account.userId,
              };
        for (const [id, challenge] of this.challenges) {
            if (
                challenge.userId === account.userId &&
                challenge.purpose === 'email_verification'
            )
                this.challenges.set(id, {
                    ...challenge,
                    invalidatedAt: input.challenge.issuedAt,
                });
        }
        this.accounts.set(account.userId, account);
        this.challenges.set(input.challenge.flowId, input.challenge);
        return 'pending_created';
    }
    public async replaceEmailVerificationChallenge(input: {
        challenge: NewStoredVerificationChallenge;
        previousFlowId: string;
    }): Promise<ChallengeIssueResult> {
        const previous = this.challenges.get(input.previousFlowId);
        if (!previous) return { kind: 'noop' };
        if (
            input.challenge.issuedAt.getTime() - previous.lastSentAt.getTime() <
            60_000
        )
            return { kind: 'limited', retryAfterSeconds: 60 };
        this.challenges.set(previous.flowId, {
            ...previous,
            invalidatedAt: input.challenge.issuedAt,
        });
        this.challenges.set(input.challenge.flowId, input.challenge);
        return {
            kind: 'issued',
            recipient: this.accounts.get(previous.userId)!.email,
        };
    }
    public async issuePasswordResetChallenge(input: {
        challenge: NewStoredVerificationChallenge;
        expectedStatus: 'active';
    }): Promise<ChallengeIssueResult> {
        const account = this.accounts.get(input.challenge.userId);
        if (account?.status !== input.expectedStatus) return { kind: 'noop' };
        this.challenges.set(input.challenge.flowId, input.challenge);
        return { kind: 'issued', recipient: account.email };
    }
    public async commitEmailVerification(input: {
        codeMatches: boolean;
        flowId: string;
        now: Date;
        session: NewStoredAuthenticationSession;
    }): Promise<EmailVerificationCommitResult> {
        const challenge = this.challenges.get(input.flowId);
        if (
            !challenge ||
            challenge.consumedAt ||
            challenge.invalidatedAt ||
            input.now >= challenge.expiresAt ||
            challenge.attemptsUsed >= 5
        )
            return { kind: 'unavailable' };
        if (!input.codeMatches) {
            this.challenges.set(input.flowId, {
                ...challenge,
                attemptsUsed: challenge.attemptsUsed + 1,
            });
            return { kind: 'incorrect' };
        }
        const account = this.accounts.get(challenge.userId)!;
        const active: AuthenticationAccount = {
            ...account,
            emailVerifiedAt: input.now,
            status: 'active',
        };
        this.accounts.set(active.userId, active);
        this.challenges.set(input.flowId, {
            ...challenge,
            consumedAt: input.now,
        });
        this.sessions.set(input.session.id, input.session);
        return { account: active, kind: 'verified' };
    }
    public async issueSessionForActiveUser(input: {
        expectedPasswordHash?: string;
        replacementCredential?: StoredPasswordCredential;
        session: NewStoredAuthenticationSession;
        userId: string;
    }): Promise<SessionIssueCommitResult> {
        const account = this.accounts.get(input.userId);
        if (
            !account ||
            account.status !== 'active' ||
            (input.expectedPasswordHash &&
                account.passwordCredential?.encoded !==
                    input.expectedPasswordHash)
        )
            return { kind: 'unavailable' };
        const updated = input.replacementCredential
            ? { ...account, passwordCredential: input.replacementCredential }
            : account;
        this.accounts.set(input.userId, updated);
        this.sessions.set(input.session.id, input.session);
        return { account: updated, kind: 'issued' };
    }
    public async commitPasswordReset(input: {
        codeMatches: boolean;
        flowId: string;
        newCredential: StoredPasswordCredential;
        now: Date;
    }): Promise<PasswordResetCommitResult> {
        const challenge = this.challenges.get(input.flowId);
        if (
            !challenge ||
            challenge.consumedAt ||
            input.now >= challenge.expiresAt
        )
            return 'unavailable';
        if (!input.codeMatches) {
            this.challenges.set(input.flowId, {
                ...challenge,
                attemptsUsed: challenge.attemptsUsed + 1,
            });
            return 'incorrect';
        }
        const account = this.accounts.get(challenge.userId)!;
        this.accounts.set(account.userId, {
            ...account,
            passwordCredential: input.newCredential,
        });
        this.challenges.set(challenge.flowId, {
            ...challenge,
            consumedAt: input.now,
        });
        for (const [id, session] of this.sessions)
            if (session.userId === account.userId)
                this.sessions.set(id, {
                    ...session,
                    revokedAt: input.now,
                    revocationReason: 'password_reset',
                });
        return 'reset';
    }
    public async changePasswordAndReplaceSessions(input: {
        expectedPasswordHash: string;
        newCredential: StoredPasswordCredential;
        replacementSession: NewStoredAuthenticationSession;
        revokedAt: Date;
        userId: string;
    }): Promise<SessionIssueCommitResult> {
        const account = this.accounts.get(input.userId);
        if (
            !account ||
            account.passwordCredential?.encoded !== input.expectedPasswordHash
        )
            return { kind: 'unavailable' };
        for (const [id, session] of this.sessions)
            if (session.userId === input.userId)
                this.sessions.set(id, {
                    ...session,
                    revokedAt: input.revokedAt,
                    revocationReason: 'password_change',
                });
        const updated = { ...account, passwordCredential: input.newCredential };
        this.accounts.set(input.userId, updated);
        this.sessions.set(
            input.replacementSession.id,
            input.replacementSession,
        );
        return { account: updated, kind: 'issued' };
    }
    public async rotateRefreshSession(input: {
        digest: string;
        now: Date;
        successor: NewStoredAuthenticationSession;
    }): Promise<RefreshRotationCommitResult> {
        const prior = await this.findRefreshSessionByDigest(input.digest);
        if (!prior || prior.revokedAt || input.now >= prior.absoluteExpiresAt)
            return { kind: 'unavailable' };
        if (prior.consumedAt) {
            for (const [id, session] of this.sessions)
                if (session.familyId === prior.familyId)
                    this.sessions.set(id, {
                        ...session,
                        revokedAt: input.now,
                        revocationReason: 'refresh_replay',
                    });
            return { kind: 'replay' };
        }
        this.sessions.set(prior.id, {
            ...prior,
            consumedAt: input.now,
            successorId: input.successor.id,
        });
        this.sessions.set(input.successor.id, input.successor);
        return { account: this.accounts.get(prior.userId)!, kind: 'rotated' };
    }
    public async revokeAllSessions(input: {
        reason:
            | 'logout_all'
            | 'password_change'
            | 'password_reset'
            | 'disabled_user'
            | 'logout'
            | 'refresh_replay';
        revokedAt: Date;
        userId: string;
    }) {
        for (const [id, session] of this.sessions)
            if (session.userId === input.userId)
                this.sessions.set(id, {
                    ...session,
                    revokedAt: input.revokedAt,
                    revocationReason: input.reason,
                });
    }
    public async revokeSessionFamilyByDigest(input: {
        digest: string;
        reason:
            | 'logout_all'
            | 'password_change'
            | 'password_reset'
            | 'disabled_user'
            | 'logout'
            | 'refresh_replay';
        revokedAt: Date;
    }) {
        const session = await this.findRefreshSessionByDigest(input.digest);
        if (session)
            for (const [id, familySession] of this.sessions)
                if (familySession.familyId === session.familyId)
                    this.sessions.set(id, {
                        ...familySession,
                        revokedAt: input.revokedAt,
                        revocationReason: input.reason,
                    });
    }
    public async listActivePasskeys(userId: string) {
        return [...this.passkeys.values()].filter(
            (passkey) => passkey.userId === userId && !passkey.revokedAt,
        );
    }
    public async registerPasskey(input: {
        now: Date;
        passkey: NewStoredAuthenticationPasskey;
        sessionId: string;
        userId: string;
    }) {
        this.passkeys.set(input.passkey.id, input.passkey);
        return true;
    }
    public async renamePasskey(input: {
        name: string;
        now: Date;
        passkeyId: string;
        userId: string;
    }) {
        const passkey = await this.findPasskeyById(input);
        if (!passkey) return null;
        const renamed = { ...passkey, name: input.name.trim() };
        this.passkeys.set(passkey.id, renamed);
        return renamed;
    }
    public async revokePasskey(input: {
        now: Date;
        passkeyId: string;
        sessionId: string;
        userId: string;
    }) {
        const passkey = await this.findPasskeyById(input);
        if (!passkey) return false;
        this.passkeys.set(passkey.id, { ...passkey, revokedAt: input.now });
        return true;
    }
    public async commitPasskeyAuthentication(_input: {
        expectedCounter: number;
        now: Date;
        passkeyId: string;
        session: NewStoredAuthenticationSession;
        verifiedBackedUp: boolean;
        verifiedCounter: number;
        verifiedDeviceType: 'multi_device' | 'single_device';
    }): Promise<PasskeyAuthenticationCommitResult> {
        return { kind: 'unavailable' };
    }
}

function credential(
    userId: string,
    encoded = `hash:${password}`,
): StoredPasswordCredential {
    return {
        createdAt: now,
        encoded,
        parametersVersion: 1,
        updatedAt: now,
        userId,
    };
}

function activeAccount(userId = 'user-1'): AuthenticationAccount {
    return {
        createdAt: now,
        email: 'user@example.com',
        emailId: 'email-1',
        emailVerifiedAt: now,
        handle: null,
        passwordCredential: credential(userId),
        status: 'active',
        userId,
    };
}

function createHarness(
    overrides: Partial<AuthenticationServiceDependencies> = {},
) {
    const store = new MemoryStore();
    let id = 0;
    const ids = { generate: () => `id-${++id}` };
    const refreshCredentials = {
        digest: (value: string) => `digest:${value}`,
        issue: () => {
            const value = `refresh-${++id}`;
            return { digest: `digest:${value}`, value };
        },
    };
    const passwordHasher = {
        hash: vi.fn(async (value: string) => ({
            encoded: `hash:${value}`,
            parametersVersion: 1,
        })),
        verify: vi.fn(async (value: string, hash: PasswordHash) => ({
            matches: hash.encoded === `hash:${value}`,
            needsRehash: false,
        })),
    };
    const sessionIssuer = new SessionIssuer(
        { now: () => now },
        ids,
        refreshCredentials,
        {
            sign: async (claims) => `jwt.${claims.sessionId}.signed`,
            verify: async () => {
                throw new Error('unused');
            },
        },
        {
            accessTokenAudience: 'web',
            accessTokenIssuer: 'languon',
            accessTokenTtlMs: 15 * 60_000,
            refreshTokenTtlMs: 14 * 24 * 60 * 60_000,
        },
    );
    const sent: unknown[] = [];
    const events: SecurityEvent[] = [];
    const service = new AuthenticationService({
        clock: { now: () => now },
        codeDigester: {
            digest: ({ code, flowId }) => `${flowId}:${code}`,
            matches: ({ code, digest, flowId }) =>
                digest === `${flowId}:${code}`,
        },
        codeGenerator: { generate: () => '0000' },
        dummyPasswordHash: {
            encoded: 'hash:dummy password value',
            parametersVersion: 1,
        },
        emailSender: {
            capability: () => ({ available: true, delivery: 'development' }),
            sendVerificationCode: async (message) => {
                sent.push(message);
            },
        },
        ids,
        passwordHasher,
        passwordPolicy: new PasswordPolicy(),
        rateLimiter: {
            consume: async ({ limit }) => ({
                allowed: true,
                limit,
                remaining: limit - 1,
                retryAfterSeconds: 1,
            }),
            linkSubject: async () => undefined,
        },
        refreshCredentials,
        securityEvents: {
            record: async (event) => {
                events.push(event);
            },
        },
        sessionIssuer,
        store,
        passkeyVerifier: {
            generateAuthenticationOptions: async () => {
                throw new Error('unused');
            },
            generateRegistrationOptions: async () => {
                throw new Error('unused');
            },
            verifyAuthentication: async () => {
                throw new Error('unused');
            },
            verifyRegistration: async () => {
                throw new Error('unused');
            },
        },
        webAuthnChallenges: {
            consume: async () => null,
            issue: async () => undefined,
        },
        ...overrides,
    });
    return { events, passwordHasher, sent, service, store };
}

const context = { clientAddress: '127.0.0.1', correlationId: 'test' };

describe('AuthenticationService', () => {
    it('creates and safely replaces a pending signup, but leaves an active account unchanged', async () => {
        const { sent, service, store } = createHarness();
        const first = await service.signUp({
            context,
            email: ' User@Example.com ',
            password,
        });
        const account =
            await store.findAccountByCanonicalEmail('user@example.com');
        expect(first.status).toBe('verification_pending');
        expect(sent).toHaveLength(1);
        await service.signUp({
            context,
            email: 'user@example.com',
            password: 'another correct password',
        });
        expect(
            store.challenges.get(first.verification.flowId)?.invalidatedAt,
        ).toEqual(now);
        expect(
            (await store.findAccountByCanonicalEmail('user@example.com'))
                ?.passwordCredential?.encoded,
        ).toBe('hash:another correct password');
        const replaced =
            await store.findAccountByCanonicalEmail('user@example.com');
        store.accounts.set(account!.userId, {
            ...replaced!,
            emailVerifiedAt: now,
            status: 'active',
        });
        await service.signUp({
            context,
            email: 'user@example.com',
            password: 'third correct password',
        });
        expect(
            (await store.findAccountByCanonicalEmail('user@example.com'))
                ?.passwordCredential?.encoded,
        ).toBe('hash:another correct password');
        expect(sent).toHaveLength(2);
    });

    it('verifies a code once and issues a session', async () => {
        const { service, store } = createHarness();
        const signup = await service.signUp({
            context,
            email: 'user@example.com',
            password,
        });
        const success = await service.verifyEmail({
            code: '0000',
            context,
            flowId: signup.verification.flowId,
        });
        expect(success.status).toBe('authenticated');
        expect(success.user.status).toBe('active');
        expect(store.sessions).toHaveLength(1);
        await expect(
            service.verifyEmail({
                code: '0000',
                context,
                flowId: signup.verification.flowId,
            }),
        ).rejects.toBeInstanceOf(VerificationFailedError);
    });

    it('runs dummy password verification for an unknown account and exposes generic credentials failure', async () => {
        const { passwordHasher, service } = createHarness();
        await expect(
            service.passwordLogin({
                context,
                email: 'missing@example.com',
                password,
            }),
        ).rejects.toBeInstanceOf(InvalidCredentialsError);
        expect(passwordHasher.verify).toHaveBeenCalledWith(
            password,
            { encoded: 'hash:dummy password value', parametersVersion: 1 },
            undefined,
        );
    });

    it('recovers a concurrent opportunistic rehash login by verifying the current hash', async () => {
        const { passwordHasher, service, store } = createHarness();
        const account = activeAccount();
        store.accounts.set(account.userId, {
            ...account,
            passwordCredential: credential(
                account.userId,
                `hash:legacy:${password}`,
            ),
        });
        passwordHasher.verify.mockImplementation(async (value, hash) => ({
            matches:
                hash.encoded === `hash:legacy:${value}` ||
                hash.encoded === `hash:${value}`,
            needsRehash: hash.encoded.startsWith('hash:legacy:'),
        }));

        const results = await Promise.all([
            service.passwordLogin({ context, email: account.email, password }),
            service.passwordLogin({ context, email: account.email, password }),
        ]);

        expect(results).toHaveLength(2);
        expect(store.sessions).toHaveLength(2);
        expect(passwordHasher.verify).toHaveBeenCalledWith(
            password,
            { ...credential(account.userId), encoded: `hash:${password}` },
            undefined,
        );
    });

    it('returns verification-required only after a pending password is proven', async () => {
        const { service } = createHarness();
        const signup = await service.signUp({
            context,
            email: 'user@example.com',
            password,
        });
        await expect(
            service.passwordLogin({
                context,
                email: 'user@example.com',
                password,
            }),
        ).resolves.toEqual({
            status: 'email_verification_required',
            verification: signup.verification,
        });
    });

    it('resets the password atomically and revokes existing sessions', async () => {
        const { service, store } = createHarness();
        const account = activeAccount();
        store.accounts.set(account.userId, account);
        const login = await service.passwordLogin({
            context,
            email: account.email,
            password,
        });
        const forgot = await service.forgotPassword({
            context,
            email: account.email,
        });
        await service.resetPassword({
            code: '0000',
            context,
            flowId: forgot.recovery.flowId,
            newPassword: 'replacement password phrase',
        });
        expect(
            store.accounts.get(account.userId)?.passwordCredential?.encoded,
        ).toBe('hash:replacement password phrase');
        const storedSession = store.sessions.get(
            (login as { session: { id: string } }).session.id,
        );
        expect(storedSession?.revocationReason).toBe('password_reset');
    });

    it('rotates refresh credentials without extending absolute expiry and revokes the family on replay', async () => {
        const { events, service, store } = createHarness();
        const account = activeAccount();
        store.accounts.set(account.userId, account);
        const login = await service.passwordLogin({
            context,
            email: account.email,
            password,
        });
        const originalExpiry = (login as { session: { expiresAt: Date } })
            .session.expiresAt;
        const refreshed = await service.refresh({
            context,
            refreshCredential: (login as { refreshCredential: string })
                .refreshCredential,
        });
        expect(refreshed.session.expiresAt).toEqual(originalExpiry);
        await expect(
            service.refresh({
                context,
                refreshCredential: (login as { refreshCredential: string })
                    .refreshCredential,
            }),
        ).rejects.toBeInstanceOf(AuthenticationRequiredError);
        expect(
            [...store.sessions.values()]
                .filter(
                    (session) =>
                        session.familyId ===
                        [...store.sessions.values()][0]?.familyId,
                )
                .every(
                    (session) => session.revocationReason === 'refresh_replay',
                ),
        ).toBe(true);
        expect(events).toContainEqual(
            expect.objectContaining({
                errorCategory: 'replay',
                eventType: 'auth.session_refresh',
                outcome: 'failure',
                userId: account.userId,
            }),
        );
        expect(JSON.stringify(events)).not.toContain('refresh-');
    });

    it('applies generic public cooldown limits before resend and forgot-password lookup', async () => {
        const requests: Array<{ scope: string; subject: string }> = [];
        const { service, store } = createHarness({
            rateLimiter: {
                consume: async (request) => {
                    requests.push(request);
                    return {
                        allowed: false,
                        limit: request.limit,
                        remaining: 0,
                        retryAfterSeconds: 60,
                    };
                },
                linkSubject: async () => undefined,
            },
        });
        const lookup = vi.spyOn(store, 'findChallenge');
        const accountLookup = vi.spyOn(store, 'findAccountByCanonicalEmail');

        await expect(
            service.resendEmailVerification({ context, flowId: 'opaque-flow' }),
        ).rejects.toMatchObject({ retryAfterSeconds: 60 });
        await expect(
            service.forgotPassword({ context, email: 'unknown@example.com' }),
        ).rejects.toMatchObject({ retryAfterSeconds: 60 });

        expect(lookup).not.toHaveBeenCalled();
        expect(accountLookup).not.toHaveBeenCalled();
        expect(requests.map(({ scope }) => scope)).toEqual([
            'verification.email_send.cooldown',
            'password.forgot.cooldown',
        ]);
    });

    it('records coarse passkey management events without names or credential material', async () => {
        const { events, service, store } = createHarness();
        const account = activeAccount();
        store.accounts.set(account.userId, account);
        const login = await service.passwordLogin({
            context,
            email: account.email,
            password,
        });
        if (login.status !== 'authenticated') throw new Error('Login failed.');
        const passkey: StoredAuthenticationPasskey = {
            backedUp: false,
            counter: 0,
            createdAt: now,
            credentialId: 'raw-credential-material',
            credentialPublicKey: new Uint8Array([1, 2, 3]),
            deviceType: 'single_device',
            id: 'passkey-1',
            lastUsedAt: null,
            name: 'Secret passkey name',
            revokedAt: null,
            transports: ['internal'],
            userHandle: 'private-user-handle',
            userId: account.userId,
        };
        store.passkeys.set(passkey.id, passkey);

        await service.renamePasskey({
            context,
            name: 'Renamed secret',
            passkeyId: passkey.id,
            sessionId: login.session.id,
            userId: account.userId,
        });
        await service.revokePasskey({
            context,
            passkeyId: passkey.id,
            sessionId: login.session.id,
            userId: account.userId,
        });
        await expect(
            service.renamePasskey({
                context,
                name: 'Missing',
                passkeyId: 'missing-passkey',
                sessionId: login.session.id,
                userId: account.userId,
            }),
        ).rejects.toBeDefined();

        expect(events).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    eventType: 'auth.passkey_rename',
                    metadata: { passkeyId: passkey.id },
                    outcome: 'success',
                }),
                expect.objectContaining({
                    eventType: 'auth.passkey_revoke',
                    metadata: { passkeyId: passkey.id },
                    outcome: 'success',
                }),
                expect.objectContaining({
                    errorCategory: 'failed',
                    eventType: 'auth.passkey_rename',
                    outcome: 'failure',
                }),
            ]),
        );
        const serialized = JSON.stringify(events);
        expect(serialized).not.toContain(passkey.credentialId);
        expect(serialized).not.toContain(passkey.userHandle);
        expect(serialized).not.toContain('Secret passkey name');
        expect(serialized).not.toContain('Renamed secret');
    });
});
