import { Buffer } from 'node:buffer';

import {
    generateAuthenticationOptions,
    generateRegistrationOptions,
    type AuthenticationResponseJSON,
    type CredentialDeviceType,
    type RegistrationResponseJSON,
    verifyAuthenticationResponse,
    verifyRegistrationResponse,
} from '@simplewebauthn/server';

import {
    type PasskeyAuthenticationCredential,
    type PasskeyAuthenticationOptions,
    type PasskeyAuthenticatorTransport,
    type PasskeyRegistrationCredential,
    type PasskeyRegistrationOptions,
    type PasskeyVerifier,
    PasskeyVerificationError,
    type VerifiedPasskeyAuthentication,
    type VerifiedPasskeyRegistration,
} from '../../application/ports/passkey-verifier';
import type { PasskeyDeviceType } from '../../domain/passkey';

const ceremonyTimeoutMilliseconds = 5 * 60 * 1000;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

export interface SimpleWebAuthnAdapterOptions {
    origins: readonly string[];
    rpId: string;
    rpName: string;
}

export class SimpleWebAuthnAdapter implements PasskeyVerifier {
    private readonly origins: string[];
    private readonly rpId: string;
    private readonly rpName: string;

    public constructor(options: SimpleWebAuthnAdapterOptions) {
        if (
            !isValidRpId(options.rpId) ||
            options.rpName.length === 0 ||
            options.rpName.length > 100 ||
            options.origins.length === 0 ||
            new Set(options.origins).size !== options.origins.length ||
            !options.origins.every((origin) =>
                isExactOrigin(origin, options.rpId),
            )
        ) {
            throw new RangeError(
                'The WebAuthn relying-party settings are invalid.',
            );
        }

        this.origins = [...options.origins];
        this.rpId = options.rpId;
        this.rpName = options.rpName;
    }

    public async generateAuthenticationOptions(): Promise<PasskeyAuthenticationOptions> {
        const options = await generateAuthenticationOptions({
            rpID: this.rpId,
            timeout: ceremonyTimeoutMilliseconds,
            userVerification: 'required',
        });

        if (
            !options.challenge ||
            options.rpId !== this.rpId ||
            options.timeout !== ceremonyTimeoutMilliseconds ||
            options.userVerification !== 'required'
        ) {
            throw new Error(
                'The WebAuthn library returned invalid authentication options.',
            );
        }

        return {
            challenge: options.challenge,
            rpId: this.rpId,
            timeout: ceremonyTimeoutMilliseconds,
            userVerification: 'required',
        };
    }

    public async generateRegistrationOptions(input: {
        displayName: string;
        excludeCredentials: Array<{
            id: string;
            transports?: PasskeyAuthenticatorTransport[];
            type: 'public-key';
        }>;
        userHandle: string;
        userName: string;
    }): Promise<PasskeyRegistrationOptions> {
        const userId = decodeBase64Url(input.userHandle);
        const options = await generateRegistrationOptions({
            attestationType: 'none',
            authenticatorSelection: {
                requireResidentKey: true,
                residentKey: 'required',
                userVerification: 'required',
            },
            excludeCredentials: input.excludeCredentials,
            rpID: this.rpId,
            rpName: this.rpName,
            timeout: ceremonyTimeoutMilliseconds,
            userDisplayName: input.displayName,
            userID: new Uint8Array(userId),
            userName: input.userName,
        });

        if (
            options.challenge.length === 0 ||
            options.rp.id !== this.rpId ||
            options.rp.name !== this.rpName ||
            options.user.id !== input.userHandle ||
            options.timeout !== ceremonyTimeoutMilliseconds
        ) {
            throw new Error(
                'The WebAuthn library returned invalid registration options.',
            );
        }

        return {
            attestation: 'none',
            authenticatorSelection: {
                requireResidentKey: true,
                residentKey: 'required',
                userVerification: 'required',
            },
            challenge: options.challenge,
            ...(options.excludeCredentials
                ? {
                      excludeCredentials: options.excludeCredentials.map(
                          (credential) => ({
                              id: credential.id,
                              ...(credential.transports
                                  ? { transports: credential.transports }
                                  : {}),
                              type: 'public-key' as const,
                          }),
                      ),
                  }
                : {}),
            pubKeyCredParams: options.pubKeyCredParams.map((parameter) => ({
                alg: parameter.alg,
                type: 'public-key',
            })),
            rp: { id: this.rpId, name: this.rpName },
            timeout: ceremonyTimeoutMilliseconds,
            user: {
                displayName: options.user.displayName,
                id: options.user.id,
                name: options.user.name,
            },
        };
    }

