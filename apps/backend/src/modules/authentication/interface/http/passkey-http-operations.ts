import type {
    AuthenticationSuccessResponse,
    PasskeyAuthenticationOptionsResponse,
    PasskeyAuthenticationVerifyRequest,
    PasskeyListResponse,
    PasskeyRegistrationOptionsResponse,
    PasskeyRegistrationVerifyRequest,
    PasskeyRegistrationVerifyResponse,
    RenamePasskeyRequest,
    RenamePasskeyResponse,
    RevokePasskeyResponse,
} from '@languon/contracts';

import type { AuthHttpRequestMetadata } from './authentication-http-operations';

export interface PasskeyAuthenticationHttpResult {
    refreshCredential: string;
    response: AuthenticationSuccessResponse;
}

export interface PasskeyHttpOperations {
    authenticationOptions(
        metadata: AuthHttpRequestMetadata,
    ): Promise<PasskeyAuthenticationOptionsResponse>;
    list(
        accessToken: string,
        metadata: AuthHttpRequestMetadata,
    ): Promise<PasskeyListResponse>;
    registrationOptions(
        accessToken: string,
        metadata: AuthHttpRequestMetadata,
    ): Promise<PasskeyRegistrationOptionsResponse>;
    rename(
        accessToken: string,
        passkeyId: string,
        input: RenamePasskeyRequest,
        metadata: AuthHttpRequestMetadata,
    ): Promise<RenamePasskeyResponse>;
    revoke(
        accessToken: string,
        passkeyId: string,
        metadata: AuthHttpRequestMetadata,
    ): Promise<RevokePasskeyResponse>;
    verifyAuthentication(
        input: PasskeyAuthenticationVerifyRequest,
        metadata: AuthHttpRequestMetadata,
    ): Promise<PasskeyAuthenticationHttpResult>;
    verifyRegistration(
        accessToken: string,
        input: PasskeyRegistrationVerifyRequest,
        metadata: AuthHttpRequestMetadata,
    ): Promise<PasskeyRegistrationVerifyResponse>;
}
