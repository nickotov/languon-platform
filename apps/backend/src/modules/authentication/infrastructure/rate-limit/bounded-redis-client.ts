import { createHmac } from 'node:crypto';

import Redis from 'ioredis';

const DEFAULT_CONNECT_TIMEOUT_MS = 500;
const DEFAULT_COMMAND_TIMEOUT_MS = 500;
const DEFAULT_REQUEST_TIMEOUT_MS = 1_000;
const MAX_CONNECTION_RETRIES = 1;
const MIN_HMAC_SECRET_BYTES = 32;
const boundedAuthenticationRedisClient = Symbol(
    'bounded-authentication-redis-client',
);

export const AUTHENTICATION_REDIS_NAMESPACE = 'languon:auth:v1';

export interface AuthenticationRedisClientOptions {
    commandTimeoutMs?: number;
    connectTimeoutMs?: number;
    maxConnectionRetries?: number;
    maxRetriesPerRequest?: number;
    url: string;
}

export interface BoundedRedisOperationOptions {
    requestTimeoutMs?: number;
    signal?: AbortSignal;
}

export type AuthenticationRedisClient = Redis & {
    readonly [boundedAuthenticationRedisClient]: true;
};

class RedisOperationTimeoutError extends Error {
    public constructor() {
        super('The Redis operation exceeded its deadline.');
        this.name = 'RedisOperationTimeoutError';
    }
}

const connectionPromises = new WeakMap<Redis, Promise<void>>();

function assertBoundedInteger(
    value: number,
    label: string,
    minimum: number,
    maximum: number,
): void {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        throw new RangeError(
            `${label} must be an integer from ${minimum} to ${maximum}.`,
        );
    }
}

export function createAuthenticationRedisClient(
    options: AuthenticationRedisClientOptions,
): AuthenticationRedisClient {
    const connectTimeout =
        options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    const commandTimeout =
        options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
    const maxConnectionRetries =
        options.maxConnectionRetries ?? MAX_CONNECTION_RETRIES;
    const maxRetriesPerRequest = options.maxRetriesPerRequest ?? 1;

    assertBoundedInteger(connectTimeout, 'Redis connect timeout', 1, 30_000);
    assertBoundedInteger(commandTimeout, 'Redis command timeout', 1, 30_000);
    assertBoundedInteger(
        maxConnectionRetries,
        'Redis connection retries',
        0,
        3,
    );
    assertBoundedInteger(maxRetriesPerRequest, 'Redis request retries', 0, 3);

    const redis = new Redis(options.url, {
        autoResendUnfulfilledCommands: false,
        autoResubscribe: false,
        commandTimeout,
        connectTimeout,
        enableOfflineQueue: false,
        lazyConnect: true,
        maxRetriesPerRequest,
        reconnectOnError: () => false,
        retryStrategy: (attempt) =>
            attempt <= maxConnectionRetries
                ? Math.min(attempt * 50, 200)
                : null,
    });

    // ioredis treats an unhandled `error` event as process-fatal. Composition can
    // add observability listeners without placing credentials in this fallback.
    redis.on('error', () => undefined);

    Object.defineProperty(redis, boundedAuthenticationRedisClient, {
        configurable: false,
        enumerable: false,
        value: true,
        writable: false,
    });

    return redis as AuthenticationRedisClient;
}

async function waitUntilReady(redis: Redis): Promise<void> {
    if (redis.status === 'ready') {
        return;
    }
    if (redis.status === 'close' || redis.status === 'end') {
        throw new Error('Redis is not available.');
    }

    const inFlight = connectionPromises.get(redis);
    if (inFlight !== undefined) {
        await inFlight;
        return;
    }

    const connection =
        redis.status === 'wait'
            ? redis.connect()
            : new Promise<void>((resolve, reject) => {
                  const onReady = (): void => {
                      cleanup();
                      resolve();
                  };
                  const onEnd = (): void => {
                      cleanup();
                      reject(
                          new Error(
                              'Redis connection ended before becoming ready.',
                          ),
                      );
                  };
                  const cleanup = (): void => {
                      redis.off('ready', onReady);
                      redis.off('end', onEnd);
                  };

                  redis.once('ready', onReady);
                  redis.once('end', onEnd);
              });

    connectionPromises.set(redis, connection);
    try {
        await connection;
    } finally {
        connectionPromises.delete(redis);
    }
}

export async function runBoundedRedisOperation<T>(
    redis: AuthenticationRedisClient,
    operation: () => Promise<T>,
    options: BoundedRedisOperationOptions = {},
): Promise<T> {
    const requestTimeoutMs =
        options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    assertBoundedInteger(requestTimeoutMs, 'Redis request timeout', 1, 30_000);
    options.signal?.throwIfAborted();

    let timeout: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    let stopped = false;

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
            () => reject(new RedisOperationTimeoutError()),
            requestTimeoutMs,
        );
    });
    const abortPromise = new Promise<never>((_resolve, reject) => {
        abort = (): void =>
            reject(
                options.signal?.reason ??
                    new DOMException('Aborted', 'AbortError'),
            );
        options.signal?.addEventListener('abort', abort, { once: true });
    });

    try {
        return await Promise.race([
            waitUntilReady(redis).then(() => {
                if (stopped) {
                    throw new RedisOperationTimeoutError();
                }
                return operation();
            }),
            timeoutPromise,
            abortPromise,
        ]);
    } finally {
        stopped = true;
        if (timeout !== undefined) {
            clearTimeout(timeout);
        }
        if (abort !== undefined) {
            options.signal?.removeEventListener('abort', abort);
        }
    }
}

export function deriveOpaqueRedisKey(
    namespace: string,
    category: string,
    binding: string,
    hmacSecret: string,
): string {
    if (Buffer.byteLength(hmacSecret, 'utf8') < MIN_HMAC_SECRET_BYTES) {
        throw new RangeError(
            `Redis key HMAC secret must contain at least ${MIN_HMAC_SECRET_BYTES} bytes.`,
        );
    }
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(category)) {
        throw new RangeError('Redis key category is invalid.');
    }
    if (!/^[a-z][a-z0-9:-]{0,127}$/.test(namespace)) {
        throw new RangeError('Redis key namespace is invalid.');
    }
    if (binding.length === 0 || binding.length > 4_096) {
        throw new RangeError(
            'Redis key binding must contain 1 to 4096 characters.',
        );
    }

    const digest = createHmac('sha256', hmacSecret)
        .update(category)
        .update('\0')
        .update(binding)
        .digest('hex');

    return `${namespace}:${category}:${digest}`;
}

export function isAbortError(error: unknown): boolean {
    return (
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError')
    );
}
