import { Buffer } from 'node:buffer';
import { isIP } from 'node:net';

import { z } from 'zod';

export const insecureFixedCodeStagingAcknowledgement =
    '0000_IS_INSECURE_USE_ONLY_IN_PRIVATE_STAGING';

const minimumSecretBytes = 32;
const durationPattern = /^([1-9]\d*)([smhd])$/;
const durationUnitSeconds = {
    d: 24 * 60 * 60,
    h: 60 * 60,
    m: 60,
    s: 1,
} as const;

const SecretSchema = z.string().superRefine((secret, context) => {
    if (Buffer.byteLength(secret, 'utf8') < minimumSecretBytes) {
        context.addIssue({
            code: 'custom',
            message: `Authentication secrets must contain at least ${minimumSecretBytes} bytes.`,
        });
    }
});

const OptionalNonEmptyStringSchema = z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
);

const RawEnvironmentSchema = z
    .object({
        APP_ENV: z.enum(['development', 'test', 'staging', 'production']),
        AUTH_ACCESS_TOKEN_TTL: z.string().optional(),
        AUTH_ALLOWED_ORIGINS: z.string().optional(),
        AUTH_ALLOW_INSECURE_FIXED_CODE: z.string().optional(),
        AUTH_ARGON2_MEMORY_COST_KIB: z.coerce
            .number()
            .int()
            .min(19 * 1024)
            .max(1024 * 1024)
            .default(19 * 1024),
        AUTH_ARGON2_PARALLELISM: z.coerce
            .number()
            .int()
            .min(1)
            .max(16)
            .default(1),
        AUTH_ARGON2_TIME_COST: z.coerce
            .number()
            .int()
            .min(2)
            .max(10)
            .default(2),
        AUTH_CODE_HMAC_SECRET: SecretSchema,
        AUTH_JWT_AUDIENCE: z.string().min(1).max(200).default('languon-api'),
        AUTH_JWT_ISSUER: z.string().min(1).max(200).default('languon'),
        AUTH_JWT_SECRET: SecretSchema,
        AUTH_REFRESH_TOKEN_TTL: z.string().optional(),
        AUTH_TRUST_PROXY: z.enum(['true', 'false']).default('false'),
        AUTH_TRUSTED_PROXY_CIDRS: z.string().optional(),
        AUTH_WEBAUTHN_RP_ID: z.string().min(1).max(253).optional(),
        AUTH_WEBAUTHN_RP_NAME: z.string().min(1).max(100).default('Languon'),
        ADMIN_BASE_URL: z.url().optional(),
        BACKEND_HOST: z.enum(['127.0.0.1', '0.0.0.0']).default('127.0.0.1'),
        BACKEND_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
        DATABASE_MAX_CONNECTIONS: z.coerce
            .number()
            .int()
            .min(1)
            .max(100)
            .default(10),
        DATABASE_URL: z
            .url()
            .default('postgres://languon:languon-local@localhost:5432/languon'),
        LANGFUSE_BASE_URL: z.url().default('https://cloud.langfuse.com'),
        LANGFUSE_PUBLIC_KEY: OptionalNonEmptyStringSchema,
        LANGFUSE_SECRET_KEY: OptionalNonEmptyStringSchema,
        NODE_ENV: z
            .enum(['development', 'test', 'production'])
            .default('development'),
        REDIS_URL: z.url().default('redis://localhost:6379'),
        RELEASE_SHA: z
            .string()
            .regex(/^(development|[0-9a-f]{7,64})$/)
            .default('development'),
        SHUTDOWN_TIMEOUT_MS: z.coerce
            .number()
            .int()
            .min(1_000)
            .max(300_000)
            .default(295_000),
    })
    .superRefine((environment, context) => {
        if (environment.AUTH_JWT_SECRET === environment.AUTH_CODE_HMAC_SECRET) {
            context.addIssue({
                code: 'custom',
                message: 'JWT and verification-code secrets must be different.',
                path: ['AUTH_CODE_HMAC_SECRET'],
            });
        }

        if (
            environment.APP_ENV === 'production' &&
            (isObviousPlaceholder(environment.AUTH_JWT_SECRET) ||
                isObviousPlaceholder(environment.AUTH_CODE_HMAC_SECRET))
        ) {
            context.addIssue({
                code: 'custom',
                message:
                    'Production authentication secrets cannot be placeholders.',
                path: ['AUTH_JWT_SECRET'],
            });
        }

        const unsafeFixedCodeSetting =
            environment.AUTH_ALLOW_INSECURE_FIXED_CODE;

        if (
            environment.APP_ENV === 'production' &&
            unsafeFixedCodeSetting !== undefined
        ) {
            context.addIssue({
                code: 'custom',
                message:
                    'Fixed verification codes cannot be enabled in production.',
                path: ['AUTH_ALLOW_INSECURE_FIXED_CODE'],
            });
        }

        if (
            environment.APP_ENV === 'staging' &&
            unsafeFixedCodeSetting !== undefined &&
            unsafeFixedCodeSetting !== insecureFixedCodeStagingAcknowledgement
        ) {
            context.addIssue({
                code: 'custom',
                message:
                    'The staging fixed-code switch requires the exact acknowledgement.',
                path: ['AUTH_ALLOW_INSECURE_FIXED_CODE'],
            });
        }
    });

