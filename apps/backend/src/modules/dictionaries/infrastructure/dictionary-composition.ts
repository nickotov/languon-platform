import type { PostgresJsDatabase } from '@languon/database';
import {
    DictionaryAudioService,
    type DictionaryAudioDependencies,
} from '../application/dictionary-audio-service';
import { createDictionaryAudioRoutes } from '../interface/http/dictionary-audio.routes';
import type { OpenAPIHono } from '@hono/zod-openapi';

import type { databaseSchema } from '../../../infrastructure/database/schema';
import type { AccessTokenSigner } from '../../authentication/application/ports/access-token';
import type { AuthenticationService } from '../../authentication/application/authentication-service';
import type { AuthHttpPolicy } from '../../authentication/interface/http/auth-http-policy';
import type { DictionaryClock } from '../application/dictionary-service';
import type { DictionaryGenerationProviderBudgetPolicy } from '../application/ports/dictionary-generation-provider-policy';
import type { DictionaryDocumentUploadStorage } from '../application/ports/dictionary-document-upload-storage';
import { DictionaryDocumentService } from '../application/dictionary-document-service';
import { DictionaryService } from '../application/dictionary-service';
import {
    DictionaryGenerationService,
    type DictionaryGenerationApiCapabilities,
} from '../application/dictionary-generation-service';
import type { RateLimiter } from '../../authentication/application/ports/rate-limiter';
import { createDictionaryRoutes } from '../interface/http/dictionary.routes';
import { createDictionaryGenerationRoutes } from '../interface/http/dictionary-generation.routes';
import { createDictionaryDocumentRoutes } from '../interface/http/dictionary-document.routes';
import { DrizzleDictionaryGenerationStore } from './persistence/drizzle/drizzle-dictionary-generation-store';
import { DrizzleDictionaryDocumentStore } from './persistence/drizzle/drizzle-dictionary-document-store';
import {
    HmacDictionaryCryptography,
    type DictionaryEntropySource,
} from './crypto/dictionary-cryptography';
import {
    DrizzleDictionaryStore,
    type DictionaryIdGenerator,
} from './persistence/drizzle/drizzle-dictionary-store';
import { BoundedDictionaryRateLimiter } from './rate-limit/bounded-dictionary-rate-limiter';
import { dictionaryImportPairsGenerationFormat } from '../domain/generation';

export interface DictionaryCompositionDependencies {
    audio?: Omit<
        DictionaryAudioDependencies,
        'authentication' | 'dictionaries' | 'clock' | 'rateLimiter'
    >;
    accessTokens: AccessTokenSigner;
    authentication: Pick<AuthenticationService, 'requireActiveSession'>;
    clock: DictionaryClock;
    database: PostgresJsDatabase<typeof databaseSchema>;
    entropy: DictionaryEntropySource;
    dictionaryHmacSecret: string | Uint8Array;
    ids: DictionaryIdGenerator;
    generation?: DictionaryGenerationApiCapabilities;
    generationProviderBudget?: DictionaryGenerationProviderBudgetPolicy;
    aiCreditEnforcementEnabled?: boolean;
    documentUploadStorage?: DictionaryDocumentUploadStorage;
    documentUploadAuthorizationEnabled?: boolean;
    rateLimiter: RateLimiter;
    policy: AuthHttpPolicy;
}

export interface DictionaryComposition {
    audioService: DictionaryAudioService | undefined;
    routes: OpenAPIHono;
    generationService: DictionaryGenerationService;
    documentService: DictionaryDocumentService | undefined;
    service: DictionaryService;
}

export function createDictionaryComposition(
    dependencies: DictionaryCompositionDependencies,
): DictionaryComposition {
    const authentication = {
        authenticate: async (accessToken: string) => {
            const claims = await dependencies.accessTokens.verify(accessToken);
            await dependencies.authentication.requireActiveSession({
                sessionId: claims.sessionId,
                userId: claims.userId,
            });
            return { sessionId: claims.sessionId, userId: claims.userId };
        },
    };
    const cryptography = new HmacDictionaryCryptography({
        entropy: dependencies.entropy,
        secret: dependencies.dictionaryHmacSecret,
    });
    const dictionaryRateLimiter = new BoundedDictionaryRateLimiter(
        dependencies.rateLimiter,
    );
    const generationStore = new DrizzleDictionaryGenerationStore(
        dependencies.database,
        dependencies.ids,
        dependencies.generationProviderBudget,
        dependencies.aiCreditEnforcementEnabled ?? false,
    );
    const dictionaryStore = new DrizzleDictionaryStore(
        dependencies.database,
        dependencies.ids,
    );
    const audioService = dependencies.audio
        ? new DictionaryAudioService({
              ...dependencies.audio,
              rateLimiter: dictionaryRateLimiter,
              authentication,
              dictionaries: dictionaryStore,
              clock: dependencies.clock,
          })
        : undefined;
    const service = new DictionaryService({
        authentication,
        clock: dependencies.clock,
        cryptography,
        ...(dependencies.generation?.enqueuedFormats.includes(
            dictionaryImportPairsGenerationFormat,
        )
            ? { generationStore }
            : {}),
        rateLimiter: dictionaryRateLimiter,
        store: dictionaryStore,
    });
    const generationService = new DictionaryGenerationService({
        ...(dependencies.audio
            ? {
                  pronunciationAudio: {
                      playbackAvailable: dependencies.audio.playbackEnabled,
                      generationAvailable: dependencies.audio.generationEnabled,
                  },
              }
            : {}),
        authentication,
        capabilities: dependencies.generation ?? {
            acceptableFormats: [],
            cancellableFormats: [],
            discardableFormats: [],
            enqueuedFormats: [],
            readableFormats: [],
        },
        clock: dependencies.clock,
        cryptography,
        rateLimiter: dictionaryRateLimiter,
        store: generationStore,
    });
    const documentService = dependencies.documentUploadStorage
        ? new DictionaryDocumentService({
              authentication,
              authorizationEnabled:
                  dependencies.documentUploadAuthorizationEnabled ?? false,
              clock: dependencies.clock,
              cryptography,
              ocrAvailable:
                  dependencies.generation?.documentOcrAvailable ?? false,
              rateLimiter: dictionaryRateLimiter,
              storage: dependencies.documentUploadStorage,
              store: new DrizzleDictionaryDocumentStore(
                  dependencies.database,
                  dependencies.ids,
                  generationStore,
                  dependencies.generationProviderBudget,
                  dependencies.aiCreditEnforcementEnabled ?? false,
              ),
          })
        : undefined;
    const routes = createDictionaryRoutes({
        policy: dependencies.policy,
        service,
    });
    routes.route(
        '/',
        createDictionaryGenerationRoutes({
            policy: dependencies.policy,
            service: generationService,
        }),
    );
    if (audioService)
        routes.route(
            '/',
            createDictionaryAudioRoutes({
                service: audioService,
                policy: dependencies.policy,
            }),
        );
    if (documentService)
        routes.route(
            '/',
            createDictionaryDocumentRoutes({
                policy: dependencies.policy,
                service: documentService,
            }),
        );
    return {
        audioService,
        documentService,
        generationService,
        routes,
        service,
    };
}
