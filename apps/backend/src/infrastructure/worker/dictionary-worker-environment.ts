import { z } from 'zod';
import { aiGenerationEnvironmentShape } from '../../config/ai-generation-environment';
import { parseEnvironmentSchema } from '../../config/environment-diagnostics';

import type { DictionaryGenerationProviderBudgetPolicy } from '../../modules/dictionaries/application/ports/dictionary-generation-provider-policy';
import {
    assertDictionaryGenerationProviderBudgetSupportsFormats,
    loadDictionaryGenerationProviderBudgetPolicy,
} from '../../modules/dictionaries/infrastructure/dictionary-generation-provider-policy';
import {
    findTextAiModel as findDictionaryTextModel,
    type TextAiModelCatalogEntry as DictionaryTextModelCatalogEntry,
} from '../../modules/text-ai/infrastructure/ai/text-ai-provider-catalog';
import {
    loadDictionaryDocumentS3Environment,
    type DictionaryDocumentS3Environment,
} from '../../modules/dictionaries/infrastructure/document/dictionary-document-environment';

const jobFormatPattern = /^[a-z][a-z0-9-]{0,63}:v(?:0|[1-9]\d*)$/;
const optionalValue = z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
);
const optionalUrl = z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.url().optional(),
);

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
    ...aiGenerationEnvironmentShape,
    APP_ENV: z.enum(['development', 'test', 'staging', 'production']),
    DATABASE_URL: optionalUrl,
    DATABASE_MAX_CONNECTIONS: z.coerce.number().int().min(1).max(50).default(4),
    DICTIONARY_WORKER_DATABASE_URL: optionalUrl,
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
    DEEPSEEK_API_KEY: optionalValue,
    KIE_API_KEY: optionalValue,
    DICTIONARY_GENERATION_PROVIDER_MODE: z
        .enum(['unavailable', 'deterministic', 'mastra'])
        .default('unavailable'),
    DICTIONARY_AI_PROVIDER_FIXTURE_MODE: z
        .enum(['off', 'deterministic'])
        .default('off'),
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
    sentenceAiTimeoutMs: number;
    textAiTimeoutMs: number;
    appEnvironment: 'development' | 'test' | 'staging' | 'production';
    concurrency: number;
    databaseMaxConnections: number;
    databaseUrl: string;
    drainTimeoutMs: number;
    includeProviderReadiness: boolean;
    pollIntervalMs: number;
    providerFixtureMode: 'off' | 'deterministic';
    providerCredentials: Partial<
        Record<'DEEPSEEK_API_KEY' | 'KIE_API_KEY', string>
    >;
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
              catalogModel: DictionaryTextModelCatalogEntry;
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
    const environment = parseEnvironmentSchema(WorkerEnvironmentSchema, values);
    if (
        environment.DICTIONARY_AI_PROVIDER_FIXTURE_MODE === 'deterministic' &&
        environment.APP_ENV !== 'test'
    ) {
        throw new Error(
            'Dictionary AI provider fixtures are available only in tests.',
        );
    }
    const deployed = ['staging', 'production'].includes(environment.APP_ENV);
    const databaseUrl =
        environment.DICTIONARY_WORKER_DATABASE_URL ??
        (!deployed ? environment.DATABASE_URL : undefined);
    if (!databaseUrl) {
        throw new Error(
            deployed
                ? 'Deployed dictionary workers require an explicit DICTIONARY_WORKER_DATABASE_URL.'
                : 'Development/test dictionary workers require DICTIONARY_WORKER_DATABASE_URL or DATABASE_URL.',
        );
    }
    const database = new URL(databaseUrl);
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
    const legacyModelValues = [
        environment.DICTIONARY_GENERATION_MODEL_API_KEY,
        environment.DICTIONARY_GENERATION_MODEL_BASE_URL,
    ];
    const configuredModelValues = [
        ...legacyModelValues,
        environment.DICTIONARY_GENERATION_MODEL_ID,
    ];
    if (providerMode !== 'mastra' && configuredModelValues.some(Boolean)) {
        throw new Error(
            'Dictionary generation model settings require provider mode mastra.',
        );
    }
    let provider: DictionaryWorkerEnvironment['provider'];
    if (providerMode === 'mastra') {
        const modelId = environment.DICTIONARY_GENERATION_MODEL_ID;
        if (!modelId) {
            throw new Error(
                'Mastra dictionary generation requires a model ID.',
            );
        }
        if (!/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._/-]*$/i.test(modelId)) {
            throw new Error(
                'DICTIONARY_GENERATION_MODEL_ID must use provider/model format.',
            );
        }
        const catalogModel = findDictionaryTextModel(modelId);
        const usesLegacyModelConfiguration = legacyModelValues.some(Boolean);
        if (catalogModel && usesLegacyModelConfiguration) {
            throw new Error(
                'Curated dictionary text models use their trusted catalog URL and provider credential; remove legacy DICTIONARY_GENERATION_MODEL_API_KEY and DICTIONARY_GENERATION_MODEL_BASE_URL.',
            );
        }
        if (!catalogModel)
            throw new Error(
                'Dictionary generation model is unsupported; select a curated model.',
            );
        const apiKey = environment[catalogModel.credentialEnvironmentVariable];
        if (!apiKey)
            throw new Error(
                `Mastra dictionary generation with ${modelId} requires ${catalogModel.credentialEnvironmentVariable}.`,
            );
        provider = {
            apiKey,
            catalogModel,
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
    if (provider.mode === 'mastra') {
        const unsupportedFormats = supportedFormats.filter(
            (format) =>
                format !== 'conversation:v1' &&
                format !== 'portrait-interview:v1' &&
                !provider.catalogModel.supportedFormats.includes(format),
        );
        if (unsupportedFormats.length > 0) {
            throw new Error(
                `Dictionary text model ${provider.modelId} does not support worker formats: ${unsupportedFormats.join(', ')}.`,
            );
        }
    }
    const documentEnabled = supportedFormats.some((format) =>
        ['document-terms:v1', 'document-terms:v2'].includes(format),
    );
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
                'Document runtime dependencies are required for document generation.',
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
        sentenceAiTimeoutMs: environment.SENTENCE_AI_TIMEOUT_MS,
        textAiTimeoutMs: environment.TEXT_AI_TIMEOUT_MS,
        appEnvironment: environment.APP_ENV,
        concurrency: environment.DICTIONARY_WORKER_CONCURRENCY,
        databaseMaxConnections: environment.DATABASE_MAX_CONNECTIONS,
        databaseUrl,
        document,
        drainTimeoutMs: environment.DICTIONARY_WORKER_DRAIN_TIMEOUT_MS,
        includeProviderReadiness: supportedFormats.length > 0,
        pollIntervalMs: environment.DICTIONARY_WORKER_POLL_INTERVAL_MS,
        providerFixtureMode: environment.DICTIONARY_AI_PROVIDER_FIXTURE_MODE,
        providerCredentials: {
            ...(environment.DEEPSEEK_API_KEY
                ? { DEEPSEEK_API_KEY: environment.DEEPSEEK_API_KEY }
                : {}),
            ...(environment.KIE_API_KEY
                ? { KIE_API_KEY: environment.KIE_API_KEY }
                : {}),
        },
        provider,
        providerBudget,
        readinessTimeoutMs: environment.DICTIONARY_WORKER_READINESS_TIMEOUT_MS,
        releaseSha: environment.RELEASE_SHA,
        supportedFormats: supportedFormats.sort(),
    };
}
