import { bodyLimit } from "hono/body-limit";

import { AuthHttpError } from "./auth-http-error";

// WebAuthn attestation objects can legitimately be much larger than ordinary
// password/authentication JSON. This remains below half a MiB while covering
// the aggregate maxima declared by the shared registration contract.
export const maximumAuthRequestBodyBytes = 384 * 1024;

export const authHttpBodyLimit = bodyLimit({
  maxSize: maximumAuthRequestBodyBytes,
  onError: (context) =>
    context.json(
      new AuthHttpError(
        "invalid_request",
        "The request body is too large.",
        413,
      ).response(safeCorrelationId(context.req.header("X-Correlation-ID"))),
      413,
    ),
});

export function safeCorrelationId(
  value: string | undefined,
): string | undefined {
  return value && value.length <= 128 ? value : undefined;
}
