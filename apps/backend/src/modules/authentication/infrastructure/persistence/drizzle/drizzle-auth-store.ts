import { Buffer } from 'node:buffer';

import { and, eq, gt, gte, isNull, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { databaseSchema } from '../../../../../infrastructure/database/schema';
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
import { EmailAddress } from '../../../../users/domain/email-address';
import {
    userEmailsTable,
    usersTable,
} from '../../../../users/infrastructure/persistence/drizzle/schema';
import { throwMappedAuthenticationConflict } from './drizzle-authentication-repository';
import {
    authPasskeysTable,
    authSessionsTable,
    authVerificationChallengesTable,
    passwordCredentialsTable,
} from './schema';

type AuthenticationDatabase = PostgresJsDatabase<typeof databaseSchema>;
type AuthenticationTransaction = Parameters<
    Parameters<AuthenticationDatabase['transaction']>[0]
>[0];
type QueryDatabase = AuthenticationDatabase | AuthenticationTransaction;

const resendCooldownMilliseconds = 60_000;
const sendWindowMilliseconds = 60 * 60_000;
const recentAuthenticationMilliseconds = 5 * 60_000;
const maximumActivePasskeysPerUser = 50;

interface Argon2Parameters {
    memoryCostKiB: number;
    parallelism: number;
    timeCost: number;
}

function parseArgon2Parameters(encoded: string): Argon2Parameters {
    const sections = encoded.split('$');
    if (
        sections.length !== 6 ||
        sections[1] !== 'argon2id' ||
        sections[2] !== 'v=19'
    ) {
        throw new TypeError(
            'Only a valid encoded Argon2id v=19 hash may be stored.',
        );
    }

    const values = new Map(
        (sections[3] ?? '').split(',').map((pair) => {
            const [name, value] = pair.split('=');
            return [name, Number(value)] as const;
        }),
    );
    const parameters = {
        memoryCostKiB: values.get('m') ?? Number.NaN,
        parallelism: values.get('p') ?? Number.NaN,
        timeCost: values.get('t') ?? Number.NaN,
    };
    if (
        !Number.isSafeInteger(parameters.memoryCostKiB) ||
        !Number.isSafeInteger(parameters.parallelism) ||
        !Number.isSafeInteger(parameters.timeCost)
    ) {
        throw new TypeError('The encoded Argon2id parameters are invalid.');
    }

    return parameters;
}

function passwordInsertValues(credential: StoredPasswordCredential) {
    const parameters = parseArgon2Parameters(credential.encoded);
    return {
        algorithm: 'argon2id',
        algorithmVersion: credential.parametersVersion,
        createdAt: credential.createdAt,
        hash: credential.encoded,
        memoryCostKiB: parameters.memoryCostKiB,
        parallelism: parameters.parallelism,
        timeCost: parameters.timeCost,
        updatedAt: credential.updatedAt,
        userId: credential.userId,
    } as const;
}

async function savePasswordCredential(
    transaction: AuthenticationTransaction,
    credential: StoredPasswordCredential,
): Promise<void> {
    const values = passwordInsertValues(credential);
    await transaction
        .insert(passwordCredentialsTable)
        .values(values)
        .onConflictDoUpdate({
            set: {
                algorithm: values.algorithm,
                algorithmVersion: values.algorithmVersion,
                hash: values.hash,
                memoryCostKiB: values.memoryCostKiB,
                parallelism: values.parallelism,
                timeCost: values.timeCost,
                updatedAt: values.updatedAt,
            },
            target: passwordCredentialsTable.userId,
        });
}

function challengeInsertValues(challenge: NewStoredVerificationChallenge) {
    return {
        attempts: challenge.attemptsUsed,
        codeDigest: challenge.codeDigest,
        consumedAt: challenge.consumedAt,
        createdAt: challenge.issuedAt,
        emailId: challenge.emailId,
        expiresAt: challenge.expiresAt,
        flowId: challenge.flowId,
        invalidatedAt: challenge.invalidatedAt,
        lastSentAt: challenge.lastSentAt,
        purpose: challenge.purpose,
        sendCount: challenge.sendCount,
        sendWindowStartedAt: challenge.issuedAt,
        updatedAt: challenge.issuedAt,
        userId: challenge.userId,
    } as const;
}

function assertNewChallenge(
    challenge: NewStoredVerificationChallenge,
    purpose: NewStoredVerificationChallenge['purpose'],
): void {
    if (
        challenge.purpose !== purpose ||
        challenge.attemptsUsed !== 0 ||
        challenge.consumedAt !== null ||
        challenge.invalidatedAt !== null ||
        challenge.expiresAt <= challenge.issuedAt
    ) {
        throw new Error('The new verification challenge state is invalid.');
    }
}

function sessionInsertValues(session: NewStoredAuthenticationSession) {
    return {
        absoluteExpiresAt: session.absoluteExpiresAt,
        authenticatedAt: session.authenticatedAt,
        authenticationMethod: session.authenticationMethod,
        clientLabel: session.clientLabel,
        createdAt: session.createdAt,
        familyId: session.familyId,
        id: session.id,
        predecessorSessionId: session.predecessorSessionId,
        refreshTokenDigest: session.refreshDigest,
        revokedAt: session.revokedAt,
        revocationReason: session.revocationReason,
        rotatedAt: session.consumedAt,
        rotatedToSessionId: session.successorId,
        updatedAt: session.createdAt,
        userId: session.userId,
    } as const;
}

function assertInitialSession(
    session: NewStoredAuthenticationSession,
    authenticationMethod: NewStoredAuthenticationSession['authenticationMethod'],
    now?: Date,
): void {
    if (
        session.authenticationMethod !== authenticationMethod ||
        session.predecessorSessionId !== null ||
        session.consumedAt !== null ||
        session.revokedAt !== null ||
        session.successorId !== null ||
        session.absoluteExpiresAt <= session.createdAt ||
        session.authenticatedAt > session.createdAt ||
        (now !== undefined &&
            (session.createdAt > now || session.authenticatedAt > now))
    ) {
        throw new Error('The initial authentication session state is invalid.');
    }
}

function mapPasswordCredential(
    row: typeof passwordCredentialsTable.$inferSelect | null,
): StoredPasswordCredential | null {
    if (!row) return null;
    if (row.algorithm !== 'argon2id') {
        throw new Error('Persisted password algorithm is unsupported.');
    }
    return {
        createdAt: row.createdAt,
        encoded: row.hash,
        parametersVersion: row.algorithmVersion,
        updatedAt: row.updatedAt,
        userId: row.userId,
    };
}

function mapChallenge(
    row: typeof authVerificationChallengesTable.$inferSelect,
): StoredVerificationChallenge {
    return {
        attemptsUsed: row.attempts,
        codeDigest: row.codeDigest,
        consumedAt: row.consumedAt,
        emailId: row.emailId,
        expiresAt: row.expiresAt,
        flowId: row.flowId,
        invalidatedAt: row.invalidatedAt,
        issuedAt: row.createdAt,
        lastSentAt: row.lastSentAt,
        purpose: row.purpose,
        sendCount: row.sendCount,
        userId: row.userId,
    };
}

function mapSession(
    row: typeof authSessionsTable.$inferSelect,
): StoredAuthenticationSession {
    return {
        absoluteExpiresAt: row.absoluteExpiresAt,
        authenticatedAt: row.authenticatedAt,
        authenticationMethod: row.authenticationMethod,
        clientLabel: row.clientLabel,
        consumedAt: row.rotatedAt,
        createdAt: row.createdAt,
        familyId: row.familyId,
        id: row.id,
        predecessorSessionId: row.predecessorSessionId,
        refreshDigest: row.refreshTokenDigest,
        revokedAt: row.revokedAt,
        revocationReason:
            row.revocationReason as SessionRevocationReason | null,
        successorId: row.rotatedToSessionId,
        userId: row.userId,
    };
}

function mapPasskey(
    row: typeof authPasskeysTable.$inferSelect,
): StoredAuthenticationPasskey {
    return {
        backedUp: row.backedUp,
        counter: row.counter,
        createdAt: row.createdAt,
        credentialId: row.credentialId,
        credentialPublicKey: new Uint8Array(
            Buffer.from(row.publicKey, 'base64url'),
        ),
        deviceType: row.credentialDeviceType,
        id: row.id,
        lastUsedAt: row.lastUsedAt,
        name: row.name,
        revokedAt: row.revokedAt,
        transports: row.transports as StoredAuthenticationPasskey['transports'],
        userHandle: row.userHandle,
        userId: row.userId,
    };
}

function normalizePasskeyName(nameInput: string): {
    canonicalName: string;
    name: string;
} {
    const name = nameInput.trim();
    if (name.length === 0 || [...name].length > 80) {
        throw new RangeError('The passkey name is invalid.');
    }
    return { canonicalName: name.toLocaleLowerCase('en-US'), name };
}

function passkeyInsertValues(passkey: NewStoredAuthenticationPasskey) {
    return {
        backedUp: passkey.backedUp,
        ...normalizePasskeyName(passkey.name),
        counter: passkey.counter,
        createdAt: passkey.createdAt,
        credentialDeviceType: passkey.deviceType,
        credentialId: passkey.credentialId,
        id: passkey.id,
        lastUsedAt: passkey.lastUsedAt,
        publicKey: Buffer.from(passkey.credentialPublicKey).toString(
            'base64url',
        ),
        revokedAt: passkey.revokedAt,
        transports: passkey.transports,
        updatedAt: passkey.createdAt,
        userHandle: passkey.userHandle,
        userId: passkey.userId,
    } as const;
}

async function findAccount(
    database: QueryDatabase,
    where: ReturnType<typeof eq>,
): Promise<AuthenticationAccount | null> {
    const rows = await database
        .select({
            createdAt: usersTable.createdAt,
            email: userEmailsTable.email,
            emailId: userEmailsTable.id,
            emailVerifiedAt: userEmailsTable.verifiedAt,
            handle: usersTable.handle,
            password: passwordCredentialsTable,
            status: usersTable.status,
            userId: usersTable.id,
        })
        .from(usersTable)
        .innerJoin(
            userEmailsTable,
            and(
                eq(userEmailsTable.userId, usersTable.id),
                eq(userEmailsTable.isPrimary, true),
            ),
        )
        .leftJoin(
            passwordCredentialsTable,
            eq(passwordCredentialsTable.userId, usersTable.id),
        )
        .where(where)
        .limit(1);
    const row = rows[0];
    return row
        ? {
              createdAt: row.createdAt,
              email: row.email,
              emailId: row.emailId,
              emailVerifiedAt: row.emailVerifiedAt,
              handle: row.handle,
              passwordCredential: mapPasswordCredential(row.password),
              status: row.status,
              userId: row.userId,
          }
        : null;
}

async function findChallengeForUpdate(
    transaction: AuthenticationTransaction,
    flowId: string,
): Promise<typeof authVerificationChallengesTable.$inferSelect | null> {
    const rows = await transaction
        .select()
        .from(authVerificationChallengesTable)
        .where(eq(authVerificationChallengesTable.flowId, flowId))
        .limit(1)
        .for('update');
    return rows[0] ?? null;
}

async function lockUser(
    transaction: AuthenticationTransaction,
    userId: string,
): Promise<(typeof usersTable.$inferSelect)['status'] | null> {
    const rows = await transaction
        .select({ status: usersTable.status })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1)
        .for('update');
    return rows[0]?.status ?? null;
}