type RawEnvironment = z.infer<typeof RawEnvironmentSchema>;

export type AuthEmailDeliveryMode = 'development' | 'unavailable';
export type AuthVerificationCodeMode = 'fixed' | 'unavailable';

export type Environment = Omit<
    RawEnvironment,
    | 'ADMIN_BASE_URL'
    | 'AUTH_ACCESS_TOKEN_TTL'
    | 'AUTH_ALLOWED_ORIGINS'
    | 'AUTH_ALLOW_INSECURE_FIXED_CODE'
    | 'AUTH_REFRESH_TOKEN_TTL'
    | 'AUTH_TRUST_PROXY'
    | 'AUTH_TRUSTED_PROXY_CIDRS'
    | 'AUTH_WEBAUTHN_RP_ID'
> & {
    ADMIN_BASE_URL: string;
    AUTH_ACCESS_TOKEN_TTL: number;
    AUTH_ALLOWED_ORIGINS: string[];
    AUTH_EMAIL_DELIVERY_MODE: AuthEmailDeliveryMode;
    AUTH_FIXED_VERIFICATION_CODE_ENABLED: boolean;
    AUTH_REFRESH_TOKEN_TTL: number;
    AUTH_TRUST_PROXY: boolean;
    AUTH_TRUSTED_PROXY_CIDRS: string[];
    AUTH_VERIFICATION_CODE_MODE: AuthVerificationCodeMode;
    AUTH_WEBAUTHN_RP_ID: string;
};

