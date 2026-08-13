export type SessionRevocationReason =
  | "disabled_user"
  | "logout"
  | "logout_all"
  | "password_change"
  | "password_reset"
  | "refresh_replay";

export interface RefreshSessionProperties {
  authenticatedAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
  familyId: string;
  id: string;
  refreshDigest: string;
  revokedAt: Date | null;
  revocationReason: SessionRevocationReason | null;
  successorId: string | null;
  userId: string;
}

export type RefreshSessionUnavailableReason =
  "consumed" | "expired" | "revoked";

export class RefreshSessionUnavailableError extends Error {
  public constructor(public readonly reason: RefreshSessionUnavailableReason) {
    super("The refresh session is unavailable.");
    this.name = "RefreshSessionUnavailableError";
  }
}

export class RefreshSession implements RefreshSessionProperties {
  public readonly authenticatedAt: Date;
  public readonly consumedAt: Date | null;
  public readonly createdAt: Date;
  public readonly expiresAt: Date;
  public readonly familyId: string;
  public readonly id: string;
  public readonly refreshDigest: string;
  public readonly revokedAt: Date | null;
  public readonly revocationReason: SessionRevocationReason | null;
  public readonly successorId: string | null;
  public readonly userId: string;

  private constructor(properties: RefreshSessionProperties) {
    this.authenticatedAt = properties.authenticatedAt;
    this.consumedAt = properties.consumedAt;
    this.createdAt = properties.createdAt;
    this.expiresAt = properties.expiresAt;
    this.familyId = properties.familyId;
    this.id = properties.id;
    this.refreshDigest = properties.refreshDigest;
    this.revokedAt = properties.revokedAt;
    this.revocationReason = properties.revocationReason;
    this.successorId = properties.successorId;
    this.userId = properties.userId;
    Object.freeze(this);
  }

  public static issue(
    properties: Omit<
      RefreshSessionProperties,
      | "consumedAt"
      | "createdAt"
      | "revokedAt"
      | "revocationReason"
      | "successorId"
    > & { issuedAt: Date },
  ): RefreshSession {
    if (properties.expiresAt <= properties.issuedAt) {
      throw new RangeError("A refresh session must expire after issue.");
    }

    return new RefreshSession({
      authenticatedAt: properties.authenticatedAt,
      consumedAt: null,
      createdAt: properties.issuedAt,
      expiresAt: properties.expiresAt,
      familyId: properties.familyId,
      id: properties.id,
      refreshDigest: properties.refreshDigest,
      revokedAt: null,
      revocationReason: null,
      successorId: null,
      userId: properties.userId,
    });
  }

  public static restore(properties: RefreshSessionProperties): RefreshSession {
    return new RefreshSession(properties);
  }

  public revoke(now: Date, reason: SessionRevocationReason): RefreshSession {
    if (this.revokedAt) {
      return this;
    }

    return this.copy({ revokedAt: now, revocationReason: reason });
  }

  public rotate(input: { id: string; now: Date; refreshDigest: string }): {
    consumed: RefreshSession;
    successor: RefreshSession;
  } {
    if (this.revokedAt) {
      throw new RefreshSessionUnavailableError("revoked");
    }
    if (this.consumedAt) {
      throw new RefreshSessionUnavailableError("consumed");
    }
    if (input.now >= this.expiresAt) {
      throw new RefreshSessionUnavailableError("expired");
    }

    return {
      consumed: this.copy({ consumedAt: input.now, successorId: input.id }),
      successor: RefreshSession.issue({
        authenticatedAt: this.authenticatedAt,
        expiresAt: this.expiresAt,
        familyId: this.familyId,
        id: input.id,
        issuedAt: input.now,
        refreshDigest: input.refreshDigest,
        userId: this.userId,
      }),
    };
  }

  private copy(changes: Partial<RefreshSessionProperties>): RefreshSession {
    return new RefreshSession({ ...this.toProperties(), ...changes });
  }

  public toProperties(): RefreshSessionProperties {
    return {
      authenticatedAt: this.authenticatedAt,
      consumedAt: this.consumedAt,
      createdAt: this.createdAt,
      expiresAt: this.expiresAt,
      familyId: this.familyId,
      id: this.id,
      refreshDigest: this.refreshDigest,
      revokedAt: this.revokedAt,
      revocationReason: this.revocationReason,
      successorId: this.successorId,
      userId: this.userId,
    };
  }
}
