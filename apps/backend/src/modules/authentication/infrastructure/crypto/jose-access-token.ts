import { jwtVerify, SignJWT } from "jose";

import {
  type AccessTokenSigner,
  InvalidAccessTokenError,
} from "../../application/ports/access-token";
import type { Clock } from "../../application/ports/clock";
import { AccessTokenClaims } from "../../domain/access-token-claims";

const algorithm = "HS256";
const requiredClaims = ["iss", "aud", "sub", "sid", "jti", "iat", "exp"];

export interface JoseAccessTokenSignerOptions {
  audience: string;
  clock: Clock;
  clockToleranceSeconds?: number;
  issuer: string;
  secret: string;
}

export class JoseAccessTokenSigner implements AccessTokenSigner {
  private readonly audience: string;
  private readonly clock: Clock;
  private readonly clockToleranceSeconds: number;
  private readonly issuer: string;
  private readonly key: Uint8Array;

  public constructor(options: JoseAccessTokenSignerOptions) {
    const key = new TextEncoder().encode(options.secret);
    const clockToleranceSeconds = options.clockToleranceSeconds ?? 5;

    if (key.byteLength < 32) {
      throw new RangeError("The JWT secret must contain at least 32 bytes.");
    }
    if (!options.audience || !options.issuer) {
      throw new RangeError("The JWT issuer and audience are required.");
    }
    if (
      !Number.isInteger(clockToleranceSeconds) ||
      clockToleranceSeconds < 0 ||
      clockToleranceSeconds > 30
    ) {
      throw new RangeError(
        "JWT clock tolerance must be an integer from 0 through 30 seconds.",
      );
    }

    this.audience = options.audience;
    this.clock = options.clock;
    this.clockToleranceSeconds = clockToleranceSeconds;
    this.issuer = options.issuer;
    this.key = key;
  }

  public async sign(claims: AccessTokenClaims): Promise<string> {
    if (claims.issuer !== this.issuer || claims.audience !== this.audience) {
      throw new RangeError(
        "Access-token claims must use the configured issuer and audience.",
      );
    }

    assertNonemptyClaims({
      jti: claims.tokenId,
      sid: claims.sessionId,
      sub: claims.userId,
    });

    return new SignJWT({ ...claims.toJwtPayload() })
      .setProtectedHeader({ alg: algorithm, typ: "JWT" })
      .sign(this.key);
  }

  public async verify(token: string): Promise<AccessTokenClaims> {
    try {
      const currentDate = this.clock.now();
      const { payload, protectedHeader } = await jwtVerify(token, this.key, {
        algorithms: [algorithm],
        audience: this.audience,
        clockTolerance: this.clockToleranceSeconds,
        currentDate,
        issuer: this.issuer,
        requiredClaims,
        typ: "JWT",
      });

      if (
        protectedHeader.alg !== algorithm ||
        protectedHeader.typ !== "JWT" ||
        payload.aud !== this.audience ||
        payload.iss !== this.issuer ||
        typeof payload.sub !== "string" ||
        typeof payload.sid !== "string" ||
        typeof payload.jti !== "string" ||
        typeof payload.iat !== "number" ||
        typeof payload.exp !== "number" ||
        !Number.isInteger(payload.iat) ||
        !Number.isInteger(payload.exp)
      ) {
        throw new InvalidAccessTokenError();
      }

      assertNonemptyClaims({
        jti: payload.jti,
        sid: payload.sid,
        sub: payload.sub,
      });

      const expiresAt = payload.exp;
      const issuedAt = payload.iat;
      const nowSeconds = Math.floor(currentDate.getTime() / 1000);
      if (
        issuedAt > nowSeconds + this.clockToleranceSeconds ||
        expiresAt <= issuedAt
      ) {
        throw new InvalidAccessTokenError();
      }

      return AccessTokenClaims.issue({
        audience: payload.aud,
        expiresAt: new Date(expiresAt * 1000),
        issuedAt: new Date(issuedAt * 1000),
        issuer: payload.iss,
        sessionId: payload.sid,
        tokenId: payload.jti,
        userId: payload.sub,
      });
    } catch {
      throw new InvalidAccessTokenError();
    }
  }
}

function assertNonemptyClaims(claims: {
  jti: string;
  sid: string;
  sub: string;
}): void {
  if (!claims.jti || !claims.sid || !claims.sub) {
    throw new InvalidAccessTokenError();
  }
}
