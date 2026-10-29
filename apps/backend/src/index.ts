import { createKnowledgeSentenceComposition } from './modules/knowledge/infrastructure/knowledge-sentence-composition';
import { eraseKnowledgeSentenceJobs } from './modules/knowledge/infrastructure/persistence/drizzle/knowledge-sentence-cleanup';
import { eraseKnowledgeTranslationJobs } from './modules/knowledge/infrastructure/persistence/drizzle/private-translation-lifecycle';
import { KnowledgePrivateTranslationService } from './modules/knowledge/application/private-translation-service';
import { DrizzleKnowledgePrivateTranslationStore } from './modules/knowledge/infrastructure/persistence/drizzle/private-translation-store';
import { createKnowledgePrivateTranslationRoutes } from './modules/knowledge/interface/http/private-translation-routes';
import { transcriptionCredentialFingerprint } from './modules/knowledge/infrastructure/transcription-credential-fingerprint';
import { createKnowledgeTranscriptionService } from './modules/knowledge/infrastructure/transcription-job-composition';
import { createKnowledgeTranscriptionJobRoutes } from './modules/knowledge/interface/http/transcription-job-routes';
import { TranscriptionAdminService } from './modules/knowledge/application/transcription-admin-service';
import { DrizzleTranscriptionAdminStore } from './modules/knowledge/infrastructure/persistence/drizzle/transcription-admin-store';
import { TranscriptionAdminProof } from './modules/knowledge/infrastructure/transcription-admin-proof';
import { createTranscriptionAdminRoutes } from './modules/knowledge/interface/http/transcription-admin-routes';
import { knowledgeTranscriptionExecutionReady } from './modules/knowledge/infrastructure/transcription-worker-readiness';
import { WorkbookService } from './modules/knowledge/application/workbook-service';
import { VocabularyPracticeService } from './modules/knowledge/application/vocabulary-practice-service';
import { DrizzleVocabularyPracticeStore } from './modules/knowledge/infrastructure/persistence/drizzle/vocabulary-practice-store';
import { createVocabularyPracticeRoutes } from './modules/knowledge/interface/http/vocabulary-practice-routes';
import { KnowledgeBlockCopyService } from './modules/knowledge/application/block-copy-service';
import { DrizzleKnowledgeBlockCopyStore } from './modules/knowledge/infrastructure/persistence/drizzle/block-copy-store';
import { createKnowledgeBlockCopyRoutes } from './modules/knowledge/interface/http/block-copy.routes';
import { createKnowledgeLibraryCopyComposition } from './modules/knowledge/infrastructure/library-copy-composition';
import { KnowledgeMediaService } from './modules/knowledge/application/media-service';
import { DrizzleKnowledgeMediaStore } from './modules/knowledge/infrastructure/persistence/drizzle/media-store';
import { verifyKnowledgeAudio } from './modules/knowledge/infrastructure/media-audio-validation';
import { createKnowledgeMediaRoutes } from './modules/knowledge/interface/http/media.routes';
import { LearnerService } from './modules/knowledge/application/learner-service';
import { DrizzleLearnerStore } from './modules/knowledge/infrastructure/persistence/drizzle/learner-store';
import { createLearnerRoutes } from './modules/knowledge/interface/http/learner-routes';
import { DrizzleWorkbookStore } from './modules/knowledge/infrastructure/persistence/drizzle/workbook-store';
import { KnowledgeShareCrypto } from './modules/knowledge/infrastructure/knowledge-share-crypto';
import { createWorkbookRoutes } from './modules/knowledge/interface/http/workbook.routes';
import { createAdminMcpTokenRoutes } from './modules/admin-mcp/interface/http/admin-mcp-token.routes';
import { AdminMcpCredentialService } from './modules/admin-mcp/application/admin-mcp-credential-service';
import { DrizzleAdminMcpStore } from './modules/admin-mcp/infrastructure/persistence/drizzle/drizzle-admin-mcp-store';
import { createAdminTextAiRoutingComposition } from './infrastructure/text-ai/admin-routing-composition';
import {
    loadTextAiProviderCredentials,
    loadTextAiProbeEnvironment,
    adminProbeFixtureEnabled,
} from './config/environment';
import { createLearnerAiCreditBalanceModule } from './modules/ai-credits/infrastructure/learner-ai-credit-balance-composition';
import { RedisGenerationBurstLimiter } from './modules/text-ai/infrastructure/generation-burst-limiter';
import { createLearnerPortraitModule } from './modules/learner-portraits/infrastructure/learner-portrait-composition';
import { createLearnerPortraitRoutes } from './modules/learner-portraits/interface/http/learner-portrait.routes';
import { readApprovedPortraitForConversation } from './modules/learner-portraits/infrastructure/persistence/drizzle/drizzle-portrait-store';
import { createKnowledgeService } from './modules/knowledge/infrastructure/knowledge-composition';
import { createNavigationService } from './modules/navigation/infrastructure/navigation-composition';
import { createNavigationRoutes } from './modules/navigation/interface/http/navigation.routes';
import { createKnowledgeRoutes } from './modules/knowledge/interface/http/knowledge.routes';
import { KnowledgeDomainError } from './modules/knowledge/domain/knowledge';
import { createConversationsComposition } from './modules/conversations/infrastructure/conversations-composition';
import {
    conversationAdmission,
    settleInterruptedConversationCalls,
} from './modules/conversations/infrastructure/conversation-accounting';
import {
    conversationDeletionBusy,
    eraseConversationSource,
} from './modules/conversations/infrastructure/persistence/drizzle/conversation-deletion-participant';
import { createTextsContentComposition } from './modules/texts/infrastructure/texts-composition';
import { createTextsAiComposition } from './modules/texts/infrastructure/texts-ai-composition';
import { createTextsJobRoutes } from './modules/texts/interface/http/texts-job.routes';
import {
    loadTextTranslationProposal,
    resolveTextTranslationProposal,
} from './modules/texts/infrastructure/persistence/drizzle/texts-job-support';
import { createTextSelectionApiModule } from './modules/dictionaries/infrastructure/text-selection-composition';
import { createTextSelectionRoutes } from './modules/dictionaries/interface/http/text-selection.routes';
import { BoundedDictionaryRateLimiter } from './modules/dictionaries/infrastructure/rate-limit/bounded-dictionary-rate-limiter';
import { textsAiAdmissionsEnabled } from './modules/text-ai/infrastructure/text-ai-composition';
import { defaultTextAiAvailabilityPolicy } from './modules/text-ai/infrastructure/persistence/drizzle/text-ai-catalog-query';
import { DrizzleTextAiAdmissionParticipant } from './modules/text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant';
import { DrizzleSentenceLibraryStore } from './modules/learning/infrastructure/persistence/drizzle/drizzle-sentence-library-store';
import { createSentenceLibraryAdministrationHooks } from './modules/administration/infrastructure/sentence-library-administration-hooks';
import { createSentenceComposition } from './modules/learning/infrastructure/sentence-composition';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

