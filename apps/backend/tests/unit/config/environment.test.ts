import { describe, expect, it } from 'vitest';

import {
    insecureFixedCodeStagingAcknowledgement,
    loadEnvironment,
} from '../../../src/config/environment';

const jwtSecret = 'jwt-secret-with-at-least-thirty-two-bytes-123456';
const codeSecret = 'code-secret-with-at-least-thirty-two-bytes-654321';
const dictionarySecret =
    'dictionary-secret-with-at-least-thirty-two-bytes-123456';
const liveProviderBudget = {
    DICTIONARY_GENERATION_INPUT_COST_MICROS_PER_MILLION_TOKENS: '1000000',
    DICTIONARY_GENERATION_MAX_COST_MICROS_PER_ATTEMPT: '100000',
    DICTIONARY_GENERATION_MAX_INPUT_TOKENS: '65536',
    DICTIONARY_GENERATION_MAX_OUTPUT_TOKENS: '1024',
    DICTIONARY_GENERATION_OUTPUT_COST_MICROS_PER_MILLION_TOKENS: '10000000',
};

function values(
    appEnvironment: 'development' | 'production' | 'staging' | 'test',
    overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
    return {
        APP_ENV: appEnvironment,
        AUTH_CODE_HMAC_SECRET: codeSecret,
        AUTH_JWT_SECRET: jwtSecret,
        DICTIONARY_HMAC_SECRET: dictionarySecret,
        ...(appEnvironment === 'staging' || appEnvironment === 'production'
            ? {
                  ADMIN_BASE_URL: 'https://admin.app.languon.example',
                  AUTH_ALLOWED_ORIGINS: 'https://app.languon.example',
                  AUTH_WEBAUTHN_RP_ID: 'app.languon.example',
                  DATABASE_URL:
                      appEnvironment === 'production'
                          ? 'postgres://app:secret@db.internal:5432/languon?sslmode=verify-full'
                          : 'postgres://app:secret@db.internal:5432/languon',
                  REDIS_URL:
                      appEnvironment === 'production'
                          ? 'rediss://languon_app:secret@cache.internal:6379'
                          : 'redis://cache.internal:6379',
              }
            : {}),
        ...overrides,
    };
}

