import type { RateLimiter } from '../../authentication/application/ports/rate-limiter';
import { KnowledgeService } from '../application/knowledge-service';
import {
    DrizzleKnowledgeStore,
    type KnowledgeLifecycleParticipant,
} from './persistence/drizzle/drizzle-knowledge-store';
import type { KnowledgeDatabase } from './persistence/drizzle/knowledge-transaction';
import { KnowledgeShareCrypto } from './knowledge-share-crypto';

export function createKnowledgeService(options: {
    database: KnowledgeDatabase;
    authenticate: (token: string) => Promise<{ userId: string }>;
    rateLimiter: RateLimiter;
    lifecycle: KnowledgeLifecycleParticipant;
    shareSecret: string | Uint8Array;
    limits: { referenceChars: number; editorChars: number };
}) {
    return new KnowledgeService({
        store: new DrizzleKnowledgeStore(
            options.database,
            options.lifecycle,
            new KnowledgeShareCrypto(options.shareSecret),
            options.limits,
        ),
        authenticate: options.authenticate,
        rateLimiter: options.rateLimiter,
    });
}
