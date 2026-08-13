import { randomUUID } from "node:crypto";

import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

import type { AuthHttpPolicy } from "./auth-http-policy";
import type { AuthHttpRequestMetadata } from "./authentication-http-operations";

export function authenticationRequestMetadata(
  context: Context,
  policy: AuthHttpPolicy,
): AuthHttpRequestMetadata {
  let directAddress = "127.0.0.1";
  try {
    directAddress = getConnInfo(context).remote.address ?? directAddress;
  } catch {
    // In-process contract tests do not expose Node's incoming socket binding.
  }

  const suppliedCorrelationId = context.req.header("X-Correlation-ID");
  return {
    clientAddress: policy.clientAddress(
      directAddress,
      context.req.header("X-Forwarded-For") ?? null,
    ),
    correlationId:
      suppliedCorrelationId && suppliedCorrelationId.length <= 128
        ? suppliedCorrelationId
        : randomUUID(),
    signal: context.req.raw.signal,
  };
}
