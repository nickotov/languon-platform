import { createKnowledgeService } from './modules/knowledge/infrastructure/knowledge-composition';
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
import { loadEnvironment } from './config/environment';
import { createGracefulShutdown } from './infrastructure/server/graceful-shutdown';
import { createAdministrationComposition } from './modules/administration/infrastructure/administration-composition';
import { createAuthenticationComposition } from './modules/authentication/infrastructure/authentication-composition';
import { createDictionaryComposition } from './modules/dictionaries/infrastructure/dictionary-composition';
import { createLearningComposition } from './modules/learning/infrastructure/learning-composition';
import { createTextAiModule } from './modules/text-ai/infrastructure/text-ai-composition';
import { createDictionaryAudioAdapters } from './modules/speech/infrastructure/audio/dictionary-audio-adapters';
import { loadDictionaryAudioEnvironment } from './modules/speech/infrastructure/audio/dictionary-audio-environment';
import { createDictionaryDocumentS3Client } from './modules/dictionaries/infrastructure/document/s3-document-client';
import { S3DictionaryDocumentUploadStorage } from './modules/dictionaries/infrastructure/document/s3-dictionary-document-storage';
import { UserProfileService } from './modules/users/application/user-profile-service';
import { DrizzleUsersUnitOfWork } from './modules/users/infrastructure/persistence/drizzle/drizzle-users-unit-of-work';
import { AccountDeletionService } from './modules/users/application/account-deletion-service';
import { DrizzleAccountDeletionStore } from './modules/users/infrastructure/persistence/drizzle/drizzle-account-deletion-store';
import { DrizzleOwnerDeletionPreparation } from './modules/users/infrastructure/persistence/drizzle/drizzle-owner-deletion-preparation';
import { loadAccountDeletionJournalEnvironment } from './modules/users/infrastructure/recovery/account-deletion-journal-environment';
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
const administration = createAdministrationComposition(
    environment,
    authentication,
    deletionJournal,
    new DrizzleSentenceLibraryStore(
        authentication.productDependencies.database,
        createSentenceLibraryAdministrationHooks(),
    ),
);
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
const textsSelectionPolicy = defaultTextAiAvailabilityPolicy();
const texts = createTextsContentComposition({
    ...authentication.productDependencies,
    dictionaryHmacSecret: environment.DICTIONARY_HMAC_SECRET,
    policy: authentication.options.policy,
    loadProposal: loadTextTranslationProposal,
});
const textsAi = createTextsAiComposition({
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
        },
    },
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
    settleInterrupted: settleInterruptedConversationCalls,
});
const app = createApp({
    conversations: conversations.routes,
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
    textAi: createTextAiModule({
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
    }),
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

const performShutdown = createGracefulShutdown({
    closeResources: async () => {
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
