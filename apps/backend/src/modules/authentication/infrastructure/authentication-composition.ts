import {
    createDrizzleDatabase,
    createPostgresClient,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';

import type { AppAuthenticationOptions } from '../../../app';
import type { Environment } from '../../../config/environment';
import { databaseSchema } from '../../../infrastructure/database/schema';
import { AuthenticationService } from '../application/authentication-service';
import { SessionIssuer } from '../application/session-issuer';
import { Argon2idPasswordHasher } from './crypto/argon2id-password-hasher';
import { HmacVerificationCodeDigester } from './crypto/hmac-verification-code-digester';
import { JoseAccessTokenSigner } from './crypto/jose-access-token';
import { NodeEntropySource } from './crypto/node-entropy-source';
import { NodeIdGenerator } from './crypto/node-id-generator';
import { OpaqueRefreshTokenService } from './crypto/opaque-refresh-token';
import { SystemClock } from './crypto/system-clock';
import {
    FixedVerificationCodeGenerator,
    RandomVerificationCodeGenerator,
} from './crypto/verification-code-generators';
import { DevelopmentEmailSender } from './email/development-email-sender';
import { DisabledEmailSender } from './email/disabled-email-sender';
import { RedisWebAuthnChallengeStore } from './passkeys/redis-webauthn-challenge-store';
import { SimpleWebAuthnAdapter } from './passkeys/simplewebauthn-adapter';
import { DrizzleAuthStore } from './persistence/drizzle/drizzle-auth-store';
import { DrizzleSecurityEventRecorder } from './persistence/drizzle/drizzle-security-event-recorder';
import {
    createAuthenticationRedisClient,
    runBoundedRedisOperation,
    type AuthenticationRedisClient,
} from './rate-limit/bounded-redis-client';
import { RedisRateLimiter } from './rate-limit/redis-rate-limiter';
import { AuthHttpPolicy } from '../interface/http/auth-http-policy';
import { AuthenticationHttpController } from '../interface/http/authentication-http-controller';
import { PasskeyHttpController } from '../interface/http/passkey-http-controller';
import { PasswordPolicy } from '../domain/password-policy';

export interface AuthenticationComposition {
    administrationDependencies: {
        accessTokens: JoseAccessTokenSigner;
        authentication: AuthenticationService;
        clock: SystemClock;
        database: PostgresJsDatabase<typeof databaseSchema>;
        ids: NodeIdGenerator;
    };
    close(): Promise<void>;
    options: AppAuthenticationOptions;
    readiness(): Promise<{
        postgres: 'ok' | 'unavailable';
        redis: 'ok' | 'unavailable';
    }>;
}

export async function createAuthenticationComposition(
    environment: Environment,
): Promise<AuthenticationComposition> {
    const sql = createPostgresClient({
        databaseUrl: environment.DATABASE_URL,
        maxConnections: environment.DATABASE_MAX_CONNECTIONS,
    });
    const redis = createAuthenticationRedisClient({
        url: environment.REDIS_URL,
    });

    try {
        const database = createDrizzleDatabase(sql, databaseSchema);
        const clock = new SystemClock();
        const ids = new NodeIdGenerator();
        const entropy = new NodeEntropySource();
        const passwordHasher = new Argon2idPasswordHasher({
            memoryCostKiB: environment.AUTH_ARGON2_MEMORY_COST_KIB,
            parallelism: environment.AUTH_ARGON2_PARALLELISM,
            timeCost: environment.AUTH_ARGON2_TIME_COST,
        });
        const dummyPasswordHash = await passwordHasher.hash(
            'languon-dummy-password-verification-only',
        );
        const accessTokens = new JoseAccessTokenSigner({
            audience: environment.AUTH_JWT_AUDIENCE,
            clock,
            issuer: environment.AUTH_JWT_ISSUER,
            secret: environment.AUTH_JWT_SECRET,
        });
        const refreshCredentials = new OpaqueRefreshTokenService(entropy);
        const sessionIssuer = new SessionIssuer(
            clock,
            ids,
            refreshCredentials,
            accessTokens,
            {
                accessTokenAudience: environment.AUTH_JWT_AUDIENCE,
                accessTokenIssuer: environment.AUTH_JWT_ISSUER,
                accessTokenTtlMs: environment.AUTH_ACCESS_TOKEN_TTL * 1_000,
                refreshTokenTtlMs: environment.AUTH_REFRESH_TOKEN_TTL * 1_000,
            },
        );
        const passkeyVerifier = new SimpleWebAuthnAdapter({
            origins: environment.AUTH_ALLOWED_ORIGINS,
            rpId: environment.AUTH_WEBAUTHN_RP_ID,
            rpName: environment.AUTH_WEBAUTHN_RP_NAME,
        });
        const store = new DrizzleAuthStore(database);
        const authentication = new AuthenticationService({
            clock,
            codeDigester: new HmacVerificationCodeDigester(
                environment.AUTH_CODE_HMAC_SECRET,
            ),
            codeGenerator: environment.AUTH_FIXED_VERIFICATION_CODE_ENABLED
                ? new FixedVerificationCodeGenerator()
                : new RandomVerificationCodeGenerator(entropy),
            dummyPasswordHash,
            emailSender:
                environment.AUTH_EMAIL_DELIVERY_MODE === 'development'
                    ? new DevelopmentEmailSender()
                    : new DisabledEmailSender(),
            ids,
            passwordHasher,
            passwordPolicy: new PasswordPolicy(),
            passkeyVerifier,
            rateLimiter: new RedisRateLimiter({
                hmacSecret: environment.AUTH_CODE_HMAC_SECRET,
                redis,
            }),
            refreshCredentials,
            securityEvents: new DrizzleSecurityEventRecorder(database),
            sessionIssuer,
            store,
            webAuthnChallenges: new RedisWebAuthnChallengeStore({
                hmacSecret: environment.AUTH_CODE_HMAC_SECRET,
                redis,
            }),
        });
        const policy = new AuthHttpPolicy({
            allowedOrigins: environment.AUTH_ALLOWED_ORIGINS,
            appEnvironment: environment.APP_ENV,
            refreshTokenTtlSeconds: environment.AUTH_REFRESH_TOKEN_TTL,
            trustProxy: environment.AUTH_TRUST_PROXY,
            trustedProxyCidrs: environment.AUTH_TRUSTED_PROXY_CIDRS,
        });

        if (
            environment.APP_ENV === 'staging' &&
            environment.AUTH_FIXED_VERIFICATION_CODE_ENABLED
        ) {
            console.warn(
                'Insecure fixed authentication codes are enabled for this private staging environment.',
            );
        }

        return {
            administrationDependencies: {
                accessTokens,
                authentication,
                clock,
                database,
                ids,
            },
            close: () => closeAuthenticationResources(sql, redis),
            options: {
                operations: new AuthenticationHttpController(
                    authentication,
                    accessTokens,
                ),
                passkeys: new PasskeyHttpController(
                    authentication,
                    accessTokens,
                ),
                policy,
            },
            readiness: async () => {
                const [postgresResult, redisResult] = await Promise.allSettled([
                    sql`select 1`,
                    runBoundedRedisOperation(redis, () => redis.ping()),
                ]);

                return {
                    postgres:
                        postgresResult.status === 'fulfilled'
                            ? 'ok'
                            : 'unavailable',
                    redis:
                        redisResult.status === 'fulfilled'
                            ? 'ok'
                            : 'unavailable',
                };
            },
        };
    } catch (error) {
        await closeAuthenticationResources(sql, redis);
        throw error;
    }
}

async function closeAuthenticationResources(
    sql: PostgresClient,
    redis: AuthenticationRedisClient,
): Promise<void> {
    if (redis.status === 'wait' || redis.status === 'end') {
        redis.disconnect();
    } else {
        await redis.quit().catch(() => redis.disconnect());
    }
    await sql.end();
}
