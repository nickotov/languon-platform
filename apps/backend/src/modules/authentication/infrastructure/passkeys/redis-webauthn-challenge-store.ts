import { z } from "zod";

import {
  WebAuthnChallengeAlreadyExistsError,
  WebAuthnChallengeStoreUnavailableError,
  type StoredWebAuthnChallenge,
  type WebAuthnChallengeStore,
  type WebAuthnChallengeStoreOptions,
} from "../../application/ports/webauthn-challenge-store";
import {
  AUTHENTICATION_REDIS_NAMESPACE,
  deriveOpaqueRedisKey,
  isAbortError,
  runBoundedRedisOperation,
  type AuthenticationRedisClient,
} from "../rate-limit/bounded-redis-client";

export const WEBAUTHN_CHALLENGE_TTL_MS = 5 * 60 * 1_000;

const CONSUME_CHALLENGE_SCRIPT = `
local value = redis.call("GET", KEYS[1])
if not value then
  return false
end
redis.call("DEL", KEYS[1])
return value
`;

const storedChallengeSchema = z.object({
  challenge: z.string().min(1).max(4_096),
  id: z.string().min(1).max(1_024),
  purpose: z.enum(["authentication", "registration"]),
  userId: z.string().min(1).max(1_024).nullable(),
});

export interface RedisWebAuthnChallengeStoreOptions {
  hmacSecret: string;
  namespace?: string;
  redis: AuthenticationRedisClient;
  requestTimeoutMs?: number;
}

export class RedisWebAuthnChallengeStore implements WebAuthnChallengeStore {
  private readonly hmacSecret: string;
  private readonly namespace: string;
  private readonly redis: AuthenticationRedisClient;
  private readonly requestTimeoutMs: number | undefined;

  public constructor(options: RedisWebAuthnChallengeStoreOptions) {
    this.hmacSecret = options.hmacSecret;
    this.namespace = options.namespace ?? AUTHENTICATION_REDIS_NAMESPACE;
    this.redis = options.redis;
    this.requestTimeoutMs = options.requestTimeoutMs;
  }

  public async issue(
    challenge: StoredWebAuthnChallenge,
    options: WebAuthnChallengeStoreOptions = {},
  ): Promise<void> {
    const parsed = storedChallengeSchema.parse(challenge);
    const key = this.keyFor(parsed.id);

    try {
      const result = await runBoundedRedisOperation(
        this.redis,
        () =>
          this.redis.set(
            key,
            JSON.stringify(parsed),
            "PX",
            WEBAUTHN_CHALLENGE_TTL_MS,
            "NX",
          ),
        this.operationOptions(options),
      );

      if (result !== "OK") {
        throw new WebAuthnChallengeAlreadyExistsError();
      }
    } catch (error) {
      if (
        options.signal?.aborted === true ||
        isAbortError(error) ||
        error instanceof WebAuthnChallengeAlreadyExistsError
      ) {
        throw error;
      }
      throw new WebAuthnChallengeStoreUnavailableError();
    }
  }

  public async consume(
    id: string,
    options: WebAuthnChallengeStoreOptions = {},
  ): Promise<StoredWebAuthnChallenge | null> {
    const key = this.keyFor(id);

    try {
      const value = await runBoundedRedisOperation(
        this.redis,
        () => this.redis.eval(CONSUME_CHALLENGE_SCRIPT, 1, key),
        this.operationOptions(options),
      );
      if (value === null) {
        return null;
      }
      if (typeof value !== "string") {
        throw new Error("Redis returned an invalid WebAuthn challenge.");
      }

      return storedChallengeSchema.parse(JSON.parse(value));
    } catch (error) {
      if (options.signal?.aborted === true || isAbortError(error)) {
        throw error;
      }
      throw new WebAuthnChallengeStoreUnavailableError();
    }
  }

  private keyFor(id: string): string {
    return deriveOpaqueRedisKey(
      this.namespace,
      "webauthn-challenge",
      id,
      this.hmacSecret,
    );
  }

  private operationOptions(
    options: WebAuthnChallengeStoreOptions,
  ): WebAuthnChallengeStoreOptions & { requestTimeoutMs?: number } {
    return {
      ...(this.requestTimeoutMs === undefined
        ? {}
        : { requestTimeoutMs: this.requestTimeoutMs }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    };
  }
}
