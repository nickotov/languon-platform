import { z } from 'zod';

const playgroundDatabaseNamePattern =
    /^languon_mastra_playground(?:_[a-z0-9]+)*$/;
const mastraModelIdPattern =
    /^[a-z0-9][a-z0-9._-]{0,63}\/[A-Za-z0-9@~][A-Za-z0-9._:/@~-]{0,190}$/;

export type DevelopmentHarnessModelId = `${string}/${string}`;

export const developmentHarnessDeepSeekModelId =
    'deepseek/deepseek-chat' as const;

const RawPlaygroundEnvironmentSchema = z.object({
    APP_ENV: z.enum(['development', 'test']),
    DATABASE_URL: z.url().optional(),
    MASTRA_DEV_HARNESS: z.literal('true'),
    MASTRA_MODEL_ID: z
        .string()
        .max(255)
        .regex(mastraModelIdPattern)
        .refine((modelId) => !modelId.includes('..'))
        .default(developmentHarnessDeepSeekModelId),
    MASTRA_PLAYGROUND_ADMIN_DATABASE_URL: z.url(),
    MASTRA_PLAYGROUND_DATABASE_URL: z.url(),
    MASTRA_PLAYGROUND_RESET_CONFIRM: z.string().optional(),
    MASTRA_PROMPT_MODE: z.literal('local').default('local'),
    DEEPSEEK_API_KEY: z
        .preprocess(
            (value) =>
                typeof value === 'string' && value.trim() === ''
                    ? undefined
                    : value,
            z.string().trim().min(1).optional(),
        )
        .optional(),
});

export interface PlaygroundEnvironment {
    adminDatabaseUrl: string;
    appEnvironment: 'development' | 'test';
    databaseName: string;
    databaseUrl: string;
    deepSeekApiKey?: string;
    fallbackModelId: typeof developmentHarnessDeepSeekModelId;
    modelId: DevelopmentHarnessModelId;
    promptMode: 'local';
    resetConfirmation?: string;
}

export class UnsafePlaygroundTargetError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'UnsafePlaygroundTargetError';
    }
}

export function loadPlaygroundEnvironment(
    values: NodeJS.ProcessEnv = process.env,
): PlaygroundEnvironment {
    const raw = RawPlaygroundEnvironmentSchema.parse(values);
    const target = parsePostgresUrl(
        raw.MASTRA_PLAYGROUND_DATABASE_URL,
        'MASTRA_PLAYGROUND_DATABASE_URL',
    );
    const admin = parsePostgresUrl(
        raw.MASTRA_PLAYGROUND_ADMIN_DATABASE_URL,
        'MASTRA_PLAYGROUND_ADMIN_DATABASE_URL',
    );
    const databaseName = decodeURIComponent(target.pathname.slice(1));
    const adminDatabaseName = decodeURIComponent(admin.pathname.slice(1));

    if (!['127.0.0.1', 'localhost'].includes(target.hostname)) {
        throw new UnsafePlaygroundTargetError(
            'The Mastra playground database must use a loopback host.',
        );
    }

    if (!sameDatabaseAuthority(target, admin)) {
        throw new UnsafePlaygroundTargetError(
            'The Mastra playground target and admin URLs must use the same local PostgreSQL authority.',
        );
    }

    if (adminDatabaseName !== 'postgres') {
        throw new UnsafePlaygroundTargetError(
            'The Mastra playground admin URL must select the postgres database.',
        );
    }

    if (!playgroundDatabaseNamePattern.test(databaseName)) {
        throw new UnsafePlaygroundTargetError(
            'The Mastra playground database name must start with languon_mastra_playground and contain only safe lowercase suffixes.',
        );
    }

    if (raw.DATABASE_URL && isSameDatabaseTarget(raw.DATABASE_URL, target)) {
        throw new UnsafePlaygroundTargetError(
            'The Mastra playground database must be distinct from DATABASE_URL.',
        );
    }

    return {
        adminDatabaseUrl: admin.href,
        appEnvironment: raw.APP_ENV,
        databaseName,
        databaseUrl: target.href,
        ...(raw.DEEPSEEK_API_KEY
            ? { deepSeekApiKey: raw.DEEPSEEK_API_KEY }
            : {}),
        fallbackModelId: developmentHarnessDeepSeekModelId,
        modelId: raw.MASTRA_MODEL_ID as DevelopmentHarnessModelId,
        promptMode: raw.MASTRA_PROMPT_MODE,
        ...(raw.MASTRA_PLAYGROUND_RESET_CONFIRM
            ? { resetConfirmation: raw.MASTRA_PLAYGROUND_RESET_CONFIRM }
            : {}),
    };
}

function parsePostgresUrl(value: string, name: string): URL {
    const parsed = new URL(value);

    if (
        !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
        !parsed.username ||
        !parsed.pathname.startsWith('/') ||
        parsed.pathname.slice(1).includes('/') ||
        parsed.search ||
        parsed.hash
    ) {
        throw new UnsafePlaygroundTargetError(
            `${name} must be an explicit PostgreSQL database URL without query or fragment data.`,
        );
    }

    return parsed;
}

function sameDatabaseAuthority(first: URL, second: URL): boolean {
    return (
        first.protocol === second.protocol &&
        first.hostname === second.hostname &&
        first.port === second.port &&
        first.username === second.username &&
        first.password === second.password
    );
}

function isSameDatabaseTarget(value: string, target: URL): boolean {
    const candidate = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(candidate.protocol)) {
        return false;
    }

    // Database names identify the destructive reset target. Refuse an ordinary
    // application URL with the same decoded name even when a loopback address,
    // port, credential, or protocol alias makes the authorities look different.
    return (
        decodeURIComponent(candidate.pathname.slice(1)) ===
        decodeURIComponent(target.pathname.slice(1))
    );
}
