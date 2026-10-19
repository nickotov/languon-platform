import { createConversationWorkerComposition } from '../../modules/conversations/infrastructure/conversation-worker-composition';
import { createTextSelectionWorkerComposition } from '../../modules/dictionaries/infrastructure/text-selection-composition';
import { createTextsCryptography } from '../../modules/texts/infrastructure/texts-composition';
import { resolveTextTranslationProposal } from '../../modules/texts/infrastructure/persistence/drizzle/texts-job-support';
import { defaultTextAiAvailabilityPolicy } from '../../modules/text-ai/infrastructure/persistence/drizzle/text-ai-catalog-query';
import { createTextsWorkerComposition } from '../../modules/texts/infrastructure/texts-ai-composition';
import {
    createTextsAiProvider,
    DeterministicTextsAiProvider,
} from '../../modules/texts/infrastructure/ai/texts-ai-provider';
import { createSpeechInfrastructure } from '../../modules/speech/infrastructure/composition';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { hostname } from 'node:os';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

import { createDrizzleDatabase, createPostgresClient } from '@languon/database';
import {
    createSentencePreparationWorkerComposition,
    createSentenceWorkerComposition,
} from '../../modules/learning/infrastructure/sentence-composition';
import { createSentenceAiProvider } from '../../modules/learning/infrastructure/ai/sentence-ai-provider';
import type { SentenceAiProvider } from '../../modules/learning/application/ports/sentence-ai-provider';
import { DictionaryWorkerCoordinator } from '../../modules/dictionaries/application/dictionary-worker-coordinator';
import { createDictionaryAudioAdapters } from '../../modules/speech/infrastructure/audio/dictionary-audio-adapters';
import { loadDictionaryAudioEnvironment } from '../../modules/speech/infrastructure/audio/dictionary-audio-environment';

import { databaseSchema } from '../database/schema';
import { createCardProposalGenerator } from '../../modules/dictionaries/infrastructure/ai/card-proposal-generators';
import { createCardAuthoringProposalGenerator } from '../../modules/dictionaries/infrastructure/ai/card-authoring-proposal-generators';
import { createPastedTermsProposalGenerator } from '../../modules/dictionaries/infrastructure/ai/pasted-terms-proposal-generators';
import { createImportPairsProposalGenerator } from '../../modules/dictionaries/infrastructure/ai/import-pairs-proposal-generators';
import { createTextAiMastraGeneratorOptions as createDictionaryTextMastraGeneratorOptions } from '../../modules/text-ai/infrastructure/ai/text-ai-provider-catalog';
import {
    createDictionaryTextProviderRoutingAdapters,
    DictionaryTextProviderRouter,
} from '../../modules/dictionaries/infrastructure/ai/dictionary-text-provider-router';
import { publishTextAiWorkerObservations } from '../../modules/text-ai/infrastructure/ai/text-ai-worker-observations';
import { createDictionaryWorkerComposition } from '../../modules/dictionaries/infrastructure/dictionary-worker-composition';
import {
    dictionaryImportPairsGenerationFormat,
    dictionaryPastedTermsGenerationFormat,
} from '../../modules/dictionaries/domain/generation';
import { dictionaryDocumentGenerationFormat } from '../../modules/dictionaries/domain/document-ingestion';
import {
    dictionaryCardAuthoringGenerationFormat,
    dictionaryCardAuthoringGenerationFormatV1,
} from '../../modules/dictionaries/domain/card-authoring';
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
import {
    loadDictionaryWorkerEnvironment,
    type DictionaryWorkerEnvironment,
} from './dictionary-worker-environment';
import { DictionaryWorkerRuntime } from './dictionary-worker-runtime';

export const dictionaryWorkerLocalEnvironmentFile = new URL(
    '../../../../../.env.local',
    import.meta.url,
);

/** Dictionary deterministic fixtures do not define a language-general sentence
 * fixture. Fail closed instead of accidentally calling a paid model. Reviewed
 * composed journeys inject their deterministic provider through the worker port. */
export function createWorkerSentenceProvider(
    environment: Pick<
        DictionaryWorkerEnvironment,
        'providerFixtureMode' | 'providerCredentials'
    >,
): SentenceAiProvider {
    if (environment.providerFixtureMode === 'deterministic') {
        const unavailable = async (): Promise<never> => {
            throw new Error('Sentence provider fixtures are unavailable.');
        };
        return { generate: unavailable, check: unavailable };
    }
    return createSentenceAiProvider({
        credentials: environment.providerCredentials,
    });
}