export function loadEnvironment(
    values: NodeJS.ProcessEnv = process.env,
): Environment {
    const raw = RawEnvironmentSchema.parse(values);
    const defaultAccessTokenTtl = raw.APP_ENV === 'production' ? '15m' : '2d';
    const accessTokenTtl = parseDurationSeconds(
        raw.AUTH_ACCESS_TOKEN_TTL ?? defaultAccessTokenTtl,
        'AUTH_ACCESS_TOKEN_TTL',
    );
    const refreshTokenTtl = parseDurationSeconds(
        raw.AUTH_REFRESH_TOKEN_TTL ?? '14d',
        'AUTH_REFRESH_TOKEN_TTL',
    );
    const maximumAccessTokenTtl =
        raw.APP_ENV === 'production' ? 15 * 60 : 2 * 24 * 60 * 60;

    if (accessTokenTtl < 60 || accessTokenTtl > maximumAccessTokenTtl) {
        throw configurationError(
            'AUTH_ACCESS_TOKEN_TTL',
            `Access-token TTL must be between 1 minute and ${raw.APP_ENV === 'production' ? '15 minutes' : '2 days'}.`,
        );
    }

    if (refreshTokenTtl < 60 * 60 || refreshTokenTtl > 14 * 24 * 60 * 60) {
        throw configurationError(
            'AUTH_REFRESH_TOKEN_TTL',
            'Refresh-token TTL must be between 1 hour and 14 days.',
        );
    }

    if (refreshTokenTtl <= accessTokenTtl) {
        throw configurationError(
            'AUTH_REFRESH_TOKEN_TTL',
            'Refresh-token TTL must be longer than access-token TTL.',
        );
    }

    const deployed = raw.APP_ENV === 'staging' || raw.APP_ENV === 'production';
    const configuredAuthOrigins = parseAllowedOrigins(
        raw.AUTH_ALLOWED_ORIGINS,
        deployed,
    );
    const adminBaseUrl = parseAdminBaseUrl(raw.ADMIN_BASE_URL, deployed);
    const allowedOrigins = Array.from(
        new Set([...configuredAuthOrigins, adminBaseUrl]),
    );
    const webAuthnRpId =
        raw.AUTH_WEBAUTHN_RP_ID ?? (deployed ? undefined : 'localhost');

    if (!webAuthnRpId) {
        throw configurationError(
            'AUTH_WEBAUTHN_RP_ID',
            'Deployed environments require an explicit WebAuthn RP ID.',
        );
    }

    const trustProxy = raw.AUTH_TRUST_PROXY === 'true';
    const trustedProxyCidrs = parseTrustedProxyCidrs(
        raw.AUTH_TRUSTED_PROXY_CIDRS,
    );
    if (trustProxy && trustedProxyCidrs.length === 0) {
        throw configurationError(
            'AUTH_TRUSTED_PROXY_CIDRS',
            'Trusted proxy CIDRs are required when AUTH_TRUST_PROXY is true.',
        );
    }
    if (!trustProxy && trustedProxyCidrs.length > 0) {
        throw configurationError(
            'AUTH_TRUSTED_PROXY_CIDRS',
            'Set AUTH_TRUST_PROXY=true before configuring trusted proxy CIDRs.',
        );
    }

    if (
        !allowedOrigins.every((origin) => {
            const hostname = new URL(origin).hostname;
            return (
                hostname === webAuthnRpId ||
                hostname.endsWith(`.${webAuthnRpId}`)
            );
        })
    ) {
        throw configurationError(
            'AUTH_WEBAUTHN_RP_ID',
            'The WebAuthn RP ID must cover every allowed origin hostname.',
        );
    }

    if (deployed) {
        const database = new URL(raw.DATABASE_URL);
        const redis = new URL(raw.REDIS_URL);
        if (['localhost', '127.0.0.1'].includes(database.hostname)) {
            throw configurationError(
                'DATABASE_URL',
                'Deployed environments require an explicit non-local database.',
            );
        }
        if (['localhost', '127.0.0.1'].includes(redis.hostname)) {
            throw configurationError(
                'REDIS_URL',
                'Deployed environments require an explicit non-local Redis service.',
            );
        }
    }
    if (raw.APP_ENV === 'production') {
        const database = new URL(raw.DATABASE_URL);
        const redis = new URL(raw.REDIS_URL);
        if (database.searchParams.get('sslmode') !== 'verify-full') {
            throw configurationError(
                'DATABASE_URL',
                'Production PostgreSQL must use sslmode=verify-full.',
            );
        }
        if (
            redis.protocol !== 'rediss:' ||
            !redis.username ||
            redis.username === 'default'
        ) {
            throw configurationError(
                'REDIS_URL',
                'Production Redis must use rediss:// with a restricted named user.',
            );
        }
    }

    const fixedCodeEnabled =
        raw.APP_ENV === 'development' ||
        raw.APP_ENV === 'test' ||
        (raw.APP_ENV === 'staging' &&
            raw.AUTH_ALLOW_INSECURE_FIXED_CODE ===
                insecureFixedCodeStagingAcknowledgement);
    const {
        AUTH_ACCESS_TOKEN_TTL: _rawAccessTokenTtl,
        AUTH_ALLOWED_ORIGINS: _rawAllowedOrigins,
        AUTH_ALLOW_INSECURE_FIXED_CODE: _rawFixedCodeSetting,
        AUTH_REFRESH_TOKEN_TTL: _rawRefreshTokenTtl,
        AUTH_TRUST_PROXY: _rawTrustProxy,
        AUTH_TRUSTED_PROXY_CIDRS: _rawTrustedProxyCidrs,
        AUTH_WEBAUTHN_RP_ID: _rawWebAuthnRpId,
        ...environment
    } = raw;

    return {
        ...environment,
        ADMIN_BASE_URL: adminBaseUrl,
        AUTH_ACCESS_TOKEN_TTL: accessTokenTtl,
        AUTH_ALLOWED_ORIGINS: allowedOrigins,
        AUTH_EMAIL_DELIVERY_MODE: fixedCodeEnabled
            ? 'development'
            : 'unavailable',
        AUTH_FIXED_VERIFICATION_CODE_ENABLED: fixedCodeEnabled,
        AUTH_REFRESH_TOKEN_TTL: refreshTokenTtl,
        AUTH_TRUST_PROXY: trustProxy,
        AUTH_TRUSTED_PROXY_CIDRS: trustedProxyCidrs,
        AUTH_VERIFICATION_CODE_MODE: fixedCodeEnabled ? 'fixed' : 'unavailable',
        AUTH_WEBAUTHN_RP_ID: webAuthnRpId,
    };
}