async function lockPasswordCredential(
    transaction: AuthenticationTransaction,
    userId: string,
): Promise<void> {
    await transaction
        .select({ userId: passwordCredentialsTable.userId })
        .from(passwordCredentialsTable)
        .where(eq(passwordCredentialsTable.userId, userId))
        .limit(1)
        .for('update');
}

function challengeIsUnavailable(
    challenge: typeof authVerificationChallengesTable.$inferSelect,
    now: Date,
): boolean {
    return Boolean(
        challenge.consumedAt ||
        challenge.invalidatedAt ||
        challenge.attempts >= challenge.maxAttempts ||
        now >= challenge.expiresAt,
    );
}

async function recordIncorrectChallengeAttempt(
    transaction: AuthenticationTransaction,
    challenge: typeof authVerificationChallengesTable.$inferSelect,
    now: Date,
): Promise<void> {
    await transaction
        .update(authVerificationChallengesTable)
        .set({ attempts: challenge.attempts + 1, updatedAt: now })
        .where(eq(authVerificationChallengesTable.flowId, challenge.flowId));
}

async function revokeUserSessions(
    transaction: AuthenticationTransaction,
    input: { reason: SessionRevocationReason; revokedAt: Date; userId: string },
): Promise<void> {
    await transaction
        .update(authSessionsTable)
        .set({
            revocationReason: input.reason,
            revokedAt: input.revokedAt,
            updatedAt: input.revokedAt,
        })
        .where(
            and(
                eq(authSessionsTable.userId, input.userId),
                isNull(authSessionsTable.revokedAt),
            ),
        );
}

