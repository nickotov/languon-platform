import type {
  AuthenticationSuccessResponse,
  CurrentUserResponse,
} from "@languon/contracts";

import type { AccessTokenSigner } from "../../application/ports/access-token";
import type { AuthenticationService } from "../../application/authentication-service";
import type {
  AuthHttpRequestMetadata,
  AuthenticationHttpOperations,
  AuthenticationHttpResult,
  PasswordLoginHttpResult,
} from "./authentication-http-operations";

function context(metadata: AuthHttpRequestMetadata) {
  return {
    clientAddress: metadata.clientAddress,
    correlationId: metadata.correlationId,
    signal: metadata.signal,
  };
}

function successResponse(
  success: Awaited<ReturnType<AuthenticationService["verifyEmail"]>>,
): AuthenticationSuccessResponse {
  return {
    accessToken: success.accessToken,
    accessTokenExpiresAt: success.accessTokenExpiresAt.toISOString(),
    session: {
      authenticatedAt: success.session.authenticatedAt.toISOString(),
      createdAt: success.session.createdAt.toISOString(),
      expiresAt: success.session.expiresAt.toISOString(),
      id: success.session.id,
      recentAuthenticationExpiresAt:
        success.session.recentAuthenticationExpiresAt?.toISOString() ?? null,
    },
    status: "authenticated",
    tokenType: "Bearer",
    user: {
      createdAt: success.user.createdAt.toISOString(),
      emailVerified: true,
      id: success.user.id,
      primaryEmail: success.user.primaryEmail.toLowerCase(),
      status: "active",
    },
  };
}

function authenticatedResult(
  success: Awaited<ReturnType<AuthenticationService["verifyEmail"]>>,
): AuthenticationHttpResult {
  return {
    refreshCredential: success.refreshCredential,
    response: successResponse(success),
  };
}

function flow(flow: {
  expiresAt: Date;
  flowId: string;
  resendAvailableAt: Date;
}) {
  return {
    expiresAt: flow.expiresAt.toISOString(),
    flowId: flow.flowId,
    resendAvailableAt: flow.resendAvailableAt.toISOString(),
  };
}

export class AuthenticationHttpController implements AuthenticationHttpOperations {
  public constructor(
    private readonly authentication: AuthenticationService,
    private readonly accessTokens: AccessTokenSigner,
  ) {}

  public async capabilities() {
    return {
      ...this.authentication.capabilities(),
      passkeys: { authentication: true, registration: true },
    };
  }

  public async signUp(
    input: Parameters<AuthenticationHttpOperations["signUp"]>[0],
    metadata: AuthHttpRequestMetadata,
  ) {
    const result = await this.authentication.signUp({
      ...input,
      context: context(metadata),
    });
    return {
      status: result.status,
      verification: flow(result.verification),
    };
  }

  public async resendEmailVerification(
    input: Parameters<
      AuthenticationHttpOperations["resendEmailVerification"]
    >[0],
    metadata: AuthHttpRequestMetadata,
  ) {
    const result = await this.authentication.resendEmailVerification({
      ...input,
      context: context(metadata),
    });
    return {
      status: result.status,
      verification: flow(result.verification),
    };
  }

  public async verifyEmail(
    input: Parameters<AuthenticationHttpOperations["verifyEmail"]>[0],
    metadata: AuthHttpRequestMetadata,
  ) {
    return authenticatedResult(
      await this.authentication.verifyEmail({
        ...input,
        context: context(metadata),
      }),
    );
  }

  public async loginWithPassword(
    input: Parameters<AuthenticationHttpOperations["loginWithPassword"]>[0],
    metadata: AuthHttpRequestMetadata,
  ): Promise<PasswordLoginHttpResult> {
    const result = await this.authentication.passwordLogin({
      ...input,
      context: context(metadata),
    });
    if (result.status === "email_verification_required") {
      return {
        response: {
          status: result.status,
          verification: flow(result.verification),
        },
      };
    }
    return authenticatedResult(result);
  }

  public async forgotPassword(
    input: Parameters<AuthenticationHttpOperations["forgotPassword"]>[0],
    metadata: AuthHttpRequestMetadata,
  ) {
    const result = await this.authentication.forgotPassword({
      ...input,
      context: context(metadata),
    });
    return { recovery: flow(result.recovery), status: result.status };
  }

  public resetPassword(
    input: Parameters<AuthenticationHttpOperations["resetPassword"]>[0],
    metadata: AuthHttpRequestMetadata,
  ) {
    return this.authentication.resetPassword({
      ...input,
      context: context(metadata),
    });
  }

  public async refresh(
    refreshCredential: string,
    metadata: AuthHttpRequestMetadata,
  ) {
    return authenticatedResult(
      await this.authentication.refresh({
        context: context(metadata),
        refreshCredential,
      }),
    );
  }

  public logout(
    refreshCredential: string | null,
    metadata: AuthHttpRequestMetadata,
  ) {
    return this.authentication.logout({
      context: context(metadata),
      refreshCredential,
    });
  }

  public async logoutAll(
    accessToken: string,
    _refreshCredential: string | null,
    metadata: AuthHttpRequestMetadata,
  ) {
    const claims = await this.requirePrincipal(accessToken);
    await this.authentication.requireActiveSession({
      sessionId: claims.sessionId,
      userId: claims.userId,
    });
    return this.authentication.logoutAll({
      context: context(metadata),
      userId: claims.userId,
    });
  }

  public async changePassword(
    accessToken: string,
    input: Parameters<AuthenticationHttpOperations["changePassword"]>[1],
    metadata: AuthHttpRequestMetadata,
  ) {
    const claims = await this.requirePrincipal(accessToken);
    await this.authentication.requireActiveSession({
      sessionId: claims.sessionId,
      userId: claims.userId,
    });
    return authenticatedResult(
      await this.authentication.changePassword({
        ...input,
        context: context(metadata),
        userId: claims.userId,
      }),
    );
  }

  public async currentUser(
    accessToken: string,
    _metadata: AuthHttpRequestMetadata,
  ): Promise<CurrentUserResponse> {
    const claims = await this.requirePrincipal(accessToken);
    const { account, session } = await this.authentication.requireActiveSession(
      {
        sessionId: claims.sessionId,
        userId: claims.userId,
      },
    );
    return {
      session: {
        authenticatedAt: session.authenticatedAt.toISOString(),
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.absoluteExpiresAt.toISOString(),
        id: session.id,
        recentAuthenticationExpiresAt: null,
      },
      user: {
        createdAt: account.createdAt.toISOString(),
        emailVerified: true,
        id: account.userId,
        primaryEmail: account.email.toLowerCase(),
        status: "active",
      },
    };
  }

  private requirePrincipal(accessToken: string) {
    return this.accessTokens.verify(accessToken);
  }
}
