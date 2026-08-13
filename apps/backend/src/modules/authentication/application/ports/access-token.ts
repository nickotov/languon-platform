import type { AccessTokenClaims } from "../../domain/access-token-claims";

export class InvalidAccessTokenError extends Error {
  public constructor() {
    super("The access token is invalid.");
    this.name = "InvalidAccessTokenError";
  }
}

export interface AccessTokenSigner {
  sign(claims: AccessTokenClaims): Promise<string>;
  verify(token: string): Promise<AccessTokenClaims>;
}
