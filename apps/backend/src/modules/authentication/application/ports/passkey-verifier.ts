import type { PasskeyDeviceType } from '../../domain/passkey';

export type PasskeyAuthenticatorTransport =
    'ble' | 'cable' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb';

export interface PasskeyCredentialDescriptor {
    id: string;
    transports?: PasskeyAuthenticatorTransport[];
    type: 'public-key';
}

export interface PasskeyClientExtensionResults {
    credProps?: { rk?: boolean };
}

export interface PasskeyRegistrationCredential {
    authenticatorAttachment?: 'cross-platform' | 'platform';
    clientExtensionResults: PasskeyClientExtensionResults;
    id: string;
    rawId: string;
    response: {
        attestationObject: string;
        authenticatorData?: string;
        clientDataJSON: string;
        publicKey?: string;
        publicKeyAlgorithm?: number;
        transports?: PasskeyAuthenticatorTransport[];
    };
    type: 'public-key';
}

export interface PasskeyAuthenticationCredential {
    authenticatorAttachment?: 'cross-platform' | 'platform';
    clientExtensionResults: PasskeyClientExtensionResults;
    id: string;
    rawId: string;
    response: {
        authenticatorData: string;
        clientDataJSON: string;
        signature: string;
        userHandle: string;
    };
    type: 'public-key';
}

export interface PasskeyRegistrationOptions {
    attestation: 'none';
    authenticatorSelection: {
        requireResidentKey: true;
        residentKey: 'required';
        userVerification: 'required';
    };
    challenge: string;
    excludeCredentials?: PasskeyCredentialDescriptor[];
    pubKeyCredParams: Array<{ alg: number; type: 'public-key' }>;
    rp: { id: string; name: string };
    timeout: number;
    user: { displayName: string; id: string; name: string };
}

export interface PasskeyAuthenticationOptions {
    challenge: string;
    rpId: string;
    timeout: number;
    userVerification: 'required';
}

export interface VerifiedPasskeyRegistration {
    backedUp: boolean;
    counter: number;
    credentialId: string;
    credentialPublicKey: Uint8Array;
    deviceType: PasskeyDeviceType;
    transports: PasskeyAuthenticatorTransport[];
}

export interface VerifiedPasskeyAuthentication {
    backedUp: boolean;
    counter: number;
    credentialId: string;
    deviceType: PasskeyDeviceType;
    userHandle: string;
}

export class PasskeyVerificationError extends Error {
    public constructor() {
        super('The passkey response could not be verified.');
        this.name = 'PasskeyVerificationError';
    }
}

export interface PasskeyVerifier {
    generateAuthenticationOptions(): Promise<PasskeyAuthenticationOptions>;
    generateRegistrationOptions(input: {
        displayName: string;
        excludeCredentials: PasskeyCredentialDescriptor[];
        userHandle: string;
        userName: string;
    }): Promise<PasskeyRegistrationOptions>;
    verifyAuthentication(input: {
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
    }): Promise<VerifiedPasskeyAuthentication>;
    verifyRegistration(input: {
        credential: PasskeyRegistrationCredential;
        expectedChallenge: string;
    }): Promise<VerifiedPasskeyRegistration>;
}
