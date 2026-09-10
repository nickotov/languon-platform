import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { hostname } from 'node:os';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

import { createDrizzleDatabase, createPostgresClient } from '@languon/database';

import { databaseSchema } from '../database/schema';
import { createCardProposalGenerator } from '../../modules/dictionaries/infrastructure/ai/card-proposal-generators';
import { createCardAuthoringProposalGenerator } from '../../modules/dictionaries/infrastructure/ai/card-authoring-proposal-generators';
import { createPastedTermsProposalGenerator } from '../../modules/dictionaries/infrastructure/ai/pasted-terms-proposal-generators';
import { createImportPairsProposalGenerator } from '../../modules/dictionaries/infrastructure/ai/import-pairs-proposal-generators';
import { createDictionaryWorkerComposition } from '../../modules/dictionaries/infrastructure/dictionary-worker-composition';
import {
    dictionaryImportPairsGenerationFormat,
    dictionaryPastedTermsGenerationFormat,
} from '../../modules/dictionaries/domain/generation';
import { dictionaryDocumentGenerationFormat } from '../../modules/dictionaries/domain/document-ingestion';
import { dictionaryCardAuthoringGenerationFormat } from '../../modules/dictionaries/domain/card-authoring';
import { createDictionaryDocumentS3Client } from '../../modules/dictionaries/infrastructure/document/s3-document-client';
import { S3PrivateDocumentStorage } from '../../modules/dictionaries/infrastructure/document/s3-dictionary-document-storage';
import {
    DeterministicDocumentMalwareScanner,
    DeterministicDocumentOcrProvider,
    DeterministicSandboxedDocumentExtractor,
    UnavailableDocumentOcrProvider,
} from '../../modules/dictionaries/infrastructure/document/deterministic-document-adapters';
import { ClamAvDocumentMalwareScanner } from '../../modules/dictionaries/infrastructure/document/clamav-document-malware-scanner';
import { BubblewrapSandboxedDocumentExtractor } from '../../modules/dictionaries/infrastructure/document/bubblewrap-sandboxed-document-extractor';
import { HmacDictionaryCryptography } from '../../modules/dictionaries/infrastructure/crypto/dictionary-cryptography';
import { loadDictionaryWorkerEnvironment } from './dictionary-worker-environment';
import { DictionaryWorkerRuntime } from './dictionary-worker-runtime';

export const dictionaryWorkerLocalEnvironmentFile = new URL(
    '../../../../../.env.local',
    import.meta.url,
);

function createWorkerId(releaseSha: string): string {
    return [
        'dictionary',
        releaseSha.slice(0, 12),
        hostname().slice(0, 32),
        process.pid,
        randomUUID(),
    ].join(':');
}