async function revokeSessionFamily(
    transaction: AuthenticationTransaction,
    input: {
        familyId: string;
        reason: SessionRevocationReason;
        revokedAt: Date;
        userId: string;
    },
): Promise<void> {
    await transaction
        .update(authSessionsTable)
        .set({
            revocationReason: input.reason,
            revokedAt: input.revokedAt,
            updatedAt: input.revokedAt,
        })
        .where(
            and(
                eq(authSessionsTable.familyId, input.familyId),
                eq(authSessionsTable.userId, input.userId),
                isNull(authSessionsTable.revokedAt),
            ),
        );
}

async function insertSession(
    transaction: AuthenticationTransaction,
    session: NewStoredAuthenticationSession,
): Promise<void> {
    await transaction
        .insert(authSessionsTable)
        .values(sessionInsertValues(session));
}

async function assessChallengeIssue(
    transaction: AuthenticationTransaction,
    challenge: NewStoredVerificationChallenge,
): Promise<{
    decision: ChallengeIssueResult | null;
    previous: typeof authVerificationChallengesTable.$inferSelect | null;
    rolling: Array<typeof authVerificationChallengesTable.$inferSelect>;
}> {
    const challengeRows = await transaction
        .select()
        .from(authVerificationChallengesTable)
        .where(
            and(
                eq(authVerificationChallengesTable.userId, challenge.userId),
                eq(authVerificationChallengesTable.purpose, challenge.purpose),
            ),
        )
        .for('update');
    const activeRows = challengeRows.filter(
        ({ consumedAt, invalidatedAt }) => !consumedAt && !invalidatedAt,
    );
    const active = activeRows[0];
    if (active) {
        const cooldownEndsAt =
            active.lastSentAt.getTime() + resendCooldownMilliseconds;
        if (challenge.issuedAt.getTime() < cooldownEndsAt) {
            return {
                decision: {
                    kind: 'limited',
                    retryAfterSeconds: Math.max(
                        1,
                        Math.ceil(
                            (cooldownEndsAt - challenge.issuedAt.getTime()) /
                                1_000,
                        ),
                    ),
                },
                previous: active,
                rolling: [],
            };
        }
    }

    const rolling = challengeRows.filter(
        ({ lastSentAt }) =>
            lastSentAt.getTime() >
            challenge.issuedAt.getTime() - sendWindowMilliseconds,
    );
    if (rolling.length >= 5) {
        const oldest = rolling.reduce((candidate, row) =>
            row.lastSentAt < candidate.lastSentAt ? row : candidate,
        );
        const retryAt = oldest.lastSentAt.getTime() + sendWindowMilliseconds;
        return {
            decision: {
                kind: 'limited',
                retryAfterSeconds: Math.max(
                    1,
                    Math.ceil((retryAt - challenge.issuedAt.getTime()) / 1_000),
                ),
            },
            previous: active ?? null,
            rolling,
        };
    }

    if (activeRows.length > 0) {
        await transaction
            .update(authVerificationChallengesTable)
            .set({
                invalidatedAt: challenge.issuedAt,
                updatedAt: challenge.issuedAt,
            })
            .where(
                and(
                    eq(
                        authVerificationChallengesTable.userId,
                        challenge.userId,
                    ),
                    eq(
                        authVerificationChallengesTable.purpose,
                        challenge.purpose,
                    ),
                    isNull(authVerificationChallengesTable.consumedAt),
                    isNull(authVerificationChallengesTable.invalidatedAt),
                ),
            );
    }
    return { decision: null, previous: active ?? null, rolling };
}

