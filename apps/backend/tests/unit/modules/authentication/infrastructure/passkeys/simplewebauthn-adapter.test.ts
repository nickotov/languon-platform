import { Buffer } from 'node:buffer';

import type * as SimpleWebAuthnServer from '@simplewebauthn/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const webAuthnMocks = vi.hoisted(() => ({
    verifyAuthenticationResponse: vi.fn(),
    verifyRegistrationResponse: vi.fn(),
}));

vi.mock('@simplewebauthn/server', async (importOriginal) => ({
    ...(await importOriginal<typeof SimpleWebAuthnServer>()),
    ...webAuthnMocks,
}));

import {
    PasskeyVerificationError,
    type PasskeyAuthenticationCredential,
    type PasskeyRegistrationCredential,
} from '../../../../../../src/modules/authentication/application/ports/passkey-verifier';
import { SimpleWebAuthnAdapter } from '../../../../../../src/modules/authentication/infrastructure/passkeys/simplewebauthn-adapter';

const credentialId = Buffer.from('registered-credential').toString('base64url');
const userHandle = Buffer.alloc(32, 7).toString('base64url');

describe('SimpleWebAuthnAdapter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('generates resident, user-verified registration options for five minutes', async () => {
        const options = await createAdapter().generateRegistrationOptions({
            displayName: 'user@example.com',
            excludeCredentials: [
                {
                    id: credentialId,
                    transports: ['internal'],
                    type: 'public-key',
                },
            ],
            userHandle,
            userName: 'user@example.com',
        });

        expect(options).toMatchObject({
            attestation: 'none',
            authenticatorSelection: {
                requireResidentKey: true,
                residentKey: 'required',
                userVerification: 'required',
            },
            excludeCredentials: [
                {
                    id: credentialId,
                    transports: ['internal'],
                    type: 'public-key',
                },
            ],
            rp: { id: 'example.com', name: 'Languon' },
            timeout: 300_000,
            user: {
                displayName: 'user@example.com',
                id: userHandle,
                name: 'user@example.com',
            },
        });
        expect(options.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(options.pubKeyCredParams.length).toBeGreaterThan(0);
        expect(options).not.toHaveProperty('extensions');
    });

    it('generates discoverable, user-verified authentication options', async () => {
        const options = await createAdapter().generateAuthenticationOptions();

        expect(options).toEqual({
            challenge: expect.stringMatching(/^[A-Za-z0-9_-]+$/),
            rpId: 'example.com',
            timeout: 300_000,
            userVerification: 'required',
        });
        expect(options).not.toHaveProperty('allowCredentials');
    });

    it('verifies registration against only the configured RP and origins', async () => {
        const credential = registrationCredential();
        webAuthnMocks.verifyRegistrationResponse.mockResolvedValue({
            registrationInfo: {
                credential: {
                    counter: 0,
                    id: credentialId,
                    publicKey: new Uint8Array([1, 2, 3]),
                },
                credentialBackedUp: true,
                credentialDeviceType: 'multiDevice',
                userVerified: true,
            },
            verified: true,
        });

        await expect(
            createAdapter().verifyRegistration({
                credential,
                expectedChallenge: 'expected-challenge',
            }),
        ).resolves.toEqual({
            backedUp: true,
            counter: 0,
            credentialId,
            credentialPublicKey: new Uint8Array([1, 2, 3]),
            deviceType: 'multi_device',
            transports: ['internal', 'hybrid'],
        });
        expect(webAuthnMocks.verifyRegistrationResponse).toHaveBeenCalledWith(
            expect.objectContaining({
                expectedChallenge: 'expected-challenge',
                expectedOrigin: [
                    'https://example.com',
                    'https://app.example.com',
                ],
                expectedRPID: 'example.com',
                expectedType: 'webauthn.create',
                requireUserPresence: true,
                requireUserVerification: true,
                response: credential,
            }),
        );
    });

    it('verifies discoverable authentication and advances credential state', async () => {
        const credential = authenticationCredential();
        webAuthnMocks.verifyAuthenticationResponse.mockResolvedValue({
            authenticationInfo: {
                credentialBackedUp: true,
                credentialDeviceType: 'multiDevice',
                credentialID: credentialId,
                newCounter: 8,
                userVerified: true,
            },
            verified: true,
        });

        await expect(
            createAdapter().verifyAuthentication({
                credential,
                expectedChallenge: 'expected-challenge',
                storedCredential: storedCredential(),
            }),
        ).resolves.toEqual({
            backedUp: true,
            counter: 8,
            credentialId,
            deviceType: 'multi_device',
            userHandle,
        });
        expect(webAuthnMocks.verifyAuthenticationResponse).toHaveBeenCalledWith(
            expect.objectContaining({
                credential: {
                    counter: 7,
                    id: credentialId,
                    publicKey: new Uint8Array([1, 2, 3]),
                    transports: ['internal'],
                },
                expectedChallenge: 'expected-challenge',
                expectedOrigin: [
                    'https://example.com',
                    'https://app.example.com',
                ],
                expectedRPID: 'example.com',
                expectedType: 'webauthn.get',
                requireUserVerification: true,
                response: credential,
            }),
        );
    });

    it('rejects mismatched credential IDs before protocol verification', async () => {
        const credential = authenticationCredential();
        credential.rawId = Buffer.from('different').toString('base64url');

        await expect(
            createAdapter().verifyAuthentication({
                credential,
                expectedChallenge: 'expected-challenge',
                storedCredential: storedCredential(),
            }),
        ).rejects.toThrow(PasskeyVerificationError);
        expect(
            webAuthnMocks.verifyAuthenticationResponse,
        ).not.toHaveBeenCalled();
    });

    it('rejects a discoverable assertion for another user handle', async () => {
        const credential = authenticationCredential();
        credential.response.userHandle = Buffer.alloc(32, 8).toString(
            'base64url',
        );

        await expect(
            createAdapter().verifyAuthentication({
                credential,
                expectedChallenge: 'expected-challenge',
                storedCredential: storedCredential(),
            }),
        ).rejects.toThrow(PasskeyVerificationError);
        expect(
            webAuthnMocks.verifyAuthenticationResponse,
        ).not.toHaveBeenCalled();
    });

    it('accepts authenticators that consistently report a zero counter', async () => {
        webAuthnMocks.verifyAuthenticationResponse.mockResolvedValue({
            authenticationInfo: {
                credentialBackedUp: true,
                credentialDeviceType: 'multiDevice',
                credentialID: credentialId,
                newCounter: 0,
                userVerified: true,
            },
            verified: true,
        });

        await expect(
            createAdapter().verifyAuthentication({
                credential: authenticationCredential(),
                expectedChallenge: 'expected-challenge',
                storedCredential: { ...storedCredential(), counter: 0 },
            }),
        ).resolves.toMatchObject({ counter: 0 });
    });

    it.each([
        {
            name: 'user verification is absent',
            result: {
                credentialBackedUp: true,
                credentialDeviceType: 'multiDevice',
                credentialID: credentialId,
                newCounter: 8,
                userVerified: false,
            },
        },
        {
            name: 'the counter rolls back',
            result: {
                credentialBackedUp: true,
                credentialDeviceType: 'multiDevice',
                credentialID: credentialId,
                newCounter: 6,
                userVerified: true,
            },
        },
        {
            name: 'the backup eligibility changes',
            result: {
                credentialBackedUp: false,
                credentialDeviceType: 'singleDevice',
                credentialID: credentialId,
                newCounter: 8,
                userVerified: true,
            },
        },
    ])('rejects authentication when $name', async ({ result }) => {
        webAuthnMocks.verifyAuthenticationResponse.mockResolvedValue({
            authenticationInfo: result,
            verified: true,
        });

        await expect(
            createAdapter().verifyAuthentication({
                credential: authenticationCredential(),
                expectedChallenge: 'expected-challenge',
                storedCredential: storedCredential(),
            }),
        ).rejects.toThrow(PasskeyVerificationError);
    });

    it('maps WebAuthn library failures to one application-safe error', async () => {
        webAuthnMocks.verifyRegistrationResponse.mockRejectedValue(
            new Error('origin mismatch with detailed client data'),
        );

        await expect(
            createAdapter().verifyRegistration({
                credential: registrationCredential(),
                expectedChallenge: 'expected-challenge',
            }),
        ).rejects.toEqual(new PasskeyVerificationError());
    });

    it('rejects non-exact relying-party configuration and invalid user handles', async () => {
        expect(
            () =>
                new SimpleWebAuthnAdapter({
                    origins: ['https://example.com/'],
                    rpId: 'example.com',
                    rpName: 'Languon',
                }),
        ).toThrow(RangeError);
        expect(
            () =>
                new SimpleWebAuthnAdapter({
                    origins: ['https://attacker.example'],
                    rpId: 'example.com',
                    rpName: 'Languon',
                }),
        ).toThrow(RangeError);

        await expect(
            createAdapter().generateRegistrationOptions({
                displayName: 'user@example.com',
                excludeCredentials: [],
                userHandle: 'not/base64url',
                userName: 'user@example.com',
            }),
        ).rejects.toThrow(RangeError);
    });
});

function createAdapter(): SimpleWebAuthnAdapter {
    return new SimpleWebAuthnAdapter({
        origins: ['https://example.com', 'https://app.example.com'],
        rpId: 'example.com',
        rpName: 'Languon',
    });
}

function registrationCredential(): PasskeyRegistrationCredential {
    return {
        clientExtensionResults: { credProps: { rk: true } },
        id: credentialId,
        rawId: credentialId,
        response: {
            attestationObject: 'attestation',
            clientDataJSON: 'client-data',
            transports: ['internal', 'hybrid'],
        },
        type: 'public-key',
    };
}

function authenticationCredential(): PasskeyAuthenticationCredential {
    return {
        clientExtensionResults: {},
        id: credentialId,
        rawId: credentialId,
        response: {
            authenticatorData: 'authenticator-data',
            clientDataJSON: 'client-data',
            signature: 'signature',
            userHandle,
        },
        type: 'public-key',
    };
}

function storedCredential() {
    return {
        backedUp: true,
        counter: 7,
        credentialId,
        credentialPublicKey: new Uint8Array([1, 2, 3]),
        deviceType: 'multi_device' as const,
        transports: ['internal' as const],
        userHandle,
    };
}