describe('loadEnvironment authentication settings', () => {
    it.each([
        ['development', 2 * 24 * 60 * 60, true],
        ['test', 2 * 24 * 60 * 60, true],
        ['staging', 2 * 24 * 60 * 60, false],
        ['production', 15 * 60, false],
    ] as const)(
        'uses safe %s defaults',
        (appEnvironment, accessTokenTtl, fixedCodeEnabled) => {
            const environment = loadEnvironment(values(appEnvironment));

            expect(environment).toMatchObject({
                APP_ENV: appEnvironment,
                AUTH_ACCESS_TOKEN_TTL: accessTokenTtl,
                AUTH_EMAIL_DELIVERY_MODE: fixedCodeEnabled
                    ? 'development'
                    : 'unavailable',
                AUTH_FIXED_VERIFICATION_CODE_ENABLED: fixedCodeEnabled,
                AUTH_REFRESH_TOKEN_TTL: 14 * 24 * 60 * 60,
                AUTH_REDIS_NAMESPACE: 'languon:auth:v1',
                AUTH_VERIFICATION_CODE_MODE: fixedCodeEnabled
                    ? 'fixed'
                    : 'unavailable',
                BACKEND_HOST: '127.0.0.1',
                DATABASE_MAX_CONNECTIONS: 10,
                RELEASE_SHA: 'development',
                SHUTDOWN_TIMEOUT_MS: 295_000,
            });
        },
    );

    it('requires APP_ENV instead of inferring it from NODE_ENV', () => {
        expect(() =>
            loadEnvironment({
                AUTH_CODE_HMAC_SECRET: codeSecret,
                AUTH_JWT_SECRET: jwtSecret,
                DICTIONARY_HMAC_SECRET: dictionarySecret,
                NODE_ENV: 'development',
            }),
        ).toThrow();
    });

    it('accepts bounded duration overrides and returns seconds', () => {
        const environment = loadEnvironment(
            values('production', {
                AUTH_ACCESS_TOKEN_TTL: '10m',
                AUTH_REFRESH_TOKEN_TTL: '7d',
            }),
        );

        expect(environment.AUTH_ACCESS_TOKEN_TTL).toBe(10 * 60);
        expect(environment.AUTH_REFRESH_TOKEN_TTL).toBe(7 * 24 * 60 * 60);
    });

    it('accepts a bounded Redis namespace and rejects unsafe values', () => {
        expect(
            loadEnvironment(
                values('test', {
                    AUTH_REDIS_NAMESPACE: 'languon:auth:e2e:run-123',
                }),
            ).AUTH_REDIS_NAMESPACE,
        ).toBe('languon:auth:e2e:run-123');
        expect(() =>
            loadEnvironment(
                values('test', {
                    AUTH_REDIS_NAMESPACE: 'Languon auth e2e',
                }),
            ),
        ).toThrow();
    });

    it('parses dictionary job lifecycle capabilities and fails closed by default', () => {
        expect(loadEnvironment(values('development'))).toMatchObject({
            DICTIONARY_JOB_API_ACCEPTABLE_FORMATS: [],
            DICTIONARY_JOB_API_CANCELLABLE_FORMATS: [],
            DICTIONARY_JOB_API_DISCARDABLE_FORMATS: [],
            DICTIONARY_JOB_API_ENQUEUED_FORMATS: [],
            DICTIONARY_JOB_API_READABLE_FORMATS: [],
            DICTIONARY_GENERATION_PROVIDER_BUDGET: {
                inputCostMicrosPerMillionTokens: 0,
                maxCostMicrosPerAttempt: 50_000,
                maxInputTokensPerAttempt: 262_144,
                maxOutputTokensPerAttempt: 40_960,
                outputCostMicrosPerMillionTokens: 0,
            },
        });

        expect(
            loadEnvironment(
                values('development', {
                    DICTIONARY_JOB_API_ACCEPTABLE_FORMATS: 'single-card:v1',
                    DICTIONARY_JOB_API_CANCELLABLE_FORMATS: 'single-card:v1',
                    DICTIONARY_JOB_API_DISCARDABLE_FORMATS: 'single-card:v1',
                    DICTIONARY_JOB_API_ENQUEUED_FORMATS: 'single-card:v1',
                    DICTIONARY_JOB_API_READABLE_FORMATS: 'single-card:v1',
                }),
            ),
        ).toMatchObject({
            DICTIONARY_JOB_API_ACCEPTABLE_FORMATS: ['single-card:v1'],
            DICTIONARY_JOB_API_CANCELLABLE_FORMATS: ['single-card:v1'],
            DICTIONARY_JOB_API_DISCARDABLE_FORMATS: ['single-card:v1'],
            DICTIONARY_JOB_API_ENQUEUED_FORMATS: ['single-card:v1'],
            DICTIONARY_JOB_API_READABLE_FORMATS: ['single-card:v1'],
        });

        for (const invalid of [
            'single-card:v1,single-card:v1',
            'single-card:v1, single-card:v2',
            'not-a-format',
        ]) {
            expect(() =>
                loadEnvironment(
                    values('development', {
                        DICTIONARY_JOB_API_ENQUEUED_FORMATS: invalid,
                    }),
                ),
            ).toThrow(/DICTIONARY_JOB_API_ENQUEUED_FORMATS|formats/i);
        }

        expect(() =>
            loadEnvironment(
                values('development', {
                    DICTIONARY_JOB_API_ENQUEUED_FORMATS: 'single-card:v1',
                }),
            ),
        ).toThrow(/must also be acceptable/i);
    });

    it('requires one validated provider budget for deployed generation activation', () => {
        const capabilities = {
            DICTIONARY_JOB_API_ACCEPTABLE_FORMATS: 'single-card:v1',
            DICTIONARY_JOB_API_CANCELLABLE_FORMATS: 'single-card:v1',
            DICTIONARY_JOB_API_DISCARDABLE_FORMATS: 'single-card:v1',
            DICTIONARY_JOB_API_ENQUEUED_FORMATS: 'single-card:v1',
            DICTIONARY_JOB_API_READABLE_FORMATS: 'single-card:v1',
        };
        expect(() => loadEnvironment(values('staging', capabilities))).toThrow(
            /all five/i,
        );
        expect(
            loadEnvironment(
                values('staging', {
                    ...capabilities,
                    ...liveProviderBudget,
                }),
            ).DICTIONARY_GENERATION_PROVIDER_BUDGET,
        ).toEqual({
            inputCostMicrosPerMillionTokens: 1_000_000,
            maxCostMicrosPerAttempt: 100_000,
            maxInputTokensPerAttempt: 65_536,
            maxOutputTokensPerAttempt: 1_024,
            outputCostMicrosPerMillionTokens: 10_000_000,
        });
        expect(() =>
            loadEnvironment(
                values('development', {
                    DICTIONARY_GENERATION_MAX_INPUT_TOKENS: '65536',
                }),
            ),
        ).toThrow(/all five/i);
    });

    it('rejects pasted-term API activation below the worker aggregate envelope', () => {
        const capabilities = {
            DICTIONARY_JOB_API_ACCEPTABLE_FORMATS: 'pasted-terms:v1',
            DICTIONARY_JOB_API_CANCELLABLE_FORMATS: 'pasted-terms:v1',
            DICTIONARY_JOB_API_DISCARDABLE_FORMATS: 'pasted-terms:v1',
            DICTIONARY_JOB_API_ENQUEUED_FORMATS: 'pasted-terms:v1',
            DICTIONARY_JOB_API_READABLE_FORMATS: 'pasted-terms:v1',
        };

        expect(() =>
            loadEnvironment(
                values('staging', {
                    ...capabilities,
                    ...liveProviderBudget,
                }),
            ),
        ).toThrow(/262144 input-token and 40960 output-token/i);
        expect(
            loadEnvironment(
                values('staging', {
                    ...capabilities,
                    ...liveProviderBudget,
                    DICTIONARY_GENERATION_MAX_COST_MICROS_PER_ATTEMPT: '700000',
                    DICTIONARY_GENERATION_MAX_INPUT_TOKENS: '262144',
                    DICTIONARY_GENERATION_MAX_OUTPUT_TOKENS: '40960',
                }),
            ).DICTIONARY_JOB_API_ENQUEUED_FORMATS,
        ).toEqual(['pasted-terms:v1']);
    });

    it('normalizes blank optional Langfuse credentials and preserves configured values', () => {
        const blankEnvironment = loadEnvironment(
            values('development', {
                LANGFUSE_PUBLIC_KEY: '',
                LANGFUSE_SECRET_KEY: '',
            }),
        );
        const configuredEnvironment = loadEnvironment(
            values('development', {
                LANGFUSE_PUBLIC_KEY: 'local-public-key',
                LANGFUSE_SECRET_KEY: 'local-secret-key',
            }),
        );

        expect(blankEnvironment.LANGFUSE_PUBLIC_KEY).toBeUndefined();
        expect(blankEnvironment.LANGFUSE_SECRET_KEY).toBeUndefined();
        expect(configuredEnvironment.LANGFUSE_PUBLIC_KEY).toBe(
            'local-public-key',
        );
        expect(configuredEnvironment.LANGFUSE_SECRET_KEY).toBe(
            'local-secret-key',
        );
    });

    it('requires an explicit supported backend bind host', () => {
        expect(
            loadEnvironment(values('development', { BACKEND_HOST: '0.0.0.0' }))
                .BACKEND_HOST,
        ).toBe('0.0.0.0');
        expect(() =>
            loadEnvironment(
                values('development', { BACKEND_HOST: '192.0.2.10' }),
            ),
        ).toThrow();
    });

    it('accepts bounded deployment lifecycle configuration', () => {
        const environment = loadEnvironment(
            values('production', {
                DATABASE_MAX_CONNECTIONS: '6',
                RELEASE_SHA: 'abcdef1234567890',
                SHUTDOWN_TIMEOUT_MS: '290000',
            }),
        );

        expect(environment).toMatchObject({
            DATABASE_MAX_CONNECTIONS: 6,
            RELEASE_SHA: 'abcdef1234567890',
            SHUTDOWN_TIMEOUT_MS: 290_000,
        });
    });

    it('requires authenticated TLS for production data services', () => {
        expect(() =>
            loadEnvironment(
                values('production', {
                    DATABASE_URL: 'postgres://app:secret@db.internal/languon',
                }),
            ),
        ).toThrow(/sslmode=verify-full/);
        expect(() =>
            loadEnvironment(
                values('production', {
                    REDIS_URL: 'redis://languon_app:secret@cache.internal:6379',
                }),
            ),
        ).toThrow(/rediss/);
    });

    it('rejects invalid pool, release, and shutdown limits', () => {
        expect(() =>
            loadEnvironment(
                values('production', { DATABASE_MAX_CONNECTIONS: '0' }),
            ),
        ).toThrow();
        expect(() =>
            loadEnvironment(values('production', { RELEASE_SHA: 'latest' })),
        ).toThrow();
        expect(() =>
            loadEnvironment(
                values('production', { SHUTDOWN_TIMEOUT_MS: '300001' }),
            ),
        ).toThrow();
    });

    it.each([
        ['AUTH_ACCESS_TOKEN_TTL', '900'],
        ['AUTH_ACCESS_TOKEN_TTL', '16m'],
        ['AUTH_REFRESH_TOKEN_TTL', '15d'],
        ['AUTH_REFRESH_TOKEN_TTL', '0d'],
    ])('rejects unsafe or malformed %s=%s', (name, value) => {
        expect(() =>
            loadEnvironment(values('production', { [name]: value })),
        ).toThrow();
    });

    it('rejects a refresh lifetime that is not longer than access', () => {
        expect(() =>
            loadEnvironment(
                values('development', {
                    AUTH_ACCESS_TOKEN_TTL: '2h',
                    AUTH_REFRESH_TOKEN_TTL: '1h',
                }),
            ),
        ).toThrow();
    });

    it('requires separate auth and dictionary secrets containing at least 32 UTF-8 bytes', () => {
        expect(() =>
            loadEnvironment(
                values('development', {
                    AUTH_CODE_HMAC_SECRET: jwtSecret,
                }),
            ),
        ).toThrow();
        expect(() =>
            loadEnvironment(
                values('development', {
                    AUTH_CODE_HMAC_SECRET: 'short',
                }),
            ),
        ).toThrow();
        expect(() =>
            loadEnvironment(
                values('development', {
                    DICTIONARY_HMAC_SECRET: codeSecret,
                }),
            ),
        ).toThrow(/dictionary.*secret.*different/i);
        expect(() =>
            loadEnvironment(
                values('development', {
                    DICTIONARY_HMAC_SECRET: jwtSecret,
                }),
            ),
        ).toThrow(/dictionary.*secret.*different/i);
        expect(() =>
            loadEnvironment(
                values('development', {
                    DICTIONARY_HMAC_SECRET: 'short',
                }),
            ),
        ).toThrow();
        const withoutDictionarySecret = values('development');
        delete withoutDictionarySecret.DICTIONARY_HMAC_SECRET;
        expect(() => loadEnvironment(withoutDictionarySecret)).toThrow();
    });

    it('keeps the dictionary key independent when the verification-code key rotates', () => {
        const before = loadEnvironment(values('development'));
        const after = loadEnvironment(
            values('development', {
                AUTH_CODE_HMAC_SECRET:
                    'rotated-code-secret-with-at-least-thirty-two-bytes',
            }),
        );

        expect(after.AUTH_CODE_HMAC_SECRET).not.toBe(
            before.AUTH_CODE_HMAC_SECRET,
        );
        expect(after.DICTIONARY_HMAC_SECRET).toBe(
            before.DICTIONARY_HMAC_SECRET,
        );
    });

    it('does not include a rejected dictionary secret in validation output', () => {
        const rejectedSecret =
            'development-only-dictionary-secret-sensitive-value';
        let validationError: unknown;
        try {
            loadEnvironment(
                values('production', {
                    DICTIONARY_HMAC_SECRET: rejectedSecret,
                }),
            );
        } catch (error) {
            validationError = error;
        }

        expect(validationError).toBeDefined();
        expect(String(validationError)).not.toContain(rejectedSecret);
    });

    it('enables staging fixed code only with the exact unsafe acknowledgement', () => {
        expect(() =>
            loadEnvironment(
                values('staging', { AUTH_ALLOW_INSECURE_FIXED_CODE: 'true' }),
            ),
        ).toThrow();

        const environment = loadEnvironment(
            values('staging', {
                AUTH_ALLOW_INSECURE_FIXED_CODE:
                    insecureFixedCodeStagingAcknowledgement,
            }),
        );

        expect(environment.AUTH_FIXED_VERIFICATION_CODE_ENABLED).toBe(true);
        expect(environment.AUTH_EMAIL_DELIVERY_MODE).toBe('development');
    });

    it('rejects every fixed-code setting and obvious local secrets in production', () => {
        expect(() =>
            loadEnvironment(
                values('production', {
                    AUTH_ALLOW_INSECURE_FIXED_CODE:
                        insecureFixedCodeStagingAcknowledgement,
                }),
            ),
        ).toThrow();
        expect(() =>
            loadEnvironment(
                values('production', {
                    AUTH_JWT_SECRET:
                        'development-only-jwt-secret-change-me-123456789',
                }),
            ),
        ).toThrow();
        expect(() =>
            loadEnvironment(
                values('production', {
                    DICTIONARY_HMAC_SECRET:
                        'development-only-dictionary-secret-change-me',
                }),
            ),
        ).toThrow();
    });

    it('rejects Argon2 parameters below the approved security floor', () => {
        expect(() =>
            loadEnvironment(
                values('development', { AUTH_ARGON2_MEMORY_COST_KIB: '19455' }),
            ),
        ).toThrow();
        expect(() =>
            loadEnvironment(
                values('development', { AUTH_ARGON2_TIME_COST: '1' }),
            ),
        ).toThrow();
    });

    it('provides localhost WebAuthn and origin defaults only outside deployed environments', () => {
        expect(loadEnvironment(values('development'))).toMatchObject({
            ADMIN_BASE_URL: 'http://localhost:3001',
            AUTH_ALLOWED_ORIGINS: [
                'http://localhost:3333',
                'http://localhost:3001',
            ],
            AUTH_TRUST_PROXY: false,
            AUTH_TRUSTED_PROXY_CIDRS: [],
            AUTH_WEBAUTHN_RP_ID: 'localhost',
            AUTH_WEBAUTHN_RP_NAME: 'Languon',
        });

        expect(() =>
            loadEnvironment({
                APP_ENV: 'staging',
                AUTH_CODE_HMAC_SECRET: codeSecret,
                AUTH_JWT_SECRET: jwtSecret,
            }),
        ).toThrow();
    });

    it('requires validated trusted proxy CIDRs when forwarding is enabled', () => {
        expect(() =>
            loadEnvironment(
                values('development', { AUTH_TRUST_PROXY: 'true' }),
            ),
        ).toThrow();
        expect(() =>
            loadEnvironment(
                values('development', {
                    AUTH_TRUST_PROXY: 'true',
                    AUTH_TRUSTED_PROXY_CIDRS: 'not-an-address',
                }),
            ),
        ).toThrow();

        expect(
            loadEnvironment(
                values('development', {
                    AUTH_TRUST_PROXY: 'true',
                    AUTH_TRUSTED_PROXY_CIDRS: '10.0.0.0/24,2001:db8:1234::/64',
                }),
            ),
        ).toMatchObject({
            AUTH_TRUST_PROXY: true,
            AUTH_TRUSTED_PROXY_CIDRS: ['10.0.0.0/24', '2001:db8:1234::/64'],
        });
    });

    it('requires dedicated private storage before document upload activation', () => {
        const capabilities = {
            DICTIONARY_JOB_API_ACCEPTABLE_FORMATS: 'document-terms:v1',
            DICTIONARY_JOB_API_CANCELLABLE_FORMATS: 'document-terms:v1',
            DICTIONARY_JOB_API_DISCARDABLE_FORMATS: 'document-terms:v1',
            DICTIONARY_JOB_API_ENQUEUED_FORMATS: 'document-terms:v1',
            DICTIONARY_JOB_API_READABLE_FORMATS: 'document-terms:v1',
            DICTIONARY_GENERATION_INPUT_COST_MICROS_PER_MILLION_TOKENS:
                '1000000',
            DICTIONARY_GENERATION_MAX_COST_MICROS_PER_ATTEMPT: '700000',
            DICTIONARY_GENERATION_MAX_INPUT_TOKENS: '262144',
            DICTIONARY_GENERATION_MAX_OUTPUT_TOKENS: '40960',
            DICTIONARY_GENERATION_OUTPUT_COST_MICROS_PER_MILLION_TOKENS:
                '10000000',
        };
        expect(() => loadEnvironment(values('test', capabilities))).toThrow(
            /Document storage is required/,
        );
        const stopEnqueueCapabilities = {
            ...capabilities,
            DICTIONARY_JOB_API_ENQUEUED_FORMATS: '',
        };
        expect(() =>
            loadEnvironment(values('test', stopEnqueueCapabilities)),
        ).toThrow(/Document storage is required/);
        const storage = {
            DICTIONARY_DOCUMENT_STORAGE_API_ACCESS_KEY_ID: 'api-key',
            DICTIONARY_DOCUMENT_STORAGE_API_SECRET_ACCESS_KEY:
                'api-secret-at-least-sixteen',
            DICTIONARY_DOCUMENT_STORAGE_BUCKET: 'documents-test',
            DICTIONARY_DOCUMENT_STORAGE_ENDPOINT: 'http://127.0.0.1:59000',
            DICTIONARY_DOCUMENT_STORAGE_FORCE_PATH_STYLE: 'true',
            DICTIONARY_DOCUMENT_STORAGE_MODE: 's3',
            DICTIONARY_DOCUMENT_STORAGE_REGION: 'us-east-1',
        };
        expect(
            loadEnvironment(values('test', { ...capabilities, ...storage })),
        ).toMatchObject({
            DICTIONARY_DOCUMENT_LIFECYCLE_ENABLED: true,
            DICTIONARY_DOCUMENT_UPLOAD_AUTHORIZATION_ENABLED: true,
            DICTIONARY_DOCUMENT_STORAGE: {
                accessKeyId: 'api-key',
                bucket: 'documents-test',
                forcePathStyle: true,
            },
        });
        expect(
            loadEnvironment(
                values('test', { ...stopEnqueueCapabilities, ...storage }),
            ),
        ).toMatchObject({
            DICTIONARY_DOCUMENT_LIFECYCLE_ENABLED: true,
            DICTIONARY_DOCUMENT_UPLOAD_AUTHORIZATION_ENABLED: false,
        });
    });

    it('requires exact HTTPS origins, matching RP ID, and explicit data services in staging and production', () => {
        const deployed = loadEnvironment(
            values('production', {
                AUTH_ALLOWED_ORIGINS: 'https://app.languon.example',
                AUTH_CODE_HMAC_SECRET:
                    'prod-code-secret-7wQdZK6F8pN2XvRt4mHs9LcB',
                AUTH_JWT_SECRET: 'prod-jwt-secret-3JpQ8vWz7cNk2sMx5tRy6HdF',
                DICTIONARY_HMAC_SECRET:
                    'prod-dictionary-secret-5VnQ7zWp4cKs8mRx2tHy9LdF',
                AUTH_WEBAUTHN_RP_ID: 'app.languon.example',
                DATABASE_URL:
                    'postgres://app:secret@db.internal:5432/languon?sslmode=verify-full',
                REDIS_URL: 'rediss://languon_app:secret@cache.internal:6379',
            }),
        );

        expect(deployed.AUTH_ALLOWED_ORIGINS).toEqual([
            'https://app.languon.example',
            'https://admin.app.languon.example',
        ]);
        expect(deployed.ADMIN_BASE_URL).toBe(
            'https://admin.app.languon.example',
        );
        expect(() =>
            loadEnvironment(
                values('production', {
                    AUTH_ALLOWED_ORIGINS: 'http://app.languon.example',
                    AUTH_CODE_HMAC_SECRET:
                        'prod-code-secret-7wQdZK6F8pN2XvRt4mHs9LcB',
                    AUTH_JWT_SECRET: 'prod-jwt-secret-3JpQ8vWz7cNk2sMx5tRy6HdF',
                    AUTH_WEBAUTHN_RP_ID: 'different.example',
                }),
            ),
        ).toThrow();
        expect(() =>
            loadEnvironment(
                values('production', {
                    ADMIN_BASE_URL: 'https://admin.app.languon.example/path',
                }),
            ),
        ).toThrow(/ADMIN_BASE_URL|base URL/i);
    });
});
