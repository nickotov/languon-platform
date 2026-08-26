import type { PostgresJsDatabase } from '@languon/database';
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
    accessTokens: AccessTokenSigner;
    authentication: Pick<AuthenticationService, 'requireActiveSession'>;
    clock: DictionaryClock;
    database: PostgresJsDatabase<typeof databaseSchema>;
    entropy: DictionaryEntropySource;
    dictionaryHmacSecret: string | Uint8Array;
    ids: DictionaryIdGenerator;
    generation?: DictionaryGenerationApiCapabilities;
    generationProviderBudget?: DictionaryGenerationProviderBudgetPolicy;
    documentUploadStorage?: DictionaryDocumentUploadStorage;
    documentUploadAuthorizationEnabled?: boolean;
    rateLimiter: RateLimiter;
    policy: AuthHttpPolicy;
}

export interface DictionaryComposition {
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
    );
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
        store: new DrizzleDictionaryStore(
            dependencies.database,
            dependencies.ids,
        ),
    });
    const generationService = new DictionaryGenerationService({
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
    if (documentService)
        routes.route(
            '/',
            createDictionaryDocumentRoutes({
                policy: dependencies.policy,
                service: documentService,
            }),
        );
    return {
        documentService,
        generationService,
        routes,
        service,
    };
}
