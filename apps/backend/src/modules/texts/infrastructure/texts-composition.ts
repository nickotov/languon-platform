import { createHmac } from 'node:crypto';
import type { AccessTokenSigner } from '../../authentication/application/ports/access-token';
import type { AuthenticationService } from '../../authentication/application/authentication-service';
import type { AuthHttpPolicy } from '../../authentication/interface/http/auth-http-policy';
import type { RateLimiter } from '../../authentication/application/ports/rate-limiter';
import {
    HmacDictionaryCryptography,
    type DictionaryEntropySource,
} from '../../dictionaries/infrastructure/crypto/dictionary-cryptography';
import { TextContentService } from '../application/text-content-service';
import {
    DrizzleTextContentStore,
    type TextProposalLoader,
} from './persistence/drizzle/drizzle-text-content-store';
import type { TextsContentDatabase } from './persistence/drizzle/text-content-support';
import { createTextContentRoutes } from '../interface/http/text-content.routes';
export function createTextsCryptography(
    secret: string | Uint8Array,
    entropy: DictionaryEntropySource,
) {
    return new HmacDictionaryCryptography({
        entropy,
        secret: createHmac('sha256', secret)
            .update('languon-texts-capabilities-v1')
            .digest(),
    });
}
export interface TextsContentCompositionDependencies {
    database: TextsContentDatabase;
    accessTokens: AccessTokenSigner;
    authentication: Pick<AuthenticationService, 'requireActiveSession'>;
    clock: { now(): Date };
    ids: { generate(): string };
    entropy: DictionaryEntropySource;
    dictionaryHmacSecret: string | Uint8Array;
    rateLimiter: RateLimiter;
    policy: AuthHttpPolicy;
    loadProposal?: TextProposalLoader;
}
export function createTextsContentComposition(
    dependencies: TextsContentCompositionDependencies,
) {
    const cryptography = createTextsCryptography(
        dependencies.dictionaryHmacSecret,
        dependencies.entropy,
    );
    const store = new DrizzleTextContentStore(
        dependencies.database,
        dependencies.ids,
        dependencies.clock,
        cryptography,
        dependencies.loadProposal,
    );
    const service = new TextContentService({
        store,
        rateLimiter: dependencies.rateLimiter,
        authenticate: async (token) => {
            const claims = await dependencies.accessTokens.verify(token);
            await dependencies.authentication.requireActiveSession({
                userId: claims.userId,
                sessionId: claims.sessionId,
            });
            return { userId: claims.userId };
        },
    });
    return {
        store,
        service,
        cryptography,
        routes: createTextContentRoutes({
            service,
            policy: dependencies.policy,
        }),
    };
}
