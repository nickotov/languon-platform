import { describe, expect, it } from 'vitest';

import { loadDictionaryWorkerEnvironment } from '../../../../src/infrastructure/worker/dictionary-worker-environment';

const base = {
    APP_ENV: 'test',
    DICTIONARY_WORKER_DATABASE_URL:
        'postgres://user:pass@localhost:5432/languon',
};

const liveProviderBudget = {
    DICTIONARY_GENERATION_INPUT_COST_MICROS_PER_MILLION_TOKENS: '1000000',
    DICTIONARY_GENERATION_MAX_COST_MICROS_PER_ATTEMPT: '100000',
    DICTIONARY_GENERATION_MAX_INPUT_TOKENS: '65536',
    DICTIONARY_GENERATION_MAX_OUTPUT_TOKENS: '1024',
    DICTIONARY_GENERATION_OUTPUT_COST_MICROS_PER_MILLION_TOKENS: '10000000',
};

describe('dictionary worker environment', () => {
    it('loads a worker-only bounded configuration', () => {
        expect(
            loadDictionaryWorkerEnvironment({
                ...base,
                DICTIONARY_GENERATION_PROVIDER_MODE: 'deterministic',
                DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS:
                    'single-card:v2,single-card:v1',
                DICTIONARY_WORKER_CONCURRENCY: '3',
            }),
        ).toMatchObject({
            concurrency: 3,
            databaseMaxConnections: 4,
            provider: { mode: 'deterministic' },
            supportedFormats: ['single-card:v1', 'single-card:v2'],
        });
    });

    it('does not require HTTP authentication, Redis, or model credentials', () => {
        expect(loadDictionaryWorkerEnvironment(base)).toMatchObject({
            includeProviderReadiness: false,
        });
    });

    it('requires provider readiness while any processable format can drain', () => {
        expect(
            loadDictionaryWorkerEnvironment({
                ...base,
                DICTIONARY_GENERATION_PROVIDER_MODE: 'deterministic',
                DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS: 'single-card:v1',
            }).includeProviderReadiness,
        ).toBe(true);
        expect(() =>
            loadDictionaryWorkerEnvironment({
                ...base,
                DICTIONARY_JOB_API_ENQUEUED_FORMATS: '',
                DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS: 'single-card:v1',
            }),
        ).toThrow(/processable.*provider|provider.*processable/i);
        expect(() =>
            loadDictionaryWorkerEnvironment({
                ...base,
                DICTIONARY_GENERATION_PROVIDER_MODE: 'deterministic',
                DICTIONARY_JOB_API_ENQUEUED_FORMATS: 'single-card:v2',
                DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS: 'single-card:v1',
            }),
        ).toThrow(/must be supported by this worker/);
    });

    it('requires Mastra for deployed drain-only processable formats', () => {
        expect(() =>
            loadDictionaryWorkerEnvironment({
                ...base,
                APP_ENV: 'production',
                DICTIONARY_WORKER_DATABASE_URL:
                    'postgres://user:pass@database.internal:5432/languon?sslmode=verify-full',
                DICTIONARY_JOB_API_ENQUEUED_FORMATS: '',
                DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS: 'single-card:v1',
            }),
        ).toThrow(/processable.*Mastra|Mastra.*processable/i);
    });

    it('requires its dedicated database credential', () => {
        const { DICTIONARY_WORKER_DATABASE_URL: _, ...withoutWorkerDatabase } =
            base;
        expect(() =>
            loadDictionaryWorkerEnvironment(withoutWorkerDatabase),
        ).toThrow(/DICTIONARY_WORKER_DATABASE_URL/);
    });

    it('rejects duplicate, malformed, and unbounded settings', () => {
        expect(() =>
            loadDictionaryWorkerEnvironment({
                ...base,
                DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS:
                    'single-card:v1,single-card:v1',
            }),
        ).toThrow(/unique comma-separated/);
        expect(() =>
            loadDictionaryWorkerEnvironment({
                ...base,
                DICTIONARY_WORKER_CONCURRENCY: '33',
            }),
        ).toThrow();
        expect(() =>
            loadDictionaryWorkerEnvironment({
                ...base,
                APP_ENV: 'production',
                DICTIONARY_WORKER_DATABASE_URL:
                    'postgres://user:pass@database.internal:5432/languon?sslmode=verify-full',
                DICTIONARY_GENERATION_PROVIDER_MODE: 'deterministic',
            }),
        ).toThrow(/local-only/);
    });

    it('accepts only complete deployed HTTPS Mastra configuration', () => {
        expect(
            loadDictionaryWorkerEnvironment({
                ...base,
                APP_ENV: 'production',
                DICTIONARY_WORKER_DATABASE_URL:
                    'postgres://user:pass@database.internal:5432/languon?sslmode=verify-full',
                DICTIONARY_GENERATION_PROVIDER_MODE: 'mastra',
                DICTIONARY_GENERATION_MODEL_API_KEY: 'private-test-key',
                DICTIONARY_GENERATION_MODEL_BASE_URL:
                    'https://models.example.test/openai/v1',
                DICTIONARY_GENERATION_MODEL_ID: 'provider/model-v1',
                ...liveProviderBudget,
            }).provider,
        ).toEqual({
            apiKey: 'private-test-key',
            baseUrl: 'https://models.example.test/openai/v1',
            mode: 'mastra',
            modelId: 'provider/model-v1',
        });
        expect(() =>
            loadDictionaryWorkerEnvironment({
                ...base,
                APP_ENV: 'production',
                DICTIONARY_WORKER_DATABASE_URL:
                    'postgres://user:pass@database.internal:5432/languon?sslmode=verify-full',
                DICTIONARY_GENERATION_PROVIDER_MODE: 'mastra',
                DICTIONARY_GENERATION_MODEL_API_KEY: 'private-test-key',
                DICTIONARY_GENERATION_MODEL_BASE_URL: 'http://models.test',
                DICTIONARY_GENERATION_MODEL_ID: 'provider/model-v1',
                ...liveProviderBudget,
            }),
        ).toThrow(/HTTPS provider URL/);
        for (const unsafeUrl of [
            'https://user:pass@models.example.test/v1',
            'https://models.example.test/v1?tenant=private',
            'https://127.0.0.1/v1',
            'https://[::1]/v1',
        ]) {
            expect(() =>
                loadDictionaryWorkerEnvironment({
                    ...base,
                    APP_ENV: 'production',
                    DICTIONARY_WORKER_DATABASE_URL:
                        'postgres://user:pass@database.internal:5432/languon?sslmode=verify-full',
                    DICTIONARY_GENERATION_PROVIDER_MODE: 'mastra',
                    DICTIONARY_GENERATION_MODEL_API_KEY: 'private-test-key',
                    DICTIONARY_GENERATION_MODEL_BASE_URL: unsafeUrl,
                    DICTIONARY_GENERATION_MODEL_ID: 'provider/model-v1',
                    ...liveProviderBudget,
                }),
            ).toThrow(/credential-free HTTPS provider URL/);
        }
    });

    it('requires and validates an explicit conservative live provider budget', () => {
        const live = loadDictionaryWorkerEnvironment({
            ...base,
            DICTIONARY_GENERATION_MODEL_API_KEY: 'private-test-key',
            DICTIONARY_GENERATION_MODEL_BASE_URL:
                'https://models.example.test/openai/v1',
            DICTIONARY_GENERATION_MODEL_ID: 'provider/model-v1',
            DICTIONARY_GENERATION_PROVIDER_MODE: 'mastra',
            ...liveProviderBudget,
        });
        expect(live.providerBudget).toEqual({
            inputCostMicrosPerMillionTokens: 1_000_000,
            maxCostMicrosPerAttempt: 100_000,
            maxInputTokensPerAttempt: 65_536,
            maxOutputTokensPerAttempt: 1_024,
            outputCostMicrosPerMillionTokens: 10_000_000,
        });

        expect(() =>
            loadDictionaryWorkerEnvironment({
                ...base,
                DICTIONARY_GENERATION_MODEL_API_KEY: 'private-test-key',
                DICTIONARY_GENERATION_MODEL_BASE_URL:
                    'https://models.example.test/openai/v1',
                DICTIONARY_GENERATION_MODEL_ID: 'provider/model-v1',
                DICTIONARY_GENERATION_PROVIDER_MODE: 'mastra',
            }),
        ).toThrow(/all five/i);
        expect(() =>
            loadDictionaryWorkerEnvironment({
                ...base,
                DICTIONARY_GENERATION_MODEL_API_KEY: 'private-test-key',
                DICTIONARY_GENERATION_MODEL_BASE_URL:
                    'https://models.example.test/openai/v1',
                DICTIONARY_GENERATION_MODEL_ID: 'provider/model-v1',
                DICTIONARY_GENERATION_PROVIDER_MODE: 'mastra',
                ...liveProviderBudget,
                DICTIONARY_GENERATION_MAX_COST_MICROS_PER_ATTEMPT: '1000',
            }),
        ).toThrow(/must cover/i);
        expect(() =>
            loadDictionaryWorkerEnvironment({
                ...base,
                ...liveProviderBudget,
                DICTIONARY_GENERATION_MAX_INPUT_TOKENS: '32767',
            }),
        ).toThrow(/between 32768 and 262144/);
    });

    it('requires the full aggregate provider envelope before pasted-term activation', () => {
        const pastedBudget = {
            DICTIONARY_GENERATION_INPUT_COST_MICROS_PER_MILLION_TOKENS:
                '1000000',
            DICTIONARY_GENERATION_MAX_COST_MICROS_PER_ATTEMPT: '700000',
            DICTIONARY_GENERATION_MAX_INPUT_TOKENS: '262144',
            DICTIONARY_GENERATION_MAX_OUTPUT_TOKENS: '40960',
            DICTIONARY_GENERATION_OUTPUT_COST_MICROS_PER_MILLION_TOKENS:
                '10000000',
        };
        const activated = {
            ...base,
            DICTIONARY_GENERATION_MODEL_API_KEY: 'private-test-key',
            DICTIONARY_GENERATION_MODEL_BASE_URL:
                'https://models.example.test/openai/v1',
            DICTIONARY_GENERATION_MODEL_ID: 'provider/model-v1',
            DICTIONARY_GENERATION_PROVIDER_MODE: 'mastra',
            DICTIONARY_JOB_API_ENQUEUED_FORMATS: 'pasted-terms:v1',
            DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS: 'pasted-terms:v1',
            ...pastedBudget,
        };

        expect(
            loadDictionaryWorkerEnvironment(activated).providerBudget,
        ).toEqual({
            inputCostMicrosPerMillionTokens: 1_000_000,
            maxCostMicrosPerAttempt: 700_000,
            maxInputTokensPerAttempt: 262_144,
            maxOutputTokensPerAttempt: 40_960,
            outputCostMicrosPerMillionTokens: 10_000_000,
        });
        expect(() =>
            loadDictionaryWorkerEnvironment({
                ...activated,
                DICTIONARY_GENERATION_MAX_INPUT_TOKENS: '262143',
            }),
        ).toThrow(/262144 input-token and 40960 output-token/);
        expect(() =>
            loadDictionaryWorkerEnvironment({
                ...activated,
                DICTIONARY_GENERATION_MAX_OUTPUT_TOKENS: '40959',
            }),
        ).toThrow(/262144 input-token and 40960 output-token/);
    });

    it('requires worker-only storage and a local deterministic document runtime', () => {
        const document = {
            ...base,
            DICTIONARY_DOCUMENT_FINGERPRINT_HMAC_SECRET:
                'document-test-fingerprint-secret-32-bytes',
            DICTIONARY_DOCUMENT_RUNTIME_MODE: 'deterministic',
            DICTIONARY_GENERATION_PROVIDER_MODE: 'deterministic',
            DICTIONARY_DOCUMENT_STORAGE_BUCKET: 'documents-test',
            DICTIONARY_DOCUMENT_STORAGE_ENDPOINT: 'http://127.0.0.1:59000',
            DICTIONARY_DOCUMENT_STORAGE_FORCE_PATH_STYLE: 'true',
            DICTIONARY_DOCUMENT_STORAGE_MODE: 's3',
            DICTIONARY_DOCUMENT_STORAGE_REGION: 'us-east-1',
            DICTIONARY_DOCUMENT_STORAGE_WORKER_ACCESS_KEY_ID: 'worker-key',
            DICTIONARY_DOCUMENT_STORAGE_WORKER_SECRET_ACCESS_KEY:
                'worker-secret-at-least-sixteen',
            DICTIONARY_GENERATION_INPUT_COST_MICROS_PER_MILLION_TOKENS:
                '1000000',
            DICTIONARY_GENERATION_MAX_COST_MICROS_PER_ATTEMPT: '700000',
            DICTIONARY_GENERATION_MAX_INPUT_TOKENS: '262144',
            DICTIONARY_GENERATION_MAX_OUTPUT_TOKENS: '40960',
            DICTIONARY_GENERATION_OUTPUT_COST_MICROS_PER_MILLION_TOKENS:
                '10000000',
            DICTIONARY_JOB_API_ENQUEUED_FORMATS: 'document-terms:v1',
            DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS: 'document-terms:v1',
        };
        expect(
            loadDictionaryWorkerEnvironment(document).document,
        ).toMatchObject({
            mode: 'deterministic',
            storage: { accessKeyId: 'worker-key' },
        });
        expect(() =>
            loadDictionaryWorkerEnvironment({
                ...document,
                DICTIONARY_DOCUMENT_FINGERPRINT_HMAC_SECRET: '',
            }),
        ).toThrow(/runtime dependencies/);
        expect(() =>
            loadDictionaryWorkerEnvironment({
                ...document,
                DICTIONARY_DOCUMENT_STORAGE_WORKER_SECRET_ACCESS_KEY: '',
            }),
        ).toThrow(/incomplete/);
        expect(() =>
            loadDictionaryWorkerEnvironment({
                ...document,
                APP_ENV: 'production',
                DICTIONARY_WORKER_DATABASE_URL:
                    'postgres://worker:secret@database.internal:5432/languon?sslmode=verify-full',
                DICTIONARY_DOCUMENT_STORAGE_ENDPOINT:
                    'https://documents.example.test',
                DICTIONARY_GENERATION_MODEL_API_KEY: 'private-test-key',
                DICTIONARY_GENERATION_MODEL_BASE_URL:
                    'https://models.example.test/openai/v1',
                DICTIONARY_GENERATION_MODEL_ID: 'provider/model-v1',
                DICTIONARY_GENERATION_PROVIDER_MODE: 'mastra',
            }),
        ).toThrow(/local\/test-only/);
    });

    it('requires a production PostgreSQL origin with verified TLS', () => {
        expect(() =>
            loadDictionaryWorkerEnvironment({
                ...base,
                APP_ENV: 'production',
            }),
        ).toThrow(/non-local PostgreSQL/);
        expect(() =>
            loadDictionaryWorkerEnvironment({
                ...base,
                APP_ENV: 'production',
                DICTIONARY_WORKER_DATABASE_URL:
                    'postgres://user:pass@database.internal:5432/languon',
            }),
        ).toThrow(/sslmode=verify-full/);
    });
});
