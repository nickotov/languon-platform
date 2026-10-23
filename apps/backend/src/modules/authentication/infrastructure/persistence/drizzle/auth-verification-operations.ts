import { and, eq, sql } from 'drizzle-orm';
import { EmailAddress } from '../../../../users/domain/email-address';
import {
    userEmailsTable,
    usersTable,
} from '../../../../users/infrastructure/persistence/drizzle/schema';
import type {
    ChallengeIssueResult,
    EmailVerificationCommitResult,
    NewStoredAuthenticationSession,
    NewStoredVerificationChallenge,
    PasswordResetCommitResult,
    SignUpCommitResult,
    StoredPasswordCredential,
} from '../../../application/ports/auth-store';
import {
    assessChallengeIssue,
    challengeIsUnavailable,
    findAccount,
    findChallengeForUpdate,
    insertSession,
    lockPasswordCredential,
    lockUser,
    recordIncorrectChallengeAttempt,
    revokeUserSessions,
    rollingSendWindow,
    type AuthStoreContext,
} from './auth-persistence-support';
import {
    assertInitialSession,
    assertNewChallenge,
    challengeInsertValues,
    savePasswordCredential,
} from './auth-record-mapping';
import { authVerificationChallengesTable } from './schema';

export function registerOrReplacePendingSignup(
    persistence: AuthStoreContext,
    input: {
        account: {
            canonicalEmail: string;
            createdAt: Date;
            email: string;
            emailId: string;
            userId: string;
        };
        challenge: NewStoredVerificationChallenge;
        credential: StoredPasswordCredential;
    },
): Promise<SignUpCommitResult> {
    assertNewChallenge(input.challenge, 'email_verification');

    return persistence.database.transaction(async (transaction) => {
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

export function issuePasswordResetChallenge(
    persistence: AuthStoreContext,
    input: {
        challenge: NewStoredVerificationChallenge;
        expectedStatus: 'active';
    },
): Promise<ChallengeIssueResult> {
    assertNewChallenge(input.challenge, 'password_reset');

    return persistence.database.transaction(async (transaction) => {
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

export function replaceEmailVerificationChallenge(
    persistence: AuthStoreContext,
    input: {
        challenge: NewStoredVerificationChallenge;
        previousFlowId: string;
    },
): Promise<ChallengeIssueResult> {
    assertNewChallenge(input.challenge, 'email_verification');

    return persistence.database.transaction(async (transaction) => {
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

        if (!account || account.status !== 'pending') return { kind: 'noop' };
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

export function commitEmailVerification(
    persistence: AuthStoreContext,
    input: {
        codeMatches: boolean;
        flowId: string;
        now: Date;
        session: NewStoredAuthenticationSession;
    },
): Promise<EmailVerificationCommitResult> {
    return persistence.database.transaction(async (transaction) => {
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

        assertInitialSession(input.session, 'email_verification', input.now);

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
                eq(authVerificationChallengesTable.flowId, challenge.flowId),
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

export function commitPasswordReset(
    persistence: AuthStoreContext,
    input: {
        codeMatches: boolean;
        flowId: string;
        newCredential: StoredPasswordCredential;
        now: Date;
    },
): Promise<PasswordResetCommitResult> {
    return persistence.database.transaction(async (transaction) => {
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
            throw new Error('The password credential belongs to another user.');
        }

        await transaction
            .update(authVerificationChallengesTable)
            .set({ consumedAt: input.now, updatedAt: input.now })
            .where(
                eq(authVerificationChallengesTable.flowId, challenge.flowId),
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