    public async verifyAuthentication(input: {
        credential: PasskeyAuthenticationCredential;
        expectedChallenge: string;
        storedCredential: {
            backedUp: boolean;
            counter: number;
            credentialId: string;
            credentialPublicKey: Uint8Array;
            deviceType: PasskeyDeviceType;
            transports: PasskeyAuthenticatorTransport[];
            userHandle: string;
        };
    }): Promise<VerifiedPasskeyAuthentication> {
        try {
            assertMatchingCredentialIds(
                input.credential.id,
                input.credential.rawId,
                input.storedCredential.credentialId,
            );
            if (
                !Number.isSafeInteger(input.storedCredential.counter) ||
                input.storedCredential.counter < 0 ||
                input.storedCredential.credentialPublicKey.byteLength === 0 ||
                input.credential.response.userHandle !==
                    input.storedCredential.userHandle ||
                !isCanonicalBase64Url(input.storedCredential.userHandle) ||
                (input.storedCredential.deviceType === 'single_device' &&
                    input.storedCredential.backedUp)
            ) {
                throw new PasskeyVerificationError();
            }

            const result = await verifyAuthenticationResponse({
                credential: {
                    counter: input.storedCredential.counter,
                    id: input.storedCredential.credentialId,
                    publicKey: new Uint8Array(
                        input.storedCredential.credentialPublicKey,
                    ),
                    transports: input.storedCredential.transports,
                },
                expectedChallenge: input.expectedChallenge,
                expectedOrigin: this.origins,
                expectedRPID: this.rpId,
                expectedType: 'webauthn.get',
                requireUserVerification: true,
                response: toAuthenticationResponse(input.credential),
            });

            const deviceType = mapDeviceType(
                result.authenticationInfo.credentialDeviceType,
            );
            if (
                !result.verified ||
                !result.authenticationInfo.userVerified ||
                result.authenticationInfo.credentialID !==
                    input.storedCredential.credentialId ||
                deviceType !== input.storedCredential.deviceType ||
                !Number.isSafeInteger(result.authenticationInfo.newCounter) ||
                result.authenticationInfo.newCounter < 0 ||
                ((input.storedCredential.counter > 0 ||
                    result.authenticationInfo.newCounter > 0) &&
                    result.authenticationInfo.newCounter <=
                        input.storedCredential.counter) ||
                (deviceType === 'single_device' &&
                    result.authenticationInfo.credentialBackedUp)
            ) {
                throw new PasskeyVerificationError();
            }

            return {
                backedUp: result.authenticationInfo.credentialBackedUp,
                counter: result.authenticationInfo.newCounter,
                credentialId: result.authenticationInfo.credentialID,
                deviceType,
                userHandle: input.credential.response.userHandle,
            };
        } catch {
            throw new PasskeyVerificationError();
        }
    }

    public async verifyRegistration(input: {
        credential: PasskeyRegistrationCredential;
        expectedChallenge: string;
    }): Promise<VerifiedPasskeyRegistration> {
        try {
            assertMatchingCredentialIds(
                input.credential.id,
                input.credential.rawId,
            );
            const result = await verifyRegistrationResponse({
                expectedChallenge: input.expectedChallenge,
                expectedOrigin: this.origins,
                expectedRPID: this.rpId,
                expectedType: 'webauthn.create',
                requireUserPresence: true,
                requireUserVerification: true,
                response: toRegistrationResponse(input.credential),
            });

            if (!result.verified || !result.registrationInfo.userVerified) {
                throw new PasskeyVerificationError();
            }

            const { credential, credentialBackedUp } = result.registrationInfo;
            const deviceType = mapDeviceType(
                result.registrationInfo.credentialDeviceType,
            );
            if (
                credential.id !== input.credential.id ||
                !Number.isSafeInteger(credential.counter) ||
                credential.counter < 0 ||
                credential.publicKey.byteLength === 0 ||
                (deviceType === 'single_device' && credentialBackedUp)
            ) {
                throw new PasskeyVerificationError();
            }

            return {
                backedUp: credentialBackedUp,
                counter: credential.counter,
                credentialId: credential.id,
                credentialPublicKey: new Uint8Array(credential.publicKey),
                deviceType,
                transports: [...(input.credential.response.transports ?? [])],
            };
        } catch {
            throw new PasskeyVerificationError();
        }
    }
}

function assertMatchingCredentialIds(
    id: string,
    rawId: string,
    expectedId: string = id,
): void {
    if (id !== rawId || id !== expectedId || !isCanonicalBase64Url(id)) {
        throw new PasskeyVerificationError();
    }
}

function decodeBase64Url(value: string): Uint8Array {
    if (
        value.length < 16 ||
        value.length > 128 ||
        !isCanonicalBase64Url(value)
    ) {
        throw new RangeError('The WebAuthn user handle is invalid.');
    }
    return Buffer.from(value, 'base64url');
}

function isCanonicalBase64Url(value: string): boolean {
    return (
        value.length > 0 &&
        base64UrlPattern.test(value) &&
        Buffer.from(value, 'base64url').toString('base64url') === value
    );
}

function isExactOrigin(value: string, rpId: string): boolean {
    try {
        const origin = new URL(value);
        return (
            origin.origin === value &&
            (origin.hostname === rpId || origin.hostname.endsWith(`.${rpId}`))
        );
    } catch {
        return false;
    }
}

function isValidRpId(value: string): boolean {
    try {
        const parsed = new URL(`https://${value}`);
        return (
            value.length > 0 &&
            value.length <= 253 &&
            parsed.hostname === value &&
            parsed.origin === `https://${value}`
        );
    } catch {
        return false;
    }
}

function mapDeviceType(deviceType: CredentialDeviceType): PasskeyDeviceType {
    return deviceType === 'multiDevice' ? 'multi_device' : 'single_device';
}

function toAuthenticationResponse(
    credential: PasskeyAuthenticationCredential,
): AuthenticationResponseJSON {
    return {
        ...credential,
        response: { ...credential.response },
    };
}

function toRegistrationResponse(
    credential: PasskeyRegistrationCredential,
): RegistrationResponseJSON {
    return {
        ...credential,
        response: { ...credential.response },
    } as RegistrationResponseJSON;
}