function parseAdminBaseUrl(
    value: string | undefined,
    deployed: boolean,
): string {
    if (!value) {
        if (deployed) {
            throw configurationError(
                'ADMIN_BASE_URL',
                'Deployed environments require an exact administration HTTPS origin.',
            );
        }
        return 'http://localhost:3001';
    }
    const parsed = new URL(value);
    if (
        parsed.origin !== value ||
        (deployed && parsed.protocol !== 'https:') ||
        (!deployed && !['http:', 'https:'].includes(parsed.protocol))
    ) {
        throw configurationError(
            'ADMIN_BASE_URL',
            'Administration base URL must be an exact origin and use HTTPS outside local environments.',
        );
    }
    return parsed.origin;
}

function parseTrustedProxyCidrs(value: string | undefined): string[] {
    if (!value) return [];
    const cidrs = value.split(',').map((cidr) => cidr.trim());
    if (cidrs.length > 16 || cidrs.some((cidr) => cidr.length === 0)) {
        throw configurationError(
            'AUTH_TRUSTED_PROXY_CIDRS',
            'Configure between one and sixteen proxy CIDRs.',
        );
    }
    for (const cidr of cidrs) {
        const [address, rawPrefix, ...extra] = cidr.split('/');
        const family = address ? isIP(address) : 0;
        const maximumPrefix = family === 4 ? 32 : 128;
        if (
            !address ||
            extra.length > 0 ||
            family === 0 ||
            (rawPrefix !== undefined &&
                (!/^\d+$/.test(rawPrefix) || Number(rawPrefix) > maximumPrefix))
        ) {
            throw configurationError(
                'AUTH_TRUSTED_PROXY_CIDRS',
                'Trusted proxies must be exact IP addresses or valid IPv4/IPv6 CIDRs.',
            );
        }
    }
    return cidrs;
}

function parseAllowedOrigins(
    value: string | undefined,
    deployed: boolean,
): string[] {
    if (!value) {
        if (deployed) {
            throw configurationError(
                'AUTH_ALLOWED_ORIGINS',
                'Deployed environments require at least one exact HTTPS origin.',
            );
        }
        return ['http://localhost:3333'];
    }

    const origins = value.split(',').map((origin) => origin.trim());
    if (origins.length > 10 || origins.some((origin) => origin.length === 0)) {
        throw configurationError(
            'AUTH_ALLOWED_ORIGINS',
            'Configure between one and ten exact origins.',
        );
    }

    for (const origin of origins) {
        let parsed: URL;
        try {
            parsed = new URL(origin);
        } catch {
            throw configurationError(
                'AUTH_ALLOWED_ORIGINS',
                'Origins must be valid URLs.',
            );
        }
        if (
            parsed.origin !== origin ||
            (deployed && parsed.protocol !== 'https:') ||
            (!deployed && !['http:', 'https:'].includes(parsed.protocol))
        ) {
            throw configurationError(
                'AUTH_ALLOWED_ORIGINS',
                'Origins must be exact and use HTTPS outside local environments.',
            );
        }
    }

    if (new Set(origins).size !== origins.length) {
        throw configurationError(
            'AUTH_ALLOWED_ORIGINS',
            'Origins must be unique.',
        );
    }
    return origins;
}

function parseDurationSeconds(value: string, path: string): number {
    const match = durationPattern.exec(value);

    if (!match) {
        throw configurationError(
            path,
            'Duration must be a positive integer followed by s, m, h, or d.',
        );
    }

    const amount = Number(match[1]);
    const unit = match[2] as keyof typeof durationUnitSeconds;
    const seconds = amount * durationUnitSeconds[unit];

    if (!Number.isSafeInteger(seconds)) {
        throw configurationError(
            path,
            'Duration is outside the supported range.',
        );
    }

    return seconds;
}

function configurationError(path: string, message: string): z.ZodError {
    return new z.ZodError([
        {
            code: 'custom',
            message,
            path: [path],
        },
    ]);
}

function isObviousPlaceholder(secret: string): boolean {
    const normalized = secret.toLowerCase();
    const placeholderFragments = [
        'change-me',
        'development-only',
        'example',
        'local-only',
        'placeholder',
    ];

    return (
        placeholderFragments.some((fragment) =>
            normalized.includes(fragment),
        ) || new Set(secret).size < 8
    );
}
