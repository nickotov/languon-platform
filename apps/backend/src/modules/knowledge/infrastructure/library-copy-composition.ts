import type { RateLimiter } from '../../authentication/application/ports/rate-limiter';
import type { AuthHttpPolicy } from '../../authentication/interface/http/auth-http-policy';
import type { DictionaryEntropySource } from '../../dictionaries/infrastructure/crypto/dictionary-cryptography';
import { createPreparedDictionaryLibraryPublication } from '../../dictionaries/infrastructure/prepared-library-publication';
import { createTextLibraryPublication } from '../../texts/infrastructure/text-library-publication';
import { KnowledgeLibraryCopyService } from '../application/library-copy-service';
import { createKnowledgeLibraryCopyRoutes } from '../interface/http/library-copy-routes';
import { KnowledgeShareCrypto } from './knowledge-share-crypto';
import { createKnowledgeLibraryCopyStore } from './persistence/drizzle/library-copy-store';
import type { KnowledgeDatabase } from './persistence/drizzle/knowledge-transaction';

export function createKnowledgeLibraryCopyComposition(options: {
    database: KnowledgeDatabase;
    ids: { generate(): string };
    clock: { now(): Date };
    entropy: DictionaryEntropySource;
    dictionaryHmacSecret: string | Uint8Array;
    shareSecret: string | Uint8Array;
    authenticate(token: string): Promise<{ userId: string }>;
    rateLimiter: RateLimiter;
    policy: AuthHttpPolicy;
}) {
    const store = createKnowledgeLibraryCopyStore({
        dictionary: createPreparedDictionaryLibraryPublication(options),
        texts: createTextLibraryPublication(options),
        crypto: new KnowledgeShareCrypto(options.shareSecret),
    });
    const service = new KnowledgeLibraryCopyService({
        store,
        authenticate: options.authenticate,
        rateLimiter: options.rateLimiter,
    });
    return {
        store,
        service,
        routes: createKnowledgeLibraryCopyRoutes({
            service,
            policy: options.policy,
        }),
    };
}
