import { Buffer } from 'node:buffer';
import type {
    NewStoredAuthenticationPasskey,
    NewStoredAuthenticationSession,
    NewStoredVerificationChallenge,
    StoredAuthenticationPasskey,
    StoredAuthenticationSession,
    StoredPasswordCredential,
    StoredVerificationChallenge,
} from '../../../application/ports/auth-store';
import type { SessionRevocationReason } from '../../../domain/refresh-session';
import {
    type Argon2Parameters,
    type AuthenticationTransaction,
} from './auth-persistence-support';
import type {
    authPasskeysTable,
    authSessionsTable,
    authVerificationChallengesTable,
} from './schema';
import { passwordCredentialsTable } from './schema';

export function parseArgon2Parameters(encoded: string): Argon2Parameters {
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

export function passwordInsertValues(credential: StoredPasswordCredential) {
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

export async function savePasswordCredential(
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

export function challengeInsertValues(
    challenge: NewStoredVerificationChallenge,
) {
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

export function assertNewChallenge(
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

export function sessionInsertValues(session: NewStoredAuthenticationSession) {
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

export function assertInitialSession(
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

export function mapPasswordCredential(
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

export function mapChallenge(
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

export function mapSession(
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

export function mapPasskey(
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

export function normalizePasskeyName(nameInput: string): {
    canonicalName: string;
    name: string;
} {
    const name = nameInput.trim();
    if (name.length === 0 || [...name].length > 80) {
        throw new RangeError('The passkey name is invalid.');
    }

    return { canonicalName: name.toLocaleLowerCase('en-US'), name };
}

export function passkeyInsertValues(passkey: NewStoredAuthenticationPasskey) {
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