import { serve } from '@hono/node-server';
import { S3Client } from '@aws-sdk/client-s3';

import { createApp } from './app';
import { createSpeechInfrastructure } from './modules/speech/infrastructure/composition';
import {
    createSpeechRoutes,
    createAdminSpeechRoutes,
} from './modules/speech/interface/http/speech.routes';
import { createModelPriceRoutes } from './modules/ai-credits/interface/http/model-prices.routes';
import { createCapabilityPolicyRoutes } from './modules/ai-credits/interface/http/capability-policies.routes';
import { createAccountingRoutes } from './modules/ai-credits/interface/http/accounting.routes';
import { createProviderPriceRoutes } from './modules/ai-credits/interface/http/provider-prices.routes';
import { DrizzleProviderPriceStore } from './modules/ai-credits/infrastructure/persistence/drizzle/drizzle-provider-prices';
import { startAccountingReportWorker } from './modules/ai-credits/infrastructure/accounting-report-worker';
import {
    maintainTextAiAccounting,
    startAccountingMaintenance,
} from './infrastructure/text-ai/accounting-maintenance';
import { createPostgresClient, createDrizzleDatabase } from '@languon/database';
import { databaseSchema } from './infrastructure/database/schema';
import { DrizzleAccountingStore } from './modules/ai-credits/infrastructure/persistence/drizzle/drizzle-accounting-store';
import { DrizzleAiCreditTransactionParticipant } from './modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { loadEnvironment } from './config/environment';
import { createGracefulShutdown } from './infrastructure/server/graceful-shutdown';
import { createAdministrationComposition } from './modules/administration/infrastructure/administration-composition';
import { createAuthenticationComposition } from './modules/authentication/infrastructure/authentication-composition';
import { createDictionaryComposition } from './modules/dictionaries/infrastructure/dictionary-composition';
import { createLearningComposition } from './modules/learning/infrastructure/learning-composition';
import { createTextAiModule } from './modules/text-ai/infrastructure/text-ai-composition';
import { createDictionaryAudioAdapters } from './modules/speech/infrastructure/audio/dictionary-audio-adapters';
import { loadDictionaryAudioEnvironment } from './config/environment';
import { createDictionaryDocumentS3Client } from './modules/dictionaries/infrastructure/document/s3-document-client';
import { S3DictionaryDocumentUploadStorage } from './modules/dictionaries/infrastructure/document/s3-dictionary-document-storage';
import { UserProfileService } from './modules/users/application/user-profile-service';
import { DrizzleUsersUnitOfWork } from './modules/users/infrastructure/persistence/drizzle/drizzle-users-unit-of-work';
import { AccountDeletionService } from './modules/users/application/account-deletion-service';
import { DrizzleAccountDeletionStore } from './modules/users/infrastructure/persistence/drizzle/drizzle-account-deletion-store';
import { DrizzleOwnerDeletionPreparation } from './modules/users/infrastructure/persistence/drizzle/drizzle-owner-deletion-preparation';
import { loadAccountDeletionJournalEnvironment } from './config/environment';
import { InMemoryAccountDeletionRecoveryJournal } from './modules/users/infrastructure/recovery/in-memory-account-deletion-recovery-journal';
import { S3AccountDeletionRecoveryJournal } from './modules/users/infrastructure/recovery/s3-account-deletion-recovery-journal';