function rollingSendWindow(
    challenge: NewStoredVerificationChallenge,
    rolling: Array<typeof authVerificationChallengesTable.$inferSelect>,
): { sendCount: number; sendWindowStartedAt: Date } {
    const oldest = rolling.reduce<
        typeof authVerificationChallengesTable.$inferSelect | null
    >(
        (candidate, row) =>
            !candidate || row.lastSentAt < candidate.lastSentAt
                ? row
                : candidate,
        null,
    );
    return {
        sendCount: rolling.length + 1,
        sendWindowStartedAt: oldest?.lastSentAt ?? challenge.issuedAt,
    };
}

export class DrizzleAuthStore implements AuthStore {
    public constructor(private readonly database: AuthenticationDatabase) {}

    public findAccountByCanonicalEmail(
        canonicalEmail: string,
    ): Promise<AuthenticationAccount | null> {
        return findAccount(
            this.database,
            eq(userEmailsTable.canonicalEmail, canonicalEmail),
        );
    }

    public findAccountByUserId(
        userId: string,
    ): Promise<AuthenticationAccount | null> {
        return findAccount(this.database, eq(usersTable.id, userId));
    }

    public async findChallenge(input: {
        flowId: string;
        purpose: StoredVerificationChallenge['purpose'];
    }): Promise<StoredVerificationChallenge | null> {
        const rows = await this.database
            .select()
            .from(authVerificationChallengesTable)
            .where(
                and(
                    eq(authVerificationChallengesTable.flowId, input.flowId),
                    eq(authVerificationChallengesTable.purpose, input.purpose),
                ),
            )
            .limit(1);
        return rows[0] ? mapChallenge(rows[0]) : null;
    }

    public async findActiveChallengeForUser(input: {
        purpose: StoredVerificationChallenge['purpose'];
        userId: string;
    }): Promise<StoredVerificationChallenge | null> {
        const rows = await this.database
            .select()
            .from(authVerificationChallengesTable)
            .where(
                and(
                    eq(authVerificationChallengesTable.userId, input.userId),
                    eq(authVerificationChallengesTable.purpose, input.purpose),
                    isNull(authVerificationChallengesTable.consumedAt),
                    isNull(authVerificationChallengesTable.invalidatedAt),
                ),
            )
            .limit(1);
        return rows[0] ? mapChallenge(rows[0]) : null;
    }

    public async findPasskeyByCredentialId(
        credentialId: string,
    ): Promise<StoredAuthenticationPasskey | null> {
        const rows = await this.database
            .select()
            .from(authPasskeysTable)
            .where(eq(authPasskeysTable.credentialId, credentialId))
            .limit(1);
        return rows[0] ? mapPasskey(rows[0]) : null;
    }

    public async findRefreshSessionByDigest(
        digest: string,
    ): Promise<StoredAuthenticationSession | null> {
        const rows = await this.database
            .select()
            .from(authSessionsTable)
            .where(eq(authSessionsTable.refreshTokenDigest, digest))
            .limit(1);
        return rows[0] ? mapSession(rows[0]) : null;
    }

    public async getActiveSession(input: {
        now: Date;
        sessionId: string;
        userId: string;
    }): Promise<StoredAuthenticationSession | null> {
        const rows = await this.database
            .select({ session: authSessionsTable })
            .from(authSessionsTable)
            .innerJoin(usersTable, eq(usersTable.id, authSessionsTable.userId))
            .where(
                and(
                    eq(authSessionsTable.id, input.sessionId),
                    eq(authSessionsTable.userId, input.userId),
                    eq(usersTable.status, 'active'),
                    isNull(authSessionsTable.revokedAt),
                    isNull(authSessionsTable.rotatedAt),
                    gt(authSessionsTable.absoluteExpiresAt, input.now),
                ),
            )
            .limit(1);
        return rows[0] ? mapSession(rows[0].session) : null;
    }

