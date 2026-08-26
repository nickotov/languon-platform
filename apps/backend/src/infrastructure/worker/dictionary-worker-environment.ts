import { isIP } from 'node:net';

import { z } from 'zod';

import type { DictionaryGenerationProviderBudgetPolicy } from '../../modules/dictionaries/application/ports/dictionary-generation-provider-policy';
import {
    assertDictionaryGenerationProviderBudgetSupportsFormats,
    loadDictionaryGenerationProviderBudgetPolicy,
} from '../../modules/dictionaries/infrastructure/dictionary-generation-provider-policy';
import {
    loadDictionaryDocumentS3Environment,
    type DictionaryDocumentS3Environment,
} from '../../modules/dictionaries/infrastructure/document/dictionary-document-environment';

const jobFormatPattern = /^[a-z][a-z0-9-]{0,63}:v(?:0|[1-9]\d*)$/;
const optionalValue = z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
);

function isPrivateAddress(hostname: string): boolean {
    const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    if (isIP(host) === 6) {
        if (host.startsWith('::ffff:')) {
            return isPrivateAddress(host.slice('::ffff:'.length));
        }
        return (
            host === '::' ||
            host === '::1' ||
            host.startsWith('fc') ||
            host.startsWith('fd') ||
            /^fe[89ab]/.test(host)
        );
    }
    if (isIP(host) !== 4) return false;
    const parts = host.split('.');
    const first = Number(parts[0]);
    const second = Number(parts[1]);
    return (
        first === 0 ||
        first === 10 ||
        first === 127 ||
        (first === 100 && second >= 64 && second <= 127) ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        (first === 198 && [18, 19].includes(second)) ||
        first >= 224
    );
}

function parseFormats(value: string, name: string): string[] {
    const formats = value.split(',').filter(Boolean);
    if (
        formats.some((format) => !jobFormatPattern.test(format)) ||
        new Set(formats).size !== formats.length
    ) {
        throw new Error(
            `${name} must contain unique comma-separated composite formats.`,
        );
    }
    return formats.sort();
}

const WorkerEnvironmentSchema = z.object({
    APP_ENV: z.enum(['development', 'test', 'staging', 'production']),
    DATABASE_MAX_CONNECTIONS: z.coerce.number().int().min(1).max(50).default(4),
    DICTIONARY_WORKER_DATABASE_URL: z.url(),
    DICTIONARY_JOB_API_ENQUEUED_FORMATS: z.string().default(''),
    DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS: z.string().default(''),
    DICTIONARY_WORKER_CONCURRENCY: z.coerce
        .number()
        .int()
        .min(1)
        .max(32)
        .default(2),
    DICTIONARY_WORKER_DRAIN_TIMEOUT_MS: z.coerce
        .number()
        .int()
        .min(1_000)
        .max(295_000)
        .default(295_000),
    DICTIONARY_WORKER_POLL_INTERVAL_MS: z.coerce
        .number()
        .int()
        .min(50)
        .max(60_000)
        .default(1_000),
    DICTIONARY_GENERATION_MODEL_API_KEY: optionalValue,
    DICTIONARY_GENERATION_MODEL_BASE_URL: optionalValue,
    DICTIONARY_GENERATION_MODEL_ID: optionalValue,
    DICTIONARY_GENERATION_PROVIDER_MODE: z
        .enum(['unavailable', 'deterministic', 'mastra'])
        .default('unavailable'),
    DICTIONARY_WORKER_READINESS_TIMEOUT_MS: z.coerce
        .number()
        .int()
        .min(100)
        .max(30_000)
        .default(5_000),
    DICTIONARY_DOCUMENT_FINGERPRINT_HMAC_SECRET: optionalValue,
    DICTIONARY_DOCUMENT_RUNTIME_MODE: z
        .enum(['deterministic', 'production', 'unavailable'])
        .default('unavailable'),
    DICTIONARY_DOCUMENT_SCANNER_HOST: optionalValue,
    DICTIONARY_DOCUMENT_SCANNER_PORT: z.coerce
        .number()
        .int()
        .min(1)
        .max(65_535)
        .optional(),
    DICTIONARY_DOCUMENT_SANDBOX_APPLICATION_ROOT: optionalValue,
    DICTIONARY_DOCUMENT_SANDBOX_BWRAP_PATH: optionalValue,
    DICTIONARY_DOCUMENT_SANDBOX_PARSER_ENTRY_PATH: optionalValue,
    RELEASE_SHA: z
        .string()
        .regex(/^(development|[0-9a-f]{7,64})$/)
        .default('development'),
});

