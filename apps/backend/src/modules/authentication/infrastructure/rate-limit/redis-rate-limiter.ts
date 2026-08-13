import {
  RateLimitUnavailableError,
  type RateLimitDecision,
  type RateLimiter,
  type RateLimitRequest,
  type RateLimitSubjectLink,
} from "../../application/ports/rate-limiter";
import {
  AUTHENTICATION_REDIS_NAMESPACE,
  deriveOpaqueRedisKey,
  isAbortError,
  runBoundedRedisOperation,
  type AuthenticationRedisClient,
} from "./bounded-redis-client";

const MAX_RATE_LIMIT = 1_000_000;
const MAX_WINDOW_MS = 31 * 24 * 60 * 60 * 1_000;

const CONSUME_RATE_LIMIT_SCRIPT = `
local redisTime = redis.call("TIME")
local now = (tonumber(redisTime[1]) * 1000) + math.floor(tonumber(redisTime[2]) / 1000)
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local cutoff = now - window

redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", cutoff)
local count = redis.call("ZCARD", KEYS[1])
if count >= limit then
  local oldest = redis.call("ZRANGE", KEYS[1], 0, 0, "WITHSCORES")
  local retry = math.max(1, (tonumber(oldest[2]) + window) - now)
  redis.call("PEXPIRE", KEYS[1], window)
  return { count + 1, retry }
end

local member = redisTime[1] .. ":" .. redisTime[2] .. ":" .. count
redis.call("ZADD", KEYS[1], now, member)
redis.call("PEXPIRE", KEYS[1], window)
return { count + 1, window }
`;

export interface RedisRateLimiterOptions {
  hmacSecret: string;
  namespace?: string;
  redis: AuthenticationRedisClient;
  requestTimeoutMs?: number;
}

function assertRequest(request: RateLimitRequest): void {
  if (!Number.isSafeInteger(request.limit) || request.limit < 1) {
    throw new RangeError("Rate limit must be a positive integer.");
  }
  if (request.limit > MAX_RATE_LIMIT) {
    throw new RangeError(`Rate limit must not exceed ${MAX_RATE_LIMIT}.`);
  }
  if (!Number.isSafeInteger(request.windowMs) || request.windowMs < 1) {
    throw new RangeError("Rate-limit window must be a positive integer.");
  }
  if (request.windowMs > MAX_WINDOW_MS) {
    throw new RangeError(
      `Rate-limit window must not exceed ${MAX_WINDOW_MS}ms.`,
    );
  }
  if (!/^[a-z][a-z0-9._-]{0,63}$/.test(request.scope)) {
    throw new RangeError("Rate-limit scope is invalid.");
  }
}

function parseResult(value: unknown): readonly [number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !Number.isSafeInteger(value[0]) ||
    !Number.isSafeInteger(value[1]) ||
    value[0] < 1 ||
    value[1] < 0
  ) {
    throw new Error("Redis returned an invalid rate-limit result.");
  }

  return [value[0], value[1]];
}

export class RedisRateLimiter implements RateLimiter {
  private readonly hmacSecret: string;
  private readonly namespace: string;
  private readonly redis: AuthenticationRedisClient;
  private readonly requestTimeoutMs: number | undefined;

  public constructor(options: RedisRateLimiterOptions) {
    this.hmacSecret = options.hmacSecret;
    this.namespace = options.namespace ?? AUTHENTICATION_REDIS_NAMESPACE;
    this.redis = options.redis;
    this.requestTimeoutMs = options.requestTimeoutMs;
  }

  public async consume(request: RateLimitRequest): Promise<RateLimitDecision> {
    assertRequest(request);
    const directKey = deriveOpaqueRedisKey(
      this.namespace,
      "rate-limit",
      `${request.scope}\0${request.subject}`,
      this.hmacSecret,
    );

    try {
      const key = request.resolveSubjectAlias
        ? ((await runBoundedRedisOperation(
            this.redis,
            () =>
              this.redis.get(
                deriveOpaqueRedisKey(
                  this.namespace,
                  "rate-limit-alias",
                  `${request.scope}\0${request.subject}`,
                  this.hmacSecret,
                ),
              ),
            {
              ...(this.requestTimeoutMs === undefined
                ? {}
                : { requestTimeoutMs: this.requestTimeoutMs }),
              ...(request.signal === undefined
                ? {}
                : { signal: request.signal }),
            },
          )) ?? directKey)
        : directKey;
      const result = await runBoundedRedisOperation(
        this.redis,
        () =>
          this.redis.eval(
            CONSUME_RATE_LIMIT_SCRIPT,
            1,
            key,
            request.windowMs,
            request.limit,
          ),
        {
          ...(this.requestTimeoutMs === undefined
            ? {}
            : { requestTimeoutMs: this.requestTimeoutMs }),
          ...(request.signal === undefined ? {} : { signal: request.signal }),
        },
      );
      const [count, ttlMs] = parseResult(result);

      return {
        allowed: count <= request.limit,
        limit: request.limit,
        remaining: Math.max(0, request.limit - count),
        retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1_000)),
      };
    } catch (error) {
      if (request.signal?.aborted === true || isAbortError(error)) {
        throw error;
      }
      throw new RateLimitUnavailableError();
    }
  }

  public async linkSubject(input: RateLimitSubjectLink): Promise<void> {
    assertRequest({
      limit: 1,
      scope: input.scope,
      subject: input.subject,
      windowMs: input.ttlMs,
    });
    const subjectKey = deriveOpaqueRedisKey(
      this.namespace,
      "rate-limit",
      `${input.scope}\0${input.subject}`,
      this.hmacSecret,
    );
    const aliasKey = deriveOpaqueRedisKey(
      this.namespace,
      "rate-limit-alias",
      `${input.scope}\0${input.alias}`,
      this.hmacSecret,
    );
    try {
      await runBoundedRedisOperation(
        this.redis,
        () => this.redis.set(aliasKey, subjectKey, "PX", input.ttlMs),
        {
          ...(this.requestTimeoutMs === undefined
            ? {}
            : { requestTimeoutMs: this.requestTimeoutMs }),
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        },
      );
    } catch (error) {
      if (input.signal?.aborted === true || isAbortError(error)) {
        throw error;
      }
      throw new RateLimitUnavailableError();
    }
  }
}
