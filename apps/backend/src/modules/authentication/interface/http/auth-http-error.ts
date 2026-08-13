import { randomUUID } from "node:crypto";

import type { AuthErrorCode, AuthErrorResponse } from "@languon/contracts";

export type AuthHttpErrorStatus =
  400 | 401 | 403 | 404 | 409 | 413 | 429 | 500 | 503;

export class AuthHttpError extends Error {
  public constructor(
    public readonly code: AuthErrorCode,
    message: string,
    public readonly status: AuthHttpErrorStatus,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "AuthHttpError";
  }

  public response(correlationId: string = randomUUID()): AuthErrorResponse {
    return {
      error: {
        code: this.code,
        correlationId,
        message: this.message,
        ...(this.retryAfterSeconds
          ? { retryAfterSeconds: this.retryAfterSeconds }
          : {}),
      },
    };
  }
}