    public async listActivePasskeys(
        userId: string,
    ): Promise<StoredAuthenticationPasskey[]> {
        const rows = await this.database
            .select()
            .from(authPasskeysTable)
            .where(
                and(
                    eq(authPasskeysTable.userId, userId),
                    isNull(authPasskeysTable.revokedAt),
                ),
            )
            .orderBy(authPasskeysTable.createdAt);
        return rows.map(mapPasskey);
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
        assertNewChallenge(input.challenge, 'email_verification');
        return this.database.transaction(async (transaction) => {
            const email = EmailAddress.create(input.account.email);
            if (email.canonicalValue !== input.account.canonicalEmail) {
                throw new Error(
                    'The signup email canonical value is inconsistent.',
                );
            }
            await transaction.execute(
                sql`select pg_advisory_xact_lock(hashtextextended(${email.canonicalValue}, 1105233719))`,
            );
            let account = await findAccount(
                transaction,
                eq(userEmailsTable.canonicalEmail, email.canonicalValue),
            );
            if (account) {
                await lockUser(transaction, account.userId);
                account = await findAccount(
                    transaction,
                    eq(usersTable.id, account.userId),
                );
            }
            if (account && account.status !== 'pending') return 'active_noop';

            const assessment = account
                ? await assessChallengeIssue(transaction, {
                      ...input.challenge,
                      emailId: account.emailId,
                      userId: account.userId,
                  })
                : { decision: null, previous: null, rolling: [] };
            if (assessment.decision?.kind === 'limited') {
                return assessment.decision;
            }

            if (!account) {
                await transaction.insert(usersTable).values({
                    createdAt: input.account.createdAt,
                    id: input.account.userId,
                    status: 'pending',
                    updatedAt: input.account.createdAt,
                    version: 1,
                });
                await transaction.insert(userEmailsTable).values({
                    canonicalEmail: email.canonicalValue,
                    createdAt: input.account.createdAt,
                    email: email.value,
                    id: input.account.emailId,
                    isPrimary: true,
                    updatedAt: input.account.createdAt,
                    userId: input.account.userId,
                });
            }

            const userId = account?.userId ?? input.account.userId;
            const emailId = account?.emailId ?? input.account.emailId;
            await savePasswordCredential(transaction, {
                ...input.credential,
                userId,
            });
            const nextChallenge = {
                ...input.challenge,
                emailId,
                userId,
            };
            await transaction.insert(authVerificationChallengesTable).values({
                ...challengeInsertValues(nextChallenge),
                ...rollingSendWindow(nextChallenge, assessment.rolling),
            });
            return 'pending_created';
        });
    }

    public issuePasswordResetChallenge(input: {
        challenge: NewStoredVerificationChallenge;
        expectedStatus: 'active';
    }): Promise<ChallengeIssueResult> {
        assertNewChallenge(input.challenge, 'password_reset');
        return this.database.transaction(async (transaction) => {
            await lockUser(transaction, input.challenge.userId);
            const account = await findAccount(
                transaction,
                eq(usersTable.id, input.challenge.userId),
            );
            if (
                !account ||
                account.status !== input.expectedStatus ||
                account.emailId !== input.challenge.emailId
            ) {
                return { kind: 'noop' };
            }
            const assessment = await assessChallengeIssue(
                transaction,
                input.challenge,
            );
            if (assessment.decision) return assessment.decision;
            await transaction.insert(authVerificationChallengesTable).values({
                ...challengeInsertValues(input.challenge),
                ...rollingSendWindow(input.challenge, assessment.rolling),
            });
            return { kind: 'issued', recipient: account.email };
        });
    }

    public replaceEmailVerificationChallenge(input: {
        challenge: NewStoredVerificationChallenge;
        previousFlowId: string;
    }): Promise<ChallengeIssueResult> {
        assertNewChallenge(input.challenge, 'email_verification');
        return this.database.transaction(async (transaction) => {
            const previous = await findChallengeForUpdate(
                transaction,
                input.previousFlowId,
            );
            if (
                !previous ||
                previous.userId !== input.challenge.userId ||
                previous.emailId !== input.challenge.emailId ||
                previous.purpose !== input.challenge.purpose ||
                previous.consumedAt !== null ||
                previous.invalidatedAt !== null
            ) {
                return { kind: 'noop' };
            }
            const account = await findAccount(
                transaction,
                eq(usersTable.id, previous.userId),
            );
            if (!account || account.status !== 'pending')
                return { kind: 'noop' };
            const assessment = await assessChallengeIssue(
                transaction,
                input.challenge,
            );
            if (assessment.decision) return assessment.decision;
            await transaction.insert(authVerificationChallengesTable).values({
                ...challengeInsertValues(input.challenge),
                ...rollingSendWindow(input.challenge, assessment.rolling),
            });
            return { kind: 'issued', recipient: account.email };
        });
    }