/** Synthetic local fixtures exercise durable execution without calling a paid provider. */
export function createWorkerTextsProvider(
    environment: Pick<
        DictionaryWorkerEnvironment,
        'providerFixtureMode' | 'providerCredentials'
    >,
) {
    return environment.providerFixtureMode === 'deterministic'
        ? new DeterministicTextsAiProvider((input) => ({
              draft:
                  input.kind === 'text-detection'
                      ? { language: 'en', confidence: 'high' }
                      : {
                            translation: input.segments.map((segment) => ({
                                pairId: segment.pairId,
                                text: `[${input.targetLanguage}] ${segment.text}`,
                            })),
                        },
              usage: { inputTokens: 1, outputTokens: 1 },
          }))
        : createTextsAiProvider({
              credentials: environment.providerCredentials,
          });
}

/** Both initial and recurring publication use this reviewed executor capability seam. */
export function publishWorkerTextAiObservations(
    environment: Pick<
        DictionaryWorkerEnvironment,
        | 'providerFixtureMode'
        | 'supportedFormats'
        | 'providerCredentials'
        | 'readinessTimeoutMs'
    >,
    database: Parameters<typeof publishTextAiWorkerObservations>[0]['database'],
    workerId: string,
) {
    return publishTextAiWorkerObservations({
        conversationCapacityEnabled: true,
        conversationExecutionEnabled:
            environment.providerFixtureMode !== 'deterministic' &&
            environment.supportedFormats.includes('conversation:v1'),
        textsCapacityEnabled: true,
        textsExecutionEnabled: true,
        learningExecutionEnabled:
            environment.providerFixtureMode !== 'deterministic',
        sentencePreparationExecutionEnabled:
            environment.providerFixtureMode !== 'deterministic',
        supportedFormats: environment.supportedFormats,
        credentials: environment.providerCredentials,
        database,
        ...(environment.providerFixtureMode === 'deterministic'
            ? { fetchProvider: async () => new Response(null, { status: 200 }) }
            : {}),
        readinessTimeoutMs: environment.readinessTimeoutMs,
        workerId,
    });
}

