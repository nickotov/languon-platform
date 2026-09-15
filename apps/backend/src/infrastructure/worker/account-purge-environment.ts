import { z } from 'zod';

const optionalValue = z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional());
const EnvironmentSchema = z.object({
    APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    ACCOUNT_PURGE_DATABASE_URL: optionalValue,
    ACCOUNT_PURGE_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(5_000),
    ACCOUNT_PURGE_STORAGE_ACCESS_KEY_ID: optionalValue,
    ACCOUNT_PURGE_STORAGE_SECRET_ACCESS_KEY: optionalValue,
    DATABASE_URL: optionalValue,
    DATABASE_MAX_CONNECTIONS: z.coerce.number().int().min(1).max(20).default(2),
    DICTIONARY_DOCUMENT_STORAGE_BUCKET: optionalValue,
    DICTIONARY_DOCUMENT_STORAGE_ENDPOINT: optionalValue,
    DICTIONARY_DOCUMENT_STORAGE_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('false'),
    DICTIONARY_DOCUMENT_STORAGE_MODE: z.enum(['unavailable', 's3']).default('unavailable'),
    DICTIONARY_DOCUMENT_STORAGE_REGION: optionalValue,
    RELEASE_SHA: z.string().regex(/^(development|[0-9a-f]{7,64})$/).default('development'),
});

export function loadAccountPurgeEnvironment(values: NodeJS.ProcessEnv) {
    const raw = EnvironmentSchema.parse(values);
    const deployed = raw.APP_ENV === 'production' || raw.APP_ENV === 'staging';
    const databaseUrl = raw.ACCOUNT_PURGE_DATABASE_URL ?? (!deployed ? raw.DATABASE_URL : undefined);
    if (!databaseUrl) throw new Error('Account purge database URL is required.');
    const parsedDatabaseUrl = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol)) {
        throw new Error('Account purge database URL must be PostgreSQL.');
    }
    if (deployed && parsedDatabaseUrl.searchParams.get('sslmode') !== 'verify-full' && raw.APP_ENV === 'production') {
        throw new Error('Account purge database must verify TLS in production.');
    }
    let storage: {
        accessKeyId: string;
        bucket: string;
        endpoint: string;
        forcePathStyle: boolean;
        region: string;
        secretAccessKey: string;
    } | undefined;
    if (raw.DICTIONARY_DOCUMENT_STORAGE_MODE === 's3') {
        if (!raw.ACCOUNT_PURGE_STORAGE_ACCESS_KEY_ID || !raw.ACCOUNT_PURGE_STORAGE_SECRET_ACCESS_KEY ||
            !raw.DICTIONARY_DOCUMENT_STORAGE_BUCKET || !raw.DICTIONARY_DOCUMENT_STORAGE_ENDPOINT ||
            !raw.DICTIONARY_DOCUMENT_STORAGE_REGION) {
            throw new Error('Dedicated account purge document storage configuration is incomplete.');
        }
        const endpoint = new URL(raw.DICTIONARY_DOCUMENT_STORAGE_ENDPOINT);
        if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/' ||
            (deployed && endpoint.protocol !== 'https:') ||
            (!deployed && !['http:', 'https:'].includes(endpoint.protocol))) {
            throw new Error('Account purge storage endpoint must be a credential-free origin and HTTPS when deployed.');
        }
        storage = {
            accessKeyId: raw.ACCOUNT_PURGE_STORAGE_ACCESS_KEY_ID,
            bucket: raw.DICTIONARY_DOCUMENT_STORAGE_BUCKET,
            endpoint: endpoint.origin,
            forcePathStyle: raw.DICTIONARY_DOCUMENT_STORAGE_FORCE_PATH_STYLE === 'true',
            region: raw.DICTIONARY_DOCUMENT_STORAGE_REGION,
            secretAccessKey: raw.ACCOUNT_PURGE_STORAGE_SECRET_ACCESS_KEY,
        };
    }
    return {
        databaseMaxConnections: raw.DATABASE_MAX_CONNECTIONS,
        databaseUrl,
        pollIntervalMs: raw.ACCOUNT_PURGE_POLL_INTERVAL_MS,
        releaseSha: raw.RELEASE_SHA,
        storage,
    };
}