    public commitEmailVerification(input: {
        codeMatches: boolean;
        flowId: string;
        now: Date;
        session: NewStoredAuthenticationSession;
    }): Promise<EmailVerificationCommitResult> {
        return this.database.transaction(async (transaction) => {
            const challenge = await findChallengeForUpdate(
                transaction,
                input.flowId,
            );
            if (
                !challenge ||
                challenge.purpose !== 'email_verification' ||
                challengeIsUnavailable(challenge, input.now)
            ) {
                return { kind: 'unavailable' };
            }
            if (!input.codeMatches) {
                await recordIncorrectChallengeAttempt(
                    transaction,
                    challenge,
                    input.now,
                );
                return { kind: 'incorrect' };
            }
            assertInitialSession(
                input.session,
                'email_verification',
                input.now,
            );

            await lockUser(transaction, challenge.userId);
            const account = await findAccount(
                transaction,
                eq(usersTable.id, challenge.userId),
            );
            if (!account || account.status !== 'pending') {
                return { kind: 'unavailable' };
            }
            if (input.session.userId !== account.userId) {
                throw new Error(
                    'The verification session belongs to another user.',
                );
            }
            await transaction
                .update(authVerificationChallengesTable)
                .set({ consumedAt: input.now, updatedAt: input.now })
                .where(
                    eq(
                        authVerificationChallengesTable.flowId,
                        challenge.flowId,
                    ),
                );
            await transaction
                .update(usersTable)
                .set({
                    status: 'active',
                    updatedAt: input.now,
                    version: sql`${usersTable.version} + 1`,
                })
                .where(
                    and(
                        eq(usersTable.id, account.userId),
                        eq(usersTable.status, 'pending'),
                    ),
                );
            await transaction
                .update(userEmailsTable)
                .set({ updatedAt: input.now, verifiedAt: input.now })
                .where(eq(userEmailsTable.id, account.emailId));
            await insertSession(transaction, input.session);
            const verified = await findAccount(
                transaction,
                eq(usersTable.id, account.userId),
            );
            if (!verified) throw new Error('The verified account disappeared.');
            return { account: verified, kind: 'verified' };
        });
    }

    public commitPasswordReset(input: {
        codeMatches: boolean;
        flowId: string;
        newCredential: StoredPasswordCredential;
        now: Date;
    }): Promise<PasswordResetCommitResult> {
        return this.database.transaction(async (transaction) => {
            const challenge = await findChallengeForUpdate(
                transaction,
                input.flowId,
            );
            if (
                !challenge ||
                challenge.purpose !== 'password_reset' ||
                challengeIsUnavailable(challenge, input.now)
            ) {
                return 'unavailable';
            }
            if (!input.codeMatches) {
                await recordIncorrectChallengeAttempt(
                    transaction,
                    challenge,
                    input.now,
                );
                return 'incorrect';
            }
            await lockUser(transaction, challenge.userId);
            await lockPasswordCredential(transaction, challenge.userId);
            const account = await findAccount(
                transaction,
                eq(usersTable.id, challenge.userId),
            );
            if (!account || account.status !== 'active') return 'unavailable';
            if (input.newCredential.userId !== account.userId) {
                throw new Error(
                    'The password credential belongs to another user.',
                );
            }
            await transaction
                .update(authVerificationChallengesTable)
                .set({ consumedAt: input.now, updatedAt: input.now })
                .where(
                    eq(
                        authVerificationChallengesTable.flowId,
                        challenge.flowId,
                    ),
                );
            await savePasswordCredential(transaction, input.newCredential);
            await revokeUserSessions(transaction, {
                reason: 'password_reset',
                revokedAt: input.now,
                userId: account.userId,
            });
            return 'reset';
        });
    }

    public issueSessionForActiveUser(input: {
        expectedPasswordHash?: string;
        replacementCredential?: StoredPasswordCredential;
        session: NewStoredAuthenticationSession;
        userId: string;
    }): Promise<SessionIssueCommitResult> {
        assertInitialSession(input.session, 'password');
        if (input.replacementCredential && !input.expectedPasswordHash) {
            throw new Error(
                'Credential replacement requires the expected hash.',
            );
        }
        return this.database.transaction(async (transaction) => {
            await lockUser(transaction, input.userId);
            await lockPasswordCredential(transaction, input.userId);
            const account = await findAccount(
                transaction,
                eq(usersTable.id, input.userId),
            );
            if (
                !account ||
                account.status !== 'active' ||
                input.session.userId !== input.userId ||
                (input.expectedPasswordHash !== undefined &&
                    account.passwordCredential?.encoded !==
                        input.expectedPasswordHash)
            ) {
                return { kind: 'unavailable' };
            }
            if (input.replacementCredential) {
                if (input.replacementCredential.userId !== input.userId) {
                    throw new Error(
                        'The replacement credential belongs to another user.',
                    );
                }
                await savePasswordCredential(
                    transaction,
                    input.replacementCredential,
                );
            }
            await insertSession(transaction, input.session);
            return { account, kind: 'issued' };
        });
    }

