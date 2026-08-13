import { AccessTokenClaims } from "../domain/access-token-claims";
import type { AccessTokenSigner } from "./ports/access-token";
import type {
  AuthenticationAccount,
  AuthenticationMethod,
  NewStoredAuthenticationSession,
  StoredAuthenticationSession,
} from "./ports/auth-store";
import type { Clock } from "./ports/clock";
import type { IdGenerator } from "./ports/id-generator";
import type { RefreshCredentialService } from "./ports/refresh-credential";

export interface SessionIssuerConfiguration {
  accessTokenAudience: string;
  accessTokenIssuer: string;
  accessTokenTtlMs: number;
  recentAuthenticationTtlMs?: number;
  refreshTokenTtlMs: number;
}

export interface PreparedAuthenticationSession {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshCredential: string;
  storedSession: NewStoredAuthenticationSession;
}

export interface AuthenticationSuccess {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshCredential: string;
  status: "authenticated";
  session: {
    authenticatedAt: Date;
    createdAt: Date;
    expiresAt: Date;
    id: string;
    recentAuthenticationExpiresAt: Date | null;
  };
  tokenType: "Bearer";
  user: {
    createdAt: Date;
    emailVerified: true;
    id: string;
    primaryEmail: string;
    status: "active";
  };
}

const defaultRecentAuthenticationTtlMs = 5 * 60 * 1_000;

export class SessionIssuer {
  private readonly recentAuthenticationTtlMs: number;

  public constructor(
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly refreshCredentials: RefreshCredentialService,
    private readonly accessTokens: AccessTokenSigner,
    private readonly configuration: SessionIssuerConfiguration,
  ) {
    assertPositiveDuration(configuration.accessTokenTtlMs, "access token");
    assertPositiveDuration(configuration.refreshTokenTtlMs, "refresh token");
    this.recentAuthenticationTtlMs =
      configuration.recentAuthenticationTtlMs ??
      defaultRecentAuthenticationTtlMs;
    assertPositiveDuration(
      this.recentAuthenticationTtlMs,
      "recent authentication",
    );
  }

  public prepareInitial(input: {
    clientLabel?: string;
    method: AuthenticationMethod;
    userId: string;
  }): Promise<PreparedAuthenticationSession> {
    const now = this.clock.now();

    return this.prepare({
      absoluteExpiresAt: new Date(
        now.getTime() + this.configuration.refreshTokenTtlMs,
      ),
      authenticatedAt: now,
      clientLabel: input.clientLabel ?? null,
      familyId: this.ids.generate(),
      method: input.method,
      predecessorSessionId: null,
      userId: input.userId,
    });
  }

  public prepareReplacement(input: {
    clientLabel?: string;
    method: AuthenticationMethod;
    userId: string;
  }): Promise<PreparedAuthenticationSession> {
    return this.prepareInitial(input);
  }

  public prepareSuccessor(
    predecessor: StoredAuthenticationSession,
  ): Promise<PreparedAuthenticationSession> {
    return this.prepare({
      absoluteExpiresAt: predecessor.absoluteExpiresAt,
      authenticatedAt: predecessor.authenticatedAt,
      clientLabel: predecessor.clientLabel,
      familyId: predecessor.familyId,
      method: predecessor.authenticationMethod,
      predecessorSessionId: predecessor.id,
      userId: predecessor.userId,
    });
  }

  public toSuccess(
    prepared: PreparedAuthenticationSession,
    account: AuthenticationAccount,
  ): AuthenticationSuccess {
    if (account.status !== "active" || !account.emailVerifiedAt) {
      throw new TypeError("Only an active verified account can authenticate.");
    }

    const now = this.clock.now();
    const recentAuthenticationExpiresAt = new Date(
      prepared.storedSession.authenticatedAt.getTime() +
        this.recentAuthenticationTtlMs,
    );

    return {
      accessToken: prepared.accessToken,
      accessTokenExpiresAt: prepared.accessTokenExpiresAt,
      refreshCredential: prepared.refreshCredential,
      status: "authenticated",
      session: {
        authenticatedAt: prepared.storedSession.authenticatedAt,
        createdAt: prepared.storedSession.createdAt,
        expiresAt: prepared.storedSession.absoluteExpiresAt,
        id: prepared.storedSession.id,
        recentAuthenticationExpiresAt:
          recentAuthenticationExpiresAt > now
            ? recentAuthenticationExpiresAt
            : null,
      },
      tokenType: "Bearer",
      user: {
        createdAt: account.createdAt,
        emailVerified: true,
        id: account.userId,
        primaryEmail: account.email,
        status: "active",
      },
    };
  }

  public isRecentlyAuthenticated(
    session: StoredAuthenticationSession,
  ): boolean {
    return (
      session.authenticatedAt.getTime() + this.recentAuthenticationTtlMs >
      this.clock.now().getTime()
    );
  }

  private async prepare(input: {
    absoluteExpiresAt: Date;
    authenticatedAt: Date;
    clientLabel: string | null;
    familyId: string;
    method: AuthenticationMethod;
    predecessorSessionId: string | null;
    userId: string;
  }): Promise<PreparedAuthenticationSession> {
    const now = this.clock.now();
    if (input.absoluteExpiresAt <= now) {
      throw new RangeError("A session cannot be issued after its expiry.");
    }

    const id = this.ids.generate();
    const refreshCredential = this.refreshCredentials.issue();
    const accessTokenExpiresAt = new Date(
      Math.min(
        now.getTime() + this.configuration.accessTokenTtlMs,
        input.absoluteExpiresAt.getTime(),
      ),
    );
    const claims = AccessTokenClaims.issue({
      audience: this.configuration.accessTokenAudience,
      expiresAt: accessTokenExpiresAt,
      issuedAt: now,
      issuer: this.configuration.accessTokenIssuer,
      sessionId: id,
      tokenId: this.ids.generate(),
      userId: input.userId,
    });
    const accessToken = await this.accessTokens.sign(claims);

    return {
      accessToken,
      accessTokenExpiresAt,
      refreshCredential: refreshCredential.value,
      storedSession: {
        absoluteExpiresAt: input.absoluteExpiresAt,
        authenticatedAt: input.authenticatedAt,
        authenticationMethod: input.method,
        clientLabel: input.clientLabel,
        consumedAt: null,
        createdAt: now,
        familyId: input.familyId,
        id,
        predecessorSessionId: input.predecessorSessionId,
        refreshDigest: refreshCredential.digest,
        revokedAt: null,
        revocationReason: null,
        successorId: null,
        userId: input.userId,
      },
    };
  }
}

function assertPositiveDuration(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`The ${label} lifetime must be a positive integer.`);
  }
}