class DictionaryWorkerConfigurationError extends Error {}

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

    let environment: ReturnType<typeof loadDictionaryWorkerEnvironment>;
    try {
        environment = loadDictionaryWorkerEnvironment();
    } catch (error) {
        throw new DictionaryWorkerConfigurationError(
            `Dictionary worker configuration failed: ${
                error instanceof Error
                    ? error.message
                    : 'unknown configuration error'
            }`,
        );
    }
    const sql = createPostgresClient({
        databaseUrl: environment.databaseUrl,
        maxConnections: environment.databaseMaxConnections,
    });
    const database = createDrizzleDatabase(sql, databaseSchema);
    const audioDeployed = ['staging', 'production'].includes(
        process.env.APP_ENV ?? 'development',
    );
    if (
        audioDeployed &&
        process.env.SPEECH_GENERATION_ENABLED === 'true' &&
        (!process.env.SPEECH_WORKER_PROCESSABLE_VERSIONS?.split(',').includes(
            '1',
        ) ||
            !process.env.AI_MODEL_PRICE_WORKER_PROCESSABLE_VERSIONS?.split(
                ',',
            ).includes('1'))
    ) {
        throw new Error(
            'Shared speech worker requires compatible processing and pricing revisions.',
        );
    }
    const audioEnvironment = loadDictionaryAudioEnvironment(process.env, {
        deployed: audioDeployed,
        role: 'worker',
    });
    const audioAdapters = createDictionaryAudioAdapters({
        role: 'worker',
        environment: audioEnvironment,
        database,
    });
    const sharedSpeech = createSpeechInfrastructure({
        database,
        dictionaryHmacSecret:
            process.env.DICTIONARY_HMAC_SECRET ??
            audioEnvironment.fingerprintSecret ??
            'languon-local-speech-worker-hmac-secret',
        environment: audioEnvironment,
        storage: audioAdapters.storage,
        provider: audioAdapters.provider,
        providers: audioAdapters.providers,
        playbackEnabled: process.env.SPEECH_PLAYBACK_ENABLED === 'true',
        generationEnabled: process.env.SPEECH_GENERATION_ENABLED === 'true',
    });

    const defaultMastraOptions =
        environment.provider.mode === 'mastra'
            ? createDictionaryTextMastraGeneratorOptions({
                  apiKey: environment.provider.apiKey,
                  model: environment.provider.catalogModel,
                  providerBudget: environment.providerBudget,
              })
            : undefined;
    const provider = createCardProposalGenerator(
        environment.provider.mode === 'mastra'
            ? defaultMastraOptions!
            : { mode: environment.provider.mode },
    );
    const cardAuthoringProvider = createCardAuthoringProposalGenerator(
        environment.supportedFormats.includes(
            dictionaryCardAuthoringGenerationFormatV1,
        ) ||
            environment.supportedFormats.includes(
                dictionaryCardAuthoringGenerationFormat,
            )
            ? environment.provider.mode === 'mastra'
                ? defaultMastraOptions!
                : { mode: environment.provider.mode }
            : { mode: 'unavailable' },
    );
    const pastedTermsProvider = createPastedTermsProposalGenerator(
        environment.supportedFormats.includes(
            dictionaryPastedTermsGenerationFormat,
        )
            ? environment.provider.mode === 'mastra'
                ? defaultMastraOptions!
                : { mode: environment.provider.mode }
            : { mode: 'unavailable' },
    );
    const importPairsProvider = createImportPairsProposalGenerator(
        environment.supportedFormats.includes(
            dictionaryImportPairsGenerationFormat,
        )
            ? environment.provider.mode === 'mastra'
                ? defaultMastraOptions!
                : { mode: environment.provider.mode }
            : { mode: 'unavailable' },
    );
    const routedProviders = createDictionaryTextProviderRoutingAdapters({
        legacy: {
            card: provider,
            cardAuthoring: cardAuthoringProvider,
            importPairs: importPairsProvider,
            pastedTerms: pastedTermsProvider,
        },
        router: new DictionaryTextProviderRouter({
            credentials: environment.providerCredentials,
            ...(environment.providerFixtureMode === 'deterministic'
                ? {
                      factory: () => ({
                          card: createCardProposalGenerator({
                              mode: 'deterministic',
                          }),
                          cardAuthoring: createCardAuthoringProposalGenerator({
                              mode: 'deterministic',
                          }),
                          importPairs: createImportPairsProposalGenerator({
                              mode: 'deterministic',
                          }),
                          pastedTerms: createPastedTermsProposalGenerator({
                              mode: 'deterministic',
                          }),
                      }),
                  }
                : {}),
        }),
    });
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
        cardAuthoringProvider: routedProviders.cardAuthoring,
        clock: { now: () => new Date() },
        database,
        ...(document ? { document } : {}),
        ids: { generate: randomUUID },
        importPairsProvider: routedProviders.importPairs,
        pastedTermsProvider: routedProviders.pastedTerms,
        provider: routedProviders.card,
        providerBudget: environment.providerBudget,
        supportedFormats: environment.supportedFormats,
    });
    const speechSupported =
        !audioDeployed ||
        (process.env.SPEECH_WORKER_PROCESSABLE_VERSIONS?.split(',').includes(
            '1',
        ) &&
            process.env.AI_MODEL_PRICE_WORKER_PROCESSABLE_VERSIONS?.split(
                ',',
            ).includes('1'));
    const coordinator = new DictionaryWorkerCoordinator(service, {
        runOnce: (signal?: AbortSignal) => sharedSpeech.worker.runOnce(signal),
    });
    const coordinatedService = {
        processNext: (input: Parameters<typeof service.processNext>[0]) =>
            speechSupported
                ? coordinator.processNext(input)
                : service.processNext(input),
        readiness: service.readiness.bind(service),
        releaseWorkerLeases: service.releaseWorkerLeases.bind(service),
        observeOperationalState: service.observeOperationalState.bind(service),
    };
    const workerId = createWorkerId(environment.releaseSha);
    // The API flag controls admissions, never draining persisted sentence jobs.
    const generationFormat =
        process.env.LEARNING_SENTENCE_GENERATION_FORMAT ??
        'sentence-generation:v1';
    if (
        generationFormat !== 'sentence-generation:v1' &&
        generationFormat !== 'sentence-generation:v2'
    )
        throw new Error('Invalid sentence generation format');
    const { preparation: sentencePreparation } =
        createSentencePreparationWorkerComposition({
            database,
            admission: { generationFormat },
        });
    const { worker: sentenceWorker } = createSentenceWorkerComposition({
        database,
        provider: createWorkerSentenceProvider(environment),
        onInvalidModelOutput: (event) => {
            console.warn('Sentence model output rejected.', event);
        },
        supportedFormats: [
            ...environment.supportedFormats,
            ...(environment.supportedFormats.includes('sentence-generation:v1')
                ? ['sentence-preparation:v1']
                : []),
            ...(environment.supportedFormats.includes('sentence-generation:v2')
                ? ['sentence-preparation:v2']
                : []),
        ].filter(
            (
                format,
            ): format is
                | 'sentence-generation:v1'
                | 'sentence-generation:v2'
                | 'sentence-preparation:v1'
                | 'sentence-preparation:v2'
                | 'sentence-check:v1' =>
                [
                    'sentence-generation:v1',
                    'sentence-generation:v2',
                    'sentence-preparation:v1',
                    'sentence-preparation:v2',
                    'sentence-check:v1',
                ].includes(format),
        ),
        clock: { now: () => new Date() },
        workerId,
        leaseMs: 30_000,
        heartbeatMs: 10_000,
        timeoutMs: 20_000,
        globalConcurrency: 10,
        learnerConcurrency: 1,
        maxAttempts: 3,
        retryDelayMs: 5_000,
    });
    const textsFormats = environment.supportedFormats.filter(
        (
            format,
        ): format is
            | 'text-detection:v1'
            | 'text-translation:v1'
            | 'text-translation:v2' =>
            format === 'text-detection:v1' ||
            format === 'text-translation:v1' ||
            format === 'text-translation:v2',
    );
    const textsWorker = textsFormats.length
        ? createTextsWorkerComposition({
              database,
              provider: createWorkerTextsProvider(environment),
              supportedFormats: textsFormats,
              clock: { now: () => new Date() },
              workerId,
              leaseMs: 30_000,
              heartbeatMs: 10_000,
              // Whole-text output needs a longer bounded attempt than a card.
              timeoutMs: 180_000,
              globalConcurrency: 10,
              userConcurrency: 1,
              maxAttempts: 3,
              retryDelayMs: 5_000,
          }).worker
        : undefined;
    const selectionEnabled = environment.supportedFormats.includes(
        'text-selection-card:v1',
    );
    const textsHmacSecret = process.env.DICTIONARY_HMAC_SECRET;
    if (
        selectionEnabled &&
        (!textsHmacSecret || Buffer.byteLength(textsHmacSecret, 'utf8') < 32)
    ) {
        throw new DictionaryWorkerConfigurationError(
            'Texts vocabulary execution requires the API DICTIONARY_HMAC_SECRET (at least 32 bytes).',
        );
    }
    const textsCryptography = selectionEnabled
        ? createTextsCryptography(textsHmacSecret!, { randomBytes })
        : undefined;
    const selectionWorker = selectionEnabled
        ? createTextSelectionWorkerComposition({
              database,
              generator: routedProviders.cardAuthoring,
              workerId,
              selectionPolicy: defaultTextAiAvailabilityPolicy(),
              globalConcurrency: 10,
              ownerConcurrency: 1,
              leaseMs: 30_000,
              verifyShare: (key, digest) =>
                  textsCryptography!.verifyShare(key, digest),
              proposal: (tx, input) =>
                  resolveTextTranslationProposal(tx, input),
          }).worker
        : undefined;
    const conversationEnabled =
        environment.supportedFormats.includes('conversation:v1') &&
        environment.providerFixtureMode !== 'deterministic';
    if (
        conversationEnabled &&
        (!textsHmacSecret || Buffer.byteLength(textsHmacSecret, 'utf8') < 32)
    )
        throw new DictionaryWorkerConfigurationError(
            'Conversation execution requires DICTIONARY_HMAC_SECRET (at least 32 bytes).',
        );
    const conversationWorker = conversationEnabled
        ? createConversationWorkerComposition({
              database,
              dictionaryHmacSecret: textsHmacSecret!,
              credentials: environment.providerCredentials,
          })
        : undefined;
    const observationWorkerId = `${environment.releaseSha}:${hostname().slice(0, 64)}`;
    const runtime = new DictionaryWorkerRuntime({
        concurrency: environment.concurrency,
        drainTimeoutMs: environment.drainTimeoutMs,
        includeProviderReadiness: environment.includeProviderReadiness,
        pollIntervalMs: environment.pollIntervalMs,
        readinessTimeoutMs: environment.readinessTimeoutMs,
        service: coordinatedService,
        sentenceService: sentenceWorker,
        ...(conversationWorker
            ? { conversationService: conversationWorker }
            : {}),
        ...(textsWorker ? { textsService: textsWorker } : {}),
        ...(selectionWorker ? { selectionService: selectionWorker } : {}),
        sentencePreparation,
        supportedFormats: environment.supportedFormats,
        workerId,
    });

    if (command === 'healthcheck') {
        try {
            await runtime.readiness();
        } finally {
            documentS3Client?.destroy();
            audioAdapters.close();
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
    await publishWorkerTextAiObservations(
        environment,
        database,
        observationWorkerId,
    );
    const observationTimer = setInterval(() => {
        void publishWorkerTextAiObservations(
            environment,
            database,
            observationWorkerId,
        ).catch(() => {
            process.stderr.write(
                'Dictionary AI readiness observation failed.\n',
            );
        });
    }, 60_000);
    observationTimer.unref();
    try {
        await runtime.run();
    } finally {
        clearInterval(observationTimer);
        process.removeListener('SIGINT', shutdown);
        process.removeListener('SIGTERM', shutdown);
        documentS3Client?.destroy();
        audioAdapters.close();
        await sql.end({ timeout: 5 });
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((error: unknown) => {
        process.stderr.write(
            error instanceof DictionaryWorkerConfigurationError
                ? `${error.message}\n`
                : 'Dictionary worker command failed.\n',
        );
        process.exitCode = 1;
    });
}