    public changePasswordAndReplaceSessions(input: {
        expectedPasswordHash: string;
        newCredential: StoredPasswordCredential;
        replacementSession: NewStoredAuthenticationSession;
        revokedAt: Date;
        userId: string;
    }): Promise<SessionIssueCommitResult> {
        assertInitialSession(
            input.replacementSession,
            'password',
            input.revokedAt,
        );
        return this.database.transaction(async (transaction) => {
            await lockUser(transaction, input.userId);
            await lockPasswordCredential(transaction, input.userId);
            const account = await findAccount(
                transaction,
                eq(usersTable.id, input.userId),
            );
            if (
                !account ||
                account.status !== 'active' ||
                account.passwordCredential?.encoded !==
                    input.expectedPasswordHash ||
                input.newCredential.userId !== input.userId ||
                input.replacementSession.userId !== input.userId
            ) {
                return { kind: 'unavailable' };
            }
            await savePasswordCredential(transaction, input.newCredential);
            await revokeUserSessions(transaction, {
                reason: 'password_change',
                revokedAt: input.revokedAt,
                userId: input.userId,
            });
            await insertSession(transaction, input.replacementSession);
            const updated = await findAccount(
                transaction,
                eq(usersTable.id, input.userId),
            );
            if (!updated) throw new Error('The password account disappeared.');
            return { account: updated, kind: 'issued' };
        });
    }

    public revokeAllSessions(input: {
        reason: SessionRevocationReason;
        revokedAt: Date;
        userId: string;
    }): Promise<void> {
        return this.database.transaction((transaction) =>
            revokeUserSessions(transaction, input),
        );
    }

    public async revokeSessionFamilyByDigest(input: {
        digest: string;
        reason: SessionRevocationReason;
        revokedAt: Date;
    }): Promise<void> {
        await this.database.transaction(async (transaction) => {
            const rows = await transaction
                .select({
                    familyId: authSessionsTable.familyId,
                    userId: authSessionsTable.userId,
                })
                .from(authSessionsTable)
                .where(eq(authSessionsTable.refreshTokenDigest, input.digest))
                .limit(1)
                .for('update');
            const session = rows[0];
            if (!session) return;
            await revokeSessionFamily(transaction, {
                familyId: session.familyId,
                reason: input.reason,
                revokedAt: input.revokedAt,
                userId: session.userId,
            });
        });
    }

    public rotateRefreshSession(input: {
        digest: string;
        now: Date;
        successor: NewStoredAuthenticationSession;
    }): Promise<RefreshRotationCommitResult> {
        return this.database.transaction(async (transaction) => {
            const rows = await transaction
                .select()
                .from(authSessionsTable)
                .where(eq(authSessionsTable.refreshTokenDigest, input.digest))
                .limit(1)
                .for('update');
            const current = rows[0];
            if (!current) return { kind: 'unavailable' };
            if (current.rotatedAt) {
                await revokeSessionFamily(transaction, {
                    familyId: current.familyId,
                    reason: 'refresh_replay',
                    revokedAt: input.now,
                    userId: current.userId,
                });
                await transaction
                    .update(authSessionsTable)
                    .set({ replayDetectedAt: input.now, updatedAt: input.now })
                    .where(eq(authSessionsTable.id, current.id));
                return { kind: 'replay' };
            }
            if (current.revokedAt || input.now >= current.absoluteExpiresAt) {
                return { kind: 'unavailable' };
            }
            await lockUser(transaction, current.userId);
            const account = await findAccount(
                transaction,
                eq(usersTable.id, current.userId),
            );
            if (!account || account.status !== 'active')
                return { kind: 'unavailable' };
            if (
                input.successor.userId !== current.userId ||
                input.successor.familyId !== current.familyId ||
                input.successor.absoluteExpiresAt.getTime() !==
                    current.absoluteExpiresAt.getTime() ||
                input.successor.predecessorSessionId !== current.id ||
                input.successor.authenticatedAt.getTime() !==
                    current.authenticatedAt.getTime() ||
                input.successor.authenticationMethod !==
                    current.authenticationMethod ||
                input.successor.createdAt > input.now ||
                input.successor.consumedAt !== null ||
                input.successor.revokedAt !== null ||
                input.successor.successorId !== null
            ) {
                throw new Error(
                    'The refresh successor does not preserve its family.',
                );
            }
            await insertSession(transaction, input.successor);
            await transaction
                .update(authSessionsTable)
                .set({
                    rotatedAt: input.now,
                    rotatedToSessionId: input.successor.id,
                    updatedAt: input.now,
                })
                .where(eq(authSessionsTable.id, current.id));
            return { account, kind: 'rotated' };
        });
    }