const localEnvironmentFile = new URL('../../../.env.local', import.meta.url);

if (existsSync(localEnvironmentFile)) {
    loadEnvFile(localEnvironmentFile);
}

const environment = loadEnvironment();
const deployed =
    environment.APP_ENV === 'staging' || environment.APP_ENV === 'production';
const journalEnvironment = deployed
    ? loadAccountDeletionJournalEnvironment(process.env, true)
    : undefined;
const deletionJournalClient = journalEnvironment
    ? new S3Client({
          credentials: {
              accessKeyId: journalEnvironment.accessKeyId,
              secretAccessKey: journalEnvironment.secretAccessKey,
          },
          ...(journalEnvironment.endpoint
              ? { endpoint: journalEnvironment.endpoint }
              : {}),
          forcePathStyle: journalEnvironment.forcePathStyle,
          maxAttempts: 2,
          region: journalEnvironment.region,
          requestHandler: { requestTimeout: 5_000, connectionTimeout: 3_000 },
      })
    : undefined;
const deletionJournal =
    journalEnvironment && deletionJournalClient
        ? new S3AccountDeletionRecoveryJournal({
              ...journalEnvironment,
              client: deletionJournalClient,
          })
        : new InMemoryAccountDeletionRecoveryJournal();
const authentication = await createAuthenticationComposition(environment);
const generationBurstLimiter = new RedisGenerationBurstLimiter(
    authentication.productDependencies.rateLimiter,
);
const accountingReportingClient = createPostgresClient({
    databaseUrl: environment.DATABASE_URL,
    maxConnections: 1,
});
const accountingReportingStore = new DrizzleAccountingStore(
    createDrizzleDatabase(accountingReportingClient, databaseSchema),
    (tx) => new DrizzleAiCreditTransactionParticipant(tx),
);
const accountingMaintenanceClient = createPostgresClient({
    databaseUrl: environment.DATABASE_URL,
    maxConnections: 1,
});
const accountingMaintenanceDatabase = createDrizzleDatabase(
    accountingMaintenanceClient,
    databaseSchema,
);
const administration = createAdministrationComposition(
    environment,
    authentication,
    deletionJournal,
    new DrizzleSentenceLibraryStore(
        authentication.productDependencies.database,
        createSentenceLibraryAdministrationHooks(),
    ),
);
const textAiProbeEnvironment = loadTextAiProbeEnvironment(process.env);
const syntheticAdminProbes = adminProbeFixtureEnabled(process.env);
const textAiRouting = createAdminTextAiRoutingComposition({
    database: authentication.productDependencies.database,
    administration: administration.administration,
    policy: administration.policy,
    credentials: loadTextAiProviderCredentials(process.env),
    ...textAiProbeEnvironment,
    syntheticFixture: syntheticAdminProbes,
    limits: syntheticAdminProbes
        ? { ...textAiProbeEnvironment.limits, cooldownSeconds: 0 }
        : textAiProbeEnvironment.limits,
});
administration.textAiProbes = textAiRouting.probes;
const dictionaryDocumentS3Client =
    environment.DICTIONARY_DOCUMENT_LIFECYCLE_ENABLED &&
    environment.DICTIONARY_DOCUMENT_STORAGE
        ? createDictionaryDocumentS3Client(
              environment.DICTIONARY_DOCUMENT_STORAGE,
          )
        : undefined;