export interface DictionaryWorkerEnvironment {
    appEnvironment: 'development' | 'test' | 'staging' | 'production';
    concurrency: number;
    databaseMaxConnections: number;
    databaseUrl: string;
    drainTimeoutMs: number;
    includeProviderReadiness: boolean;
    pollIntervalMs: number;
    providerBudget: DictionaryGenerationProviderBudgetPolicy;
    document:
        | { mode: 'unavailable' }
        | {
              fingerprintSecret: string;
              mode: 'deterministic';
              storage: DictionaryDocumentS3Environment;
          }
        | {
              fingerprintSecret: string;
              mode: 'production';
              sandbox: {
                  applicationRoot: string;
                  bubblewrapPath: string;
                  parserEntryPath: string;
              };
              scanner: { host: string; port: number };
              storage: DictionaryDocumentS3Environment;
          };
    provider:
        | { mode: 'unavailable' }
        | { mode: 'deterministic' }
        | {
              apiKey: string;
              baseUrl: string;
              mode: 'mastra';
              modelId: `${string}/${string}`;
          };
    readinessTimeoutMs: number;
    releaseSha: string;
    supportedFormats: readonly string[];
}

export function loadDictionaryWorkerEnvironment(
    values: NodeJS.ProcessEnv = process.env,
): DictionaryWorkerEnvironment {
    const environment = WorkerEnvironmentSchema.parse(values);
    const database = new URL(environment.DICTIONARY_WORKER_DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(database.protocol)) {
        throw new Error('DICTIONARY_WORKER_DATABASE_URL must use PostgreSQL.');
    }
    if (
        ['staging', 'production'].includes(environment.APP_ENV) &&
        ['localhost', '127.0.0.1'].includes(database.hostname)
    ) {
        throw new Error(
            'Deployed dictionary workers require an explicit non-local PostgreSQL service.',
        );
    }
    if (
        environment.APP_ENV === 'production' &&
        database.searchParams.get('sslmode') !== 'verify-full'
    ) {
        throw new Error(
            'Production dictionary workers require PostgreSQL sslmode=verify-full.',
        );
    }
    const supportedFormats = parseFormats(
        environment.DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS,
        'DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS',
    );
    const enqueuedFormats = parseFormats(
        environment.DICTIONARY_JOB_API_ENQUEUED_FORMATS,
        'DICTIONARY_JOB_API_ENQUEUED_FORMATS',
    );
    const unsupportedEnqueuedFormats = enqueuedFormats.filter(
        (format) => !supportedFormats.includes(format),
    );
    if (unsupportedEnqueuedFormats.length) {
        throw new Error(
            'DICTIONARY_JOB_API_ENQUEUED_FORMATS must be supported by this worker.',
        );
    }
    const providerMode = environment.DICTIONARY_GENERATION_PROVIDER_MODE;
    const deployed = ['staging', 'production'].includes(environment.APP_ENV);
    if (supportedFormats.length > 0 && providerMode === 'unavailable')
        throw new Error(
            deployed
                ? 'Worker-processable dictionary formats require Mastra provider mode until all queued work drains.'
                : 'Worker-processable dictionary formats require an available provider until all queued work drains.',
        );
    if (deployed && supportedFormats.length > 0 && providerMode !== 'mastra')
        throw new Error(
            'Worker-processable dictionary formats require Mastra provider mode until all queued work drains.',
        );
    if (deployed && providerMode === 'deterministic') {
        throw new Error('Deterministic dictionary generation is local-only.');
    }
    const modelValues = [
        environment.DICTIONARY_GENERATION_MODEL_API_KEY,
        environment.DICTIONARY_GENERATION_MODEL_BASE_URL,
        environment.DICTIONARY_GENERATION_MODEL_ID,
    ];
    if (providerMode !== 'mastra' && modelValues.some(Boolean)) {
        throw new Error(
            'Dictionary generation model settings require provider mode mastra.',
        );
    }
    let provider: DictionaryWorkerEnvironment['provider'];
    if (providerMode === 'mastra') {
        const [apiKey, baseUrlValue, modelId] = modelValues;
        if (!apiKey || !baseUrlValue || !modelId) {
            throw new Error(
                'Mastra dictionary generation requires model ID, base URL, and API key.',
            );
        }
        if (!/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._/-]*$/i.test(modelId)) {
            throw new Error(
                'DICTIONARY_GENERATION_MODEL_ID must use provider/model format.',
            );
        }
        let baseUrl: URL;
        try {
            baseUrl = new URL(baseUrlValue);
        } catch {
            throw new Error(
                'DICTIONARY_GENERATION_MODEL_BASE_URL must be a valid provider base URL.',
            );
        }
        if (
            baseUrl.username !== '' ||
            baseUrl.password !== '' ||
            baseUrl.search !== '' ||
            baseUrl.hash !== '' ||
            baseUrl.pathname.length > 200 ||
            !/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/.test(baseUrl.pathname) ||
            (deployed && baseUrl.protocol !== 'https:') ||
            (deployed && isPrivateAddress(baseUrl.hostname)) ||
            (!deployed && !['http:', 'https:'].includes(baseUrl.protocol))
        ) {
            throw new Error(
                'DICTIONARY_GENERATION_MODEL_BASE_URL must be a bounded credential-free HTTPS provider URL outside private addresses when deployed.',
            );
        }
        provider = {
            apiKey,
            baseUrl: baseUrlValue,
            mode: 'mastra',
            modelId: modelId as `${string}/${string}`,
        };
    } else {
        provider = { mode: providerMode };
    }
    const providerBudget = loadDictionaryGenerationProviderBudgetPolicy(
        values,
        { requireExplicit: providerMode === 'mastra' },
    );
    assertDictionaryGenerationProviderBudgetSupportsFormats(
        providerBudget,
        supportedFormats,
    );
    const documentEnabled = supportedFormats.includes('document-terms:v1');
    const documentStorage = loadDictionaryDocumentS3Environment(values, {
        deployed: ['staging', 'production'].includes(environment.APP_ENV),
        required: documentEnabled,
        role: 'worker',
    });
    let document: DictionaryWorkerEnvironment['document'] = {
        mode: 'unavailable',
    };
    if (documentEnabled) {
        const fingerprintSecret =
            environment.DICTIONARY_DOCUMENT_FINGERPRINT_HMAC_SECRET;
        if (
            environment.DICTIONARY_DOCUMENT_RUNTIME_MODE === 'unavailable' ||
            !documentStorage ||
            !fingerprintSecret ||
            Buffer.byteLength(fingerprintSecret, 'utf8') < 32
        )
            throw new Error(
                'Document runtime dependencies are required for document-terms:v1.',
            );
        if (environment.DICTIONARY_DOCUMENT_RUNTIME_MODE === 'deterministic') {
            if (['staging', 'production'].includes(environment.APP_ENV))
                throw new Error(
                    'Deterministic document adapters are local/test-only.',
                );
            document = {
                fingerprintSecret,
                mode: 'deterministic',
                storage: documentStorage,
            };
        } else {
            const scannerHost = environment.DICTIONARY_DOCUMENT_SCANNER_HOST;
            const scannerPort = environment.DICTIONARY_DOCUMENT_SCANNER_PORT;
            const applicationRoot =
                environment.DICTIONARY_DOCUMENT_SANDBOX_APPLICATION_ROOT ??
                '/app';
            const parserEntryPath =
                environment.DICTIONARY_DOCUMENT_SANDBOX_PARSER_ENTRY_PATH ??
                '/app/dist/infrastructure/worker/dictionary-document-parser-command.js';
            const bubblewrapPath =
                environment.DICTIONARY_DOCUMENT_SANDBOX_BWRAP_PATH ??
                '/usr/bin/bwrap';
            if (
                !scannerHost ||
                !scannerPort ||
                !/^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$/u.test(scannerHost) ||
                !applicationRoot.startsWith('/') ||
                !parserEntryPath.startsWith(`${applicationRoot}/`) ||
                !bubblewrapPath.startsWith('/')
            )
                throw new Error(
                    'Production document scanner and sandbox configuration is incomplete.',
                );
            document = {
                fingerprintSecret,
                mode: 'production',
                sandbox: { applicationRoot, bubblewrapPath, parserEntryPath },
                scanner: { host: scannerHost, port: scannerPort },
                storage: documentStorage,
            };
        }
    }
    return {
        appEnvironment: environment.APP_ENV,
        concurrency: environment.DICTIONARY_WORKER_CONCURRENCY,
        databaseMaxConnections: environment.DATABASE_MAX_CONNECTIONS,
        databaseUrl: environment.DICTIONARY_WORKER_DATABASE_URL,
        document,
        drainTimeoutMs: environment.DICTIONARY_WORKER_DRAIN_TIMEOUT_MS,
        includeProviderReadiness: supportedFormats.length > 0,
        pollIntervalMs: environment.DICTIONARY_WORKER_POLL_INTERVAL_MS,
        provider,
        providerBudget,
        readinessTimeoutMs: environment.DICTIONARY_WORKER_READINESS_TIMEOUT_MS,
        releaseSha: environment.RELEASE_SHA,
        supportedFormats: supportedFormats.sort(),
    };
}