    public registerPasskey(input: {
        now: Date;
        passkey: NewStoredAuthenticationPasskey;
        sessionId: string;
        userId: string;
    }): Promise<boolean> {
        if (
            input.passkey.revokedAt !== null ||
            input.passkey.lastUsedAt !== null
        ) {
            throw new Error('A new passkey cannot already be used or revoked.');
        }
        return this.database.transaction(async (transaction) => {
            const session = await this.findRecentSession(
                transaction,
                input.now,
                input.sessionId,
                input.userId,
            );
            if (!session || input.passkey.userId !== input.userId) return false;
            const activePasskeys = await transaction
                .select({ id: authPasskeysTable.id })
                .from(authPasskeysTable)
                .where(
                    and(
                        eq(authPasskeysTable.userId, input.userId),
                        isNull(authPasskeysTable.revokedAt),
                    ),
                )
                .limit(maximumActivePasskeysPerUser);
            if (activePasskeys.length >= maximumActivePasskeysPerUser)
                return false;
            try {
                await transaction
                    .insert(authPasskeysTable)
                    .values(passkeyInsertValues(input.passkey));
                return true;
            } catch (error) {
                throwMappedAuthenticationConflict(error);
            }
        });
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
        assertInitialSession(input.session, 'passkey', input.now);
        return this.database.transaction(async (transaction) => {
            const rows = await transaction
                .select()
                .from(authPasskeysTable)
                .where(eq(authPasskeysTable.id, input.passkeyId))
                .limit(1)
                .for('update');
            const passkey = rows[0];
            if (!passkey || passkey.revokedAt) return { kind: 'unavailable' };
            if (passkey.counter !== input.expectedCounter) {
                return { kind: 'counter_conflict' };
            }
            await lockUser(transaction, passkey.userId);
            const account = await findAccount(
                transaction,
                eq(usersTable.id, passkey.userId),
            );
            if (
                !account ||
                account.status !== 'active' ||
                input.session.userId !== account.userId
            ) {
                return { kind: 'unavailable' };
            }
            const updated = await transaction
                .update(authPasskeysTable)
                .set({
                    backedUp: input.verifiedBackedUp,
                    counter: input.verifiedCounter,
                    credentialDeviceType: input.verifiedDeviceType,
                    lastUsedAt: input.now,
                    updatedAt: input.now,
                })
                .where(
                    and(
                        eq(authPasskeysTable.id, passkey.id),
                        eq(authPasskeysTable.counter, input.expectedCounter),
                        isNull(authPasskeysTable.revokedAt),
                    ),
                )
                .returning({ id: authPasskeysTable.id });
            if (updated.length !== 1) return { kind: 'counter_conflict' };
            await insertSession(transaction, input.session);
            return { account, kind: 'authenticated' };
        });
    }

    public renamePasskey(input: {
        name: string;
        now: Date;
        passkeyId: string;
        userId: string;
    }): Promise<StoredAuthenticationPasskey | null> {
        return this.database.transaction(async (transaction) => {
            const name = normalizePasskeyName(input.name);
            try {
                const renamed = await transaction
                    .update(authPasskeysTable)
                    .set({ ...name, updatedAt: input.now })
                    .where(
                        and(
                            eq(authPasskeysTable.id, input.passkeyId),
                            eq(authPasskeysTable.userId, input.userId),
                            isNull(authPasskeysTable.revokedAt),
                        ),
                    )
                    .returning();
                return renamed[0] ? mapPasskey(renamed[0]) : null;
            } catch (error) {
                throwMappedAuthenticationConflict(error);
            }
        });
    }

    public revokePasskey(input: {
        now: Date;
        passkeyId: string;
        sessionId: string;
        userId: string;
    }): Promise<boolean> {
        return this.database.transaction(async (transaction) => {
            const session = await this.findRecentSession(
                transaction,
                input.now,
                input.sessionId,
                input.userId,
            );
            if (!session) return false;
            const revoked = await transaction
                .update(authPasskeysTable)
                .set({ revokedAt: input.now, updatedAt: input.now })
                .where(
                    and(
                        eq(authPasskeysTable.id, input.passkeyId),
                        eq(authPasskeysTable.userId, input.userId),
                        isNull(authPasskeysTable.revokedAt),
                    ),
                )
                .returning({ id: authPasskeysTable.id });
            return revoked.length === 1;
        });
    }

    private async findRecentSession(
        transaction: AuthenticationTransaction,
        now: Date,
        sessionId: string,
        userId: string,
    ): Promise<typeof authSessionsTable.$inferSelect | null> {
        const recentAfter = new Date(
            now.getTime() - recentAuthenticationMilliseconds,
        );
        const rows = await transaction
            .select({ session: authSessionsTable })
            .from(authSessionsTable)
            .innerJoin(usersTable, eq(usersTable.id, authSessionsTable.userId))
            .where(
                and(
                    eq(authSessionsTable.id, sessionId),
                    eq(authSessionsTable.userId, userId),
                    eq(usersTable.status, 'active'),
                    isNull(authSessionsTable.revokedAt),
                    isNull(authSessionsTable.rotatedAt),
                    gt(authSessionsTable.absoluteExpiresAt, now),
                    gte(authSessionsTable.authenticatedAt, recentAfter),
                ),
            )
            .limit(1)
            .for('update', { of: authSessionsTable });
        const session = rows[0]?.session ?? null;
        if (!session) return null;
        return (await lockUser(transaction, session.userId)) === 'active'
            ? session
            : null;
    }
}
