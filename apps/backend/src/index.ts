import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

import { serve } from '@hono/node-server';

import { createApp } from './app';
import { loadEnvironment } from './config/environment';
import { createGracefulShutdown } from './infrastructure/server/graceful-shutdown';
import { createAdministrationComposition } from './modules/administration/infrastructure/administration-composition';
import { createAuthenticationComposition } from './modules/authentication/infrastructure/authentication-composition';
import { createDictionaryComposition } from './modules/dictionaries/infrastructure/dictionary-composition';
import { createDictionaryDocumentS3Client } from './modules/dictionaries/infrastructure/document/s3-document-client';
import { S3DictionaryDocumentUploadStorage } from './modules/dictionaries/infrastructure/document/s3-dictionary-document-storage';

const localEnvironmentFile = new URL('../../../.env.local', import.meta.url);

if (existsSync(localEnvironmentFile)) {
    loadEnvFile(localEnvironmentFile);
}

const environment = loadEnvironment();
const authentication = await createAuthenticationComposition(environment);
const administration = createAdministrationComposition(
    environment,
    authentication,
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