const audioEnvironment = loadDictionaryAudioEnvironment(process.env, {
    deployed,
    role: 'api',
});

if (
    ['staging', 'production'].includes(environment.APP_ENV) &&
    environment.SPEECH_GENERATION_ENABLED &&
    (!process.env.SPEECH_API_ENQUEUED_VERSIONS?.split(',').includes('1') ||
        !process.env.SPEECH_WORKER_PROCESSABLE_VERSIONS?.split(',').includes(
            '1',
        ) ||
        !process.env.AI_MODEL_PRICE_API_ADMITTED_VERSIONS?.split(',').includes(
            '1',
        ) ||
        !process.env.AI_MODEL_PRICE_WORKER_PROCESSABLE_VERSIONS?.split(
            ',',
        ).includes('1'))
) {
    throw new Error(
        'Shared speech requires release-compatible admission and pricing revisions.',
    );
}
const audioAdapters = createDictionaryAudioAdapters({
    role: 'api',
    environment: audioEnvironment,
    database: authentication.productDependencies.database,
});
const speech = createSpeechInfrastructure({
    burstLimiter: generationBurstLimiter,
    database: authentication.productDependencies.database,
    dictionaryHmacSecret: environment.DICTIONARY_HMAC_SECRET,
    environment: audioEnvironment,
    storage: audioAdapters.storage,
    provider: audioAdapters.provider,
    providers: audioAdapters.providers,
    playbackEnabled: environment.SPEECH_PLAYBACK_ENABLED,
    generationEnabled: environment.SPEECH_GENERATION_ENABLED,
});
const dictionaries = createDictionaryComposition({
    ...authentication.productDependencies,
    generation: {
        acceptableFormats: environment.DICTIONARY_JOB_API_ACCEPTABLE_FORMATS,
        cancellableFormats: environment.DICTIONARY_JOB_API_CANCELLABLE_FORMATS,
        discardableFormats: environment.DICTIONARY_JOB_API_DISCARDABLE_FORMATS,
        enqueuedFormats: environment.DICTIONARY_JOB_API_ENQUEUED_FORMATS,
        readableFormats: environment.DICTIONARY_JOB_API_READABLE_FORMATS,
        documentOcrAvailable:
            environment.DICTIONARY_DOCUMENT_UPLOAD_AUTHORIZATION_ENABLED &&
            environment.DICTIONARY_DOCUMENT_OCR_MODE === 'deterministic',
    },
    generationProviderBudget: environment.DICTIONARY_GENERATION_PROVIDER_BUDGET,
    aiCreditEnforcementEnabled:
        environment.DICTIONARY_AI_CREDIT_ENFORCEMENT_ENABLED,
    dictionaryHmacSecret: environment.DICTIONARY_HMAC_SECRET,
    documentUploadAuthorizationEnabled:
        environment.DICTIONARY_DOCUMENT_UPLOAD_AUTHORIZATION_ENABLED,
    policy: authentication.options.policy,
    ...(dictionaryDocumentS3Client && environment.DICTIONARY_DOCUMENT_STORAGE
        ? {
              documentUploadStorage: new S3DictionaryDocumentUploadStorage({
                  bucket: environment.DICTIONARY_DOCUMENT_STORAGE.bucket,
                  client: dictionaryDocumentS3Client,
              }),
          }
        : {}),
});
let shuttingDown = false;
const learning = createLearningComposition({
    ...authentication.productDependencies,
    dictionaryHmacSecret: environment.DICTIONARY_HMAC_SECRET,
    enabled: environment.LEARNING_FLASHCARDS_ENABLED,
    policy: authentication.options.policy,
});
const authenticateTextActor = async (token: string) => {
    const claims =
        await authentication.productDependencies.accessTokens.verify(token);
    await authentication.productDependencies.authentication.requireActiveSession(
        {
            userId: claims.userId,
            sessionId: claims.sessionId,
        },
    );
    return { userId: claims.userId, sessionId: claims.sessionId };
};
const textsEnabled = textsAiAdmissionsEnabled(process.env);
const navigation = createNavigationRoutes({
    service: createNavigationService({
        database: authentication.productDependencies.database,
        authenticate: authenticateTextActor,
        rateLimiter: authentication.productDependencies.rateLimiter,
    }),
    policy: authentication.options.policy,
});
const textsSelectionPolicy = defaultTextAiAvailabilityPolicy();
const texts = createTextsContentComposition({
    ...authentication.productDependencies,
    dictionaryHmacSecret: environment.DICTIONARY_HMAC_SECRET,
    policy: authentication.options.policy,
    loadProposal: loadTextTranslationProposal,
});
const textsAi = createTextsAiComposition({
    burstLimiter: generationBurstLimiter,
    database: authentication.productDependencies.database,
    enabled: textsEnabled,
    fingerprintSecret: environment.DICTIONARY_HMAC_SECRET,
    authenticate: authenticateTextActor,
    clock: authentication.productDependencies.clock,
    budget: environment.DICTIONARY_GENERATION_PROVIDER_BUDGET,
    admissionParticipant: (tx) =>
        new DrizzleTextAiAdmissionParticipant(tx, textsSelectionPolicy),
});
const textSelections = createTextSelectionApiModule({
    database: authentication.productDependencies.database,
    authentication: { authenticate: authenticateTextActor },
    admissionsEnabled: textsEnabled,
    selectionPolicy: textsSelectionPolicy,
    globalConcurrency: 10,
    ownerConcurrency: 1,
    leaseMs: 30_000,
    verifyShare: (key, digest) => texts.cryptography.verifyShare(key, digest),
    proposal: resolveTextTranslationProposal,
});
const knowledge = createKnowledgeService({
    database: authentication.productDependencies.database,
    shareSecret: environment.DICTIONARY_HMAC_SECRET,
    limits: {
        referenceChars: environment.KNOWLEDGE_REFERENCE_CHAR_LIMIT,
        editorChars: environment.KNOWLEDGE_EDITOR_CONTEXT_CHAR_LIMIT,
    },
    authenticate: authenticateTextActor,
    rateLimiter: authentication.productDependencies.rateLimiter,
    lifecycle: {
        async beforeNoteDeletion(tx, { noteId, now }) {
            if (
                await conversationDeletionBusy(
                    tx,
                    { sourceKind: 'knowledge', sourceIds: [noteId] },
                    now,
                )
            )
                throw new KnowledgeDomainError(
                    'deletion_busy',
                    'Stop the active conversation before deleting this note.',
                );
            await eraseConversationSource(tx, 'knowledge', noteId, now);
            await eraseKnowledgeTranslationJobs(tx, noteId, now);
            await eraseKnowledgeSentenceJobs(tx, noteId, now);
        },
    },
});
const learnerPortraits = createLearnerPortraitModule({
    database: authentication.productDependencies.database,
    selectionPolicy: textsSelectionPolicy,
});
const conversations = createConversationsComposition({
    ...authentication.productDependencies,
    dictionaryHmacSecret: environment.DICTIONARY_HMAC_SECRET,
    workspaceContextLimits: {
        editorCharacters: environment.KNOWLEDGE_EDITOR_CONTEXT_CHAR_LIMIT,
        referenceCharacters: environment.KNOWLEDGE_REFERENCE_CHAR_LIMIT,
    },
    policy: authentication.options.policy,
    admitTurn: conversationAdmission(textsSelectionPolicy),
    readPortrait: readApprovedPortraitForConversation,
    settleInterrupted: settleInterruptedConversationCalls,
});
const app = createApp({
    adminMcpTokens: createAdminMcpTokenRoutes({
        appEnvironment: environment.APP_ENV,
        administration: administration.administration,
        policy: administration.policy,
        credentials: new AdminMcpCredentialService(
            new DrizzleAdminMcpStore(
                authentication.productDependencies.database,
            ),
        ),
    }),
    learnerPortraits: createLearnerPortraitRoutes({
        portraits: learnerPortraits.portraits,
        interviews: learnerPortraits.interviews,
        readChargingPolicy: learnerPortraits.readChargingPolicy,
        authenticate: authenticateTextActor,
        rateLimiter: authentication.productDependencies.rateLimiter,
        policy: authentication.options.policy,
    }),
    navigation,
    conversations: conversations.routes,
    workbooks: createWorkbookRoutes({
        service: new WorkbookService({
            store: new DrizzleWorkbookStore(
                authentication.productDependencies.database,
                new KnowledgeShareCrypto(environment.DICTIONARY_HMAC_SECRET),
            ),
            authenticate: authenticateTextActor,
            rateLimiter: authentication.productDependencies.rateLimiter,
        }),
        policy: authentication.options.policy,
    }),
    knowledgePrivateTranslations: createKnowledgePrivateTranslationRoutes({
        service: new KnowledgePrivateTranslationService({
            store: new DrizzleKnowledgePrivateTranslationStore({
                database: authentication.productDependencies.database,
                crypto: new KnowledgeShareCrypto(
                    environment.DICTIONARY_HMAC_SECRET,
                ),
                jobs: textsAi.store,
                enabled: textsEnabled,
            }),
            authenticate: authenticateTextActor,
            rateLimiter: authentication.productDependencies.rateLimiter,
            burstLimiter: generationBurstLimiter,
        }),
        policy: authentication.options.policy,
    }),
    knowledgeSentences: createKnowledgeSentenceComposition({
        database: authentication.productDependencies.database,
        secret: environment.DICTIONARY_HMAC_SECRET,
        enabled: environment.LEARNING_SENTENCES_ENABLED,
        generationFormat: environment.LEARNING_SENTENCE_GENERATION_FORMAT,
        authenticate: authenticateTextActor,
        rateLimiter: authentication.productDependencies.rateLimiter,
        policy: authentication.options.policy,
    }).routes,
    knowledgeVocabulary: createVocabularyPracticeRoutes({
        service: new VocabularyPracticeService({
            store: new DrizzleVocabularyPracticeStore(
                authentication.productDependencies.database,
                new KnowledgeShareCrypto(environment.DICTIONARY_HMAC_SECRET),
            ),
            authenticate: authenticateTextActor,
            rateLimiter: authentication.productDependencies.rateLimiter,
            enabled: environment.LEARNING_FLASHCARDS_ENABLED,
        }),
        policy: authentication.options.policy,
    }),
    knowledgeBlockCopy: createKnowledgeBlockCopyRoutes({
        service: new KnowledgeBlockCopyService({
            store: new DrizzleKnowledgeBlockCopyStore(
                authentication.productDependencies.database,
                new KnowledgeShareCrypto(environment.DICTIONARY_HMAC_SECRET),
            ),
            authenticate: authenticateTextActor,
            rateLimiter: authentication.productDependencies.rateLimiter,
        }),
        policy: authentication.options.policy,
    }),
    knowledgeLibrary: createKnowledgeLibraryCopyComposition({
        ...authentication.productDependencies,
        dictionaryHmacSecret: environment.DICTIONARY_HMAC_SECRET,
        shareSecret: environment.DICTIONARY_HMAC_SECRET,
        authenticate: authenticateTextActor,
        policy: authentication.options.policy,
    }).routes,
    knowledgeMedia: createKnowledgeMediaRoutes({
        service: new KnowledgeMediaService({
            store: new DrizzleKnowledgeMediaStore(
                authentication.productDependencies.database,
                new KnowledgeShareCrypto(environment.DICTIONARY_HMAC_SECRET),
            ),
            authenticate: authenticateTextActor,
            rateLimiter: authentication.productDependencies.rateLimiter,
            verify: verifyKnowledgeAudio,
            readSpeech: (actorId, playbackId, signal) =>
                speech.service.content(actorId, playbackId, signal),
        }),
        policy: authentication.options.policy,
    }),
    workbookLearning: createLearnerRoutes({
        service: new LearnerService({
            store: new DrizzleLearnerStore(
                authentication.productDependencies.database,
                new KnowledgeShareCrypto(environment.DICTIONARY_HMAC_SECRET),
            ),
            authenticate: authenticateTextActor,
            rateLimiter: authentication.productDependencies.rateLimiter,
        }),
        policy: authentication.options.policy,
    }),
    knowledgeTranscription: createKnowledgeTranscriptionJobRoutes({
        service: createKnowledgeTranscriptionService({
            database: authentication.productDependencies.database,
            ...(environment.OPENAI_API_KEY
                ? { apiKey: environment.OPENAI_API_KEY }
                : {}),
            authenticate: authenticateTextActor,
            rateLimiter: authentication.productDependencies.rateLimiter,
        }),
        policy: authentication.options.policy,
    }),
    transcriptionAdministration: createTranscriptionAdminRoutes({
        administration: administration.administration,
        policy: authentication.options.policy,
        service: new TranscriptionAdminService(
            new DrizzleTranscriptionAdminStore(
                authentication.productDependencies.database,
                async () => ({
                    credentialsConfigured: !!environment.OPENAI_API_KEY,
                    credentialFingerprint: transcriptionCredentialFingerprint(
                        environment.OPENAI_API_KEY,
                    ),
                    executionReady:
                        !!environment.OPENAI_API_KEY &&
                        (await knowledgeTranscriptionExecutionReady(
                            authentication.productDependencies.database,
                        )),
                }),
            ),
            new TranscriptionAdminProof(
                environment.DICTIONARY_HMAC_SECRET,
                () =>
                    transcriptionCredentialFingerprint(
                        environment.OPENAI_API_KEY,
                    ),
            ),
        ),
    }),
    knowledge: createKnowledgeRoutes({
        service: knowledge,
        policy: authentication.options.policy,
    }),
    texts: texts.routes,
    textsAi: createTextsJobRoutes({
        service: textsAi.service,
        policy: authentication.options.policy,
    }),
    textSelections: createTextSelectionRoutes({
        service: textSelections.service,
        policy: authentication.options.policy,
        rateLimiter: new BoundedDictionaryRateLimiter(
            authentication.productDependencies.rateLimiter,
        ),
    }),
    textAiRouting: textAiRouting.routes,
    textAi: createTextAiModule({
        ...authentication.productDependencies,
        policy: authentication.options.policy,
    }).routes,
    learnerAiCredits: createLearnerAiCreditBalanceModule({
        ...authentication.productDependencies,
        policy: authentication.options.policy,
    }).routes,
    learning: learning.routes,
    sentenceLearning: createSentenceComposition({
        ...authentication.productDependencies,
        dictionaryHmacSecret: environment.DICTIONARY_HMAC_SECRET,
        enabled: environment.LEARNING_SENTENCES_ENABLED,
        admission: {
            generationFormat: environment.LEARNING_SENTENCE_GENERATION_FORMAT,
        },
        policy: authentication.options.policy,
    }).routes,
    administration,
    speech: createSpeechRoutes({
        service: speech.service,
        policy: authentication.options.policy,
        authenticate: async (accessToken) => {
            const claims =
                await authentication.productDependencies.accessTokens.verify(
                    accessToken,
                );
            await authentication.productDependencies.authentication.requireActiveSession(
                { sessionId: claims.sessionId, userId: claims.userId },
            );
            return claims.userId;
        },
    }).route(
        '/',
        createAdminSpeechRoutes({
            store: speech.store,
            storage: audioAdapters.storage,
            administration: administration.administration,
            policy: authentication.options.policy,
        }),
    ),
    modelPrices: createModelPriceRoutes({
        database: authentication.productDependencies.database,
        administration: administration.administration,
        policy: authentication.options.policy,
        publishingEnabled:
            !deployed ||
            process.env.AI_MODEL_PRICE_API_ADMITTED_VERSIONS?.split(
                ',',
            ).includes('1') === true,
    })
        .route(
            '/',
            createCapabilityPolicyRoutes({
                database: authentication.productDependencies.database,
                administration: administration.administration,
                policy: authentication.options.policy,
            }),
        )
        .route(
            '/',
            createAccountingRoutes({
                store: new DrizzleAccountingStore(
                    authentication.productDependencies.database,
                    (tx) => new DrizzleAiCreditTransactionParticipant(tx),
                ),
                administration: administration.administration,
                policy: authentication.options.policy,
            }),
        )
        .route(
            '/',
            createProviderPriceRoutes({
                store: new DrizzleProviderPriceStore(
                    authentication.productDependencies.database,
                ),
                administration: administration.administration,
                policy: authentication.options.policy,
            }),
        ),
    authentication: authentication.options,
    userProfiles: {
        accessTokens: authentication.productDependencies.accessTokens,
        authentication: authentication.productDependencies.authentication,
        policy: authentication.options.policy,
        profiles: new UserProfileService(
            new DrizzleUsersUnitOfWork(
                authentication.productDependencies.database,
            ),
        ),
        deletions: new AccountDeletionService({
            authentication: authentication.productDependencies.authentication,
            clock: authentication.productDependencies.clock,
            journal: deletionJournal,
            preparation: new DrizzleOwnerDeletionPreparation(
                authentication.productDependencies.database,
            ),
            store: new DrizzleAccountDeletionStore(
                authentication.productDependencies.database,
            ),
        }),
    },
    dictionaries: dictionaries.routes,
    operational: {
        isShuttingDown: () => shuttingDown,
        readiness: authentication.readiness,
        releaseSha: environment.RELEASE_SHA,
    },
});
const server = serve(
    {
        fetch: app.fetch,
        hostname: environment.BACKEND_HOST,
        port: environment.BACKEND_PORT,
    },
    ({ port }) => {
        console.log(
            `Languon backend listening on http://${environment.BACKEND_HOST}:${port}`,
        );
    },
);
const accountingReportWorker = startAccountingReportWorker({
    refreshNextReport: () => accountingReportingStore.refreshNextReport(),
    // Never log driver exceptions: these can include monetary/personal records.
    onError: () =>
        console.error('Accounting report refresh failed; retry scheduled.'),
});
let lastAccountingMaintenanceWarning = 0;
const accountingMaintenance = startAccountingMaintenance({
    maintain: async () => {
        await maintainTextAiAccounting(accountingMaintenanceDatabase);
        await conversations.store.maintainAccounting();
    },
    onError: () => {
        if (Date.now() - lastAccountingMaintenanceWarning > 60_000) {
            lastAccountingMaintenanceWarning = Date.now();
            console.error('Accounting maintenance deferred; retry scheduled.');
        }
    },
});

const performShutdown = createGracefulShutdown({
    closeResources: async () => {
        await accountingReportWorker.stop();
        await accountingMaintenance.stop();
        await accountingMaintenanceClient.end();
        await accountingReportingClient.end();
        audioAdapters.close();
        dictionaryDocumentS3Client?.destroy();
        deletionJournalClient?.destroy();
        await authentication.close();
    },
    onDeadline: () => {
        process.exitCode = 1;
    },
    onError: (error) => {
        console.error(error);
        process.exitCode = 1;
    },
    server,
    timeoutMs: environment.SHUTDOWN_TIMEOUT_MS,
});

function shutdown(signal: string): void {
    shuttingDown = true;
    performShutdown(signal);
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