async function main(values = process.argv.slice(2)): Promise<void> {
    if (existsSync(dictionaryWorkerLocalEnvironmentFile)) {
        loadEnvFile(dictionaryWorkerLocalEnvironmentFile);
    }
    const [command = 'run'] = values;
    if (!['healthcheck', 'run'].includes(command) || values.length > 1) {
        throw new Error(
            'Usage: dictionary-worker-command.ts <run|healthcheck>',
        );
    }

    const environment = loadDictionaryWorkerEnvironment();
    const sql = createPostgresClient({
        databaseUrl: environment.databaseUrl,
        maxConnections: environment.databaseMaxConnections,
    });
    const database = createDrizzleDatabase(sql, databaseSchema);
    const provider = createCardProposalGenerator(
        environment.provider.mode === 'mastra'
            ? {
                  mode: 'mastra',
                  model: {
                      apiKey: environment.provider.apiKey,
                      id: environment.provider.modelId,
                      url: environment.provider.baseUrl,
                  },
                  providerBudget: environment.providerBudget,
              }
            : { mode: environment.provider.mode },
    );
    const cardAuthoringProvider = createCardAuthoringProposalGenerator(
        environment.supportedFormats.includes(
            dictionaryCardAuthoringGenerationFormat,
        )
            ? environment.provider.mode === 'mastra'
                ? {
                      mode: 'mastra',
                      model: {
                          apiKey: environment.provider.apiKey,
                          id: environment.provider.modelId,
                          url: environment.provider.baseUrl,
                      },
                      providerBudget: environment.providerBudget,
                  }
                : { mode: environment.provider.mode }
            : { mode: 'unavailable' },
    );
    const pastedTermsProvider = createPastedTermsProposalGenerator(
        environment.supportedFormats.includes(
            dictionaryPastedTermsGenerationFormat,
        )
            ? environment.provider.mode === 'mastra'
                ? {
                      mode: 'mastra',
                      model: {
                          apiKey: environment.provider.apiKey,
                          id: environment.provider.modelId,
                          url: environment.provider.baseUrl,
                      },
                      providerBudget: environment.providerBudget,
                  }
                : { mode: environment.provider.mode }
            : { mode: 'unavailable' },
    );
    const importPairsProvider = createImportPairsProposalGenerator(
        environment.supportedFormats.includes(
            dictionaryImportPairsGenerationFormat,
        )
            ? environment.provider.mode === 'mastra'
                ? {
                      mode: 'mastra',
                      model: {
                          apiKey: environment.provider.apiKey,
                          id: environment.provider.modelId,
                          url: environment.provider.baseUrl,
                      },
                      providerBudget: environment.providerBudget,
                  }
                : { mode: environment.provider.mode }
            : { mode: 'unavailable' },
    );
    const documentEnabled = environment.supportedFormats.includes(
        dictionaryDocumentGenerationFormat,
    );
    const documentEnvironment =
        environment.document.mode === 'unavailable'
            ? undefined
            : environment.document;
    const documentS3Client =
        documentEnabled && documentEnvironment
            ? createDictionaryDocumentS3Client(documentEnvironment.storage)
            : undefined;
    const documentStorage =
        documentS3Client && documentEnvironment
            ? new S3PrivateDocumentStorage({
                  bucket: documentEnvironment.storage.bucket,
                  client: documentS3Client,
              })
            : undefined;
    const document =
        documentStorage && environment.document.mode === 'deterministic'
            ? {
                  extractor: new DeterministicSandboxedDocumentExtractor(),
                  fingerprint: new HmacDictionaryCryptography({
                      entropy: { randomBytes },
                      secret: environment.document.fingerprintSecret,
                  }),
                  ocr: new DeterministicDocumentOcrProvider(),
                  ocrEnabled: true,
                  scanner: new DeterministicDocumentMalwareScanner(),
                  storage: documentStorage,
              }
            : documentStorage && environment.document.mode === 'production'
              ? {
                    extractor: new BubblewrapSandboxedDocumentExtractor({
                        applicationRoot:
                            environment.document.sandbox.applicationRoot,
                        bubblewrapPath:
                            environment.document.sandbox.bubblewrapPath,
                        parserEntryPath:
                            environment.document.sandbox.parserEntryPath,
                    }),
                    fingerprint: new HmacDictionaryCryptography({
                        entropy: { randomBytes },
                        secret: environment.document.fingerprintSecret,
                    }),
                    ocr: new UnavailableDocumentOcrProvider(),
                    ocrEnabled: false,
                    scanner: new ClamAvDocumentMalwareScanner(
                        environment.document.scanner,
                    ),
                    storage: documentStorage,
                }
              : undefined;
    const { service } = createDictionaryWorkerComposition({
        cardAuthoringProvider,
        clock: { now: () => new Date() },
        database,
        ...(document ? { document } : {}),
        ids: { generate: randomUUID },
        importPairsProvider,
        pastedTermsProvider,
        provider,
        providerBudget: environment.providerBudget,
        supportedFormats: environment.supportedFormats,
    });
    const runtime = new DictionaryWorkerRuntime({
        concurrency: environment.concurrency,
        drainTimeoutMs: environment.drainTimeoutMs,
        includeProviderReadiness: environment.includeProviderReadiness,
        pollIntervalMs: environment.pollIntervalMs,
        readinessTimeoutMs: environment.readinessTimeoutMs,
        service,
        supportedFormats: environment.supportedFormats,
        workerId: createWorkerId(environment.releaseSha),
    });

    if (command === 'healthcheck') {
        try {
            await runtime.readiness();
        } finally {
            documentS3Client?.destroy();
            await sql.end({ timeout: 1 });
        }
        return;
    }

    const shutdown = (signal: 'SIGINT' | 'SIGTERM') => {
        void runtime
            .shutdown(signal)
            .then(({ forced }) => {
                if (forced) process.exitCode = 1;
            })
            .catch(() => {
                process.exitCode = 1;
            });
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    try {
        await runtime.run();
    } finally {
        process.removeListener('SIGINT', shutdown);
        process.removeListener('SIGTERM', shutdown);
        documentS3Client?.destroy();
        await sql.end({ timeout: 5 });
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(() => {
        process.stderr.write('Dictionary worker command failed.\n');
        process.exitCode = 1;
    });
}
