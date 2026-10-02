import type { PostgresJsDatabase } from '@languon/database';
import type { databaseSchema } from '../../../infrastructure/database/schema';
import type { AccessTokenSigner } from '../../authentication/application/ports/access-token';
import type { AuthenticationService } from '../../authentication/application/authentication-service';
import type { RateLimiter } from '../../authentication/application/ports/rate-limiter';
import type { AuthHttpPolicy } from '../../authentication/interface/http/auth-http-policy';
import {
    HmacDictionaryCryptography,
    type DictionaryEntropySource,
} from '../../dictionaries/infrastructure/crypto/dictionary-cryptography';
import { DrizzleDictionaryStore } from '../../dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-store';
import type { DictionaryIdGenerator } from '../../dictionaries/infrastructure/persistence/drizzle/dictionary-id-generator';
import { LearningService } from '../application/learning-service';
import { createLearningRoutes } from '../interface/http/learning.routes';
import { DrizzleLearningStore } from './persistence/drizzle/drizzle-learning-store';

export interface LearningCompositionDependencies {
    clock: { now(): Date };
    accessTokens: AccessTokenSigner;
    authentication: Pick<AuthenticationService, 'requireActiveSession'>;
    database: PostgresJsDatabase<typeof databaseSchema>;
    dictionaryHmacSecret: string | Uint8Array;
    entropy: DictionaryEntropySource;
    ids: DictionaryIdGenerator;
    rateLimiter: RateLimiter;
    policy: AuthHttpPolicy;
    enabled: boolean;
}
export function createLearningComposition(
    dependencies: LearningCompositionDependencies,
) {
    const cryptography = new HmacDictionaryCryptography({
        entropy: dependencies.entropy,
        secret: dependencies.dictionaryHmacSecret,
    });
    const service = new LearningService({
        clock: dependencies.clock,
        enabled: dependencies.enabled,
        rateLimiter: dependencies.rateLimiter,
        cryptography,
        dictionaries: new DrizzleDictionaryStore(
            dependencies.database,
            dependencies.ids,
        ),
        store: new DrizzleLearningStore(dependencies.database),
        authentication: {
            authenticate: async (accessToken) => {
                const claims =
                    await dependencies.accessTokens.verify(accessToken);
                await dependencies.authentication.requireActiveSession({
                    sessionId: claims.sessionId,
                    userId: claims.userId,
                });
                return { sessionId: claims.sessionId, userId: claims.userId };
            },
        },
    });
    return {
        service,
        routes: createLearningRoutes({ service, policy: dependencies.policy }),
    };
}
