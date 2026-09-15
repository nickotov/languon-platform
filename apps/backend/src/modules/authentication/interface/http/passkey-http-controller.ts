import type { AccessTokenSigner } from '../../application/ports/access-token';
import type { AuthenticationService } from '../../application/authentication-service';
import type { PasskeyClientExtensionResults } from '../../application/ports/passkey-verifier';
import type { AuthHttpRequestMetadata } from './authentication-http-operations';
import type {
    PasskeyAuthenticationHttpResult,
    PasskeyHttpOperations,
} from './passkey-http-operations';

function metadata(passkey: {
    createdAt: Date;
    id: string;
    lastUsedAt: Date | null;
    name: string;
}) {
    return {
        createdAt: passkey.createdAt.toISOString(),
        id: passkey.id,
        lastUsedAt: passkey.lastUsedAt?.toISOString() ?? null,
        name: passkey.name,
    };
}

function extensionResults(input: {
    credProps?: { rk?: boolean | undefined } | undefined;
}): PasskeyClientExtensionResults {
    if (!input.credProps) return {};
    return {
        credProps:
            input.credProps.rk === undefined ? {} : { rk: input.credProps.rk },
    };
}

function successResponse(
    success: Awaited<
        ReturnType<AuthenticationService['finishPasskeyAuthentication']>
    >,
) {
    return {
        accessToken: success.accessToken,
        accessTokenExpiresAt: success.accessTokenExpiresAt.toISOString(),
        session: {
            authenticatedAt: success.session.authenticatedAt.toISOString(),
            createdAt: success.session.createdAt.toISOString(),
            expiresAt: success.session.expiresAt.toISOString(),
            id: success.session.id,
            recentAuthenticationExpiresAt:
                success.session.recentAuthenticationExpiresAt?.toISOString() ??
                null,
        },
        status: 'authenticated' as const,
        tokenType: 'Bearer' as const,
        user: {
            createdAt: success.user.createdAt.toISOString(),
            emailVerified: true as const,
            id: success.user.id,
            handle: success.user.handle,
            primaryEmail: success.user.primaryEmail.toLowerCase(),
            status: 'active' as const,
        },
    };
}

export class PasskeyHttpController implements PasskeyHttpOperations {
    public constructor(
        private readonly authentication: AuthenticationService,
        private readonly accessTokens: AccessTokenSigner,
    ) {}

    public async registrationOptions(
        accessToken: string,
        request: AuthHttpRequestMetadata,
    ) {
        const claims = await this.accessTokens.verify(accessToken);
        const result = await this.authentication.beginPasskeyRegistration({
            context: context(request),
            sessionId: claims.sessionId,
            userId: claims.userId,
        });
        return {
            expiresAt: result.expiresAt.toISOString(),
            flowId: result.flowId,
            options: result.options,
        };
    }

    public async verifyRegistration(
        accessToken: string,
        input: Parameters<PasskeyHttpOperations['verifyRegistration']>[1],
        request: AuthHttpRequestMetadata,
    ) {
        const claims = await this.accessTokens.verify(accessToken);
        const result = await this.authentication.finishPasskeyRegistration({
            context: context(request),
            credential: {
                clientExtensionResults: extensionResults(
                    input.credential.clientExtensionResults,
                ),
                id: input.credential.id,
                rawId: input.credential.rawId,
                response: {
                    attestationObject:
                        input.credential.response.attestationObject,
                    clientDataJSON: input.credential.response.clientDataJSON,
                    ...(input.credential.response.authenticatorData
                        ? {
                              authenticatorData:
                                  input.credential.response.authenticatorData,
                          }
                        : {}),
                    ...(input.credential.response.publicKey
                        ? { publicKey: input.credential.response.publicKey }
                        : {}),
                    ...(input.credential.response.publicKeyAlgorithm ===
                    undefined
                        ? {}
                        : {
                              publicKeyAlgorithm:
                                  input.credential.response.publicKeyAlgorithm,
                          }),
                    ...(input.credential.response.transports
                        ? { transports: input.credential.response.transports }
                        : {}),
                },
                type: 'public-key',
                ...(input.credential.authenticatorAttachment
                    ? {
                          authenticatorAttachment:
                              input.credential.authenticatorAttachment,
                      }
                    : {}),
            },
            flowId: input.flowId,
            name: input.name,
            sessionId: claims.sessionId,
            userId: claims.userId,
        });
        return {
            passkey: metadata(result.passkey),
            status: result.status,
        };
    }

    public async authenticationOptions(request: AuthHttpRequestMetadata) {
        const result = await this.authentication.beginPasskeyAuthentication({
            context: context(request),
        });
        return {
            expiresAt: result.expiresAt.toISOString(),
            flowId: result.flowId,
            options: result.options,
        };
    }

    public async verifyAuthentication(
        input: Parameters<PasskeyHttpOperations['verifyAuthentication']>[0],
        request: AuthHttpRequestMetadata,
    ): Promise<PasskeyAuthenticationHttpResult> {
        const result = await this.authentication.finishPasskeyAuthentication({
            context: context(request),
            credential: {
                clientExtensionResults: extensionResults(
                    input.credential.clientExtensionResults,
                ),
                id: input.credential.id,
                rawId: input.credential.rawId,
                response: input.credential.response,
                type: 'public-key',
                ...(input.credential.authenticatorAttachment
                    ? {
                          authenticatorAttachment:
                              input.credential.authenticatorAttachment,
                      }
                    : {}),
            },
            flowId: input.flowId,
        });
        return {
            refreshCredential: result.refreshCredential,
            response: successResponse(result),
        };
    }

    public async list(accessToken: string, _request: AuthHttpRequestMetadata) {
        const claims = await this.accessTokens.verify(accessToken);
        return {
            passkeys: (
                await this.authentication.listPasskeys({
                    sessionId: claims.sessionId,
                    userId: claims.userId,
                })
            ).map(metadata),
        };
    }

    public async rename(
        accessToken: string,
        passkeyId: string,
        input: Parameters<PasskeyHttpOperations['rename']>[2],
        request: AuthHttpRequestMetadata,
    ) {
        const claims = await this.accessTokens.verify(accessToken);
        return {
            passkey: metadata(
                await this.authentication.renamePasskey({
                    context: context(request),
                    name: input.name,
                    passkeyId,
                    sessionId: claims.sessionId,
                    userId: claims.userId,
                }),
            ),
        };
    }

    public async revoke(
        accessToken: string,
        passkeyId: string,
        request: AuthHttpRequestMetadata,
    ) {
        const claims = await this.accessTokens.verify(accessToken);
        return this.authentication.revokePasskey({
            context: context(request),
            passkeyId,
            sessionId: claims.sessionId,
            userId: claims.userId,
        });
    }
}

function context(metadata: AuthHttpRequestMetadata) {
    return {
        clientAddress: metadata.clientAddress,
        correlationId: metadata.correlationId,
        signal: metadata.signal,
    };
}
