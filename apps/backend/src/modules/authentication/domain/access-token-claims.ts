export interface AccessTokenClaimsProperties {
  audience: string;
  expiresAt: Date;
  issuedAt: Date;
  issuer: string;
  sessionId: string;
  tokenId: string;
  userId: string;
}

export interface AccessTokenJwtPayload {
  aud: string;
  exp: number;
  iat: number;
  iss: string;
  jti: string;
  sid: string;
  sub: string;
}

export class AccessTokenClaims implements AccessTokenClaimsProperties {
  public readonly audience: string;
  public readonly expiresAt: Date;
  public readonly issuedAt: Date;
  public readonly issuer: string;
  public readonly sessionId: string;
  public readonly tokenId: string;
  public readonly userId: string;

  private constructor(properties: AccessTokenClaimsProperties) {
    this.audience = properties.audience;
    this.expiresAt = properties.expiresAt;
    this.issuedAt = properties.issuedAt;
    this.issuer = properties.issuer;
    this.sessionId = properties.sessionId;
    this.tokenId = properties.tokenId;
    this.userId = properties.userId;
    Object.freeze(this);
  }

  public static issue(
    properties: AccessTokenClaimsProperties,
  ): AccessTokenClaims {
    if (properties.expiresAt <= properties.issuedAt) {
      throw new RangeError("An access token must expire after issue.");
    }
    return new AccessTokenClaims(properties);
  }

  public toJwtPayload(): AccessTokenJwtPayload {
    return {
      aud: this.audience,
      exp: Math.floor(this.expiresAt.getTime() / 1000),
      iat: Math.floor(this.issuedAt.getTime() / 1000),
      iss: this.issuer,
      jti: this.tokenId,
      sid: this.sessionId,
      sub: this.userId,
    };
  }
}
