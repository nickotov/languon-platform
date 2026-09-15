import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

import { serve } from '@hono/node-server';
import { S3Client } from '@aws-sdk/client-s3';

import { createApp } from './app';
import { loadEnvironment } from './config/environment';
import { createGracefulShutdown } from './infrastructure/server/graceful-shutdown';
import { createAdministrationComposition } from './modules/administration/infrastructure/administration-composition';
import { createAuthenticationComposition } from './modules/authentication/infrastructure/authentication-composition';
import { createDictionaryComposition } from './modules/dictionaries/infrastructure/dictionary-composition';
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
const deployed = environment.APP_ENV === 'staging' || environment.APP_ENV === 'production';
const journalEnvironment = deployed ? loadAccountDeletionJournalEnvironment(process.env, true) : undefined;
const deletionJournalClient = journalEnvironment ? new S3Client({
    credentials: { accessKeyId: journalEnvironment.accessKeyId, secretAccessKey: journalEnvironment.secretAccessKey },
    ...(journalEnvironment.endpoint ? { endpoint: journalEnvironment.endpoint } : {}),
    forcePathStyle: journalEnvironment.forcePathStyle,
    maxAttempts: 2,
    region: journalEnvironment.region,
    requestHandler: { requestTimeout: 5_000, connectionTimeout: 3_000 },
}) : undefined;
const deletionJournal = journalEnvironment && deletionJournalClient
    ? new S3AccountDeletionRecoveryJournal({ ...journalEnvironment, client: deletionJournalClient })
    : new InMemoryAccountDeletionRecoveryJournal();
const authentication = await createAuthenticationComposition(environment);
const administration = createAdministrationComposition(
    environment,
    authentication,
    deletionJournal,
);
const dictionaryDocumentS3Client =
    environment.DICTIONARY_DOCUMENT_LIFECYCLE_ENABLED &&
    environment.DICTIONARY_DOCUMENT_STORAGE
        ? createDictionaryDocumentS3Client(
              environment.DICTIONARY_DOCUMENT_STORAGE,
          )
        : undefined;
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
const app = createApp({
    administration,
    authentication: authentication.options,
    userProfiles: {
        accessTokens: authentication.productDependencies.accessTokens,
        authentication: authentication.productDependencies.authentication,
        policy: authentication.options.policy,
        profiles: new UserProfileService(new DrizzleUsersUnitOfWork(authentication.productDependencies.database)),
        deletions: new AccountDeletionService({
            authentication: authentication.productDependencies.authentication,
            clock: authentication.productDependencies.clock,
            journal: deletionJournal,
            preparation: new DrizzleOwnerDeletionPreparation(authentication.productDependencies.database),
            store: new DrizzleAccountDeletionStore(authentication.productDependencies.database),
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
