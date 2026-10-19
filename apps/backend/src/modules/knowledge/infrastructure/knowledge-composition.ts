import type { RateLimiter } from '../../authentication/application/ports/rate-limiter';
import { KnowledgeService } from '../application/knowledge-service';
import {
    DrizzleKnowledgeStore,
    type KnowledgeLifecycleParticipant,
} from './persistence/drizzle/drizzle-knowledge-store';
import type { KnowledgeDatabase } from './persistence/drizzle/knowledge-transaction';

export function createKnowledgeService(options: {
    database: KnowledgeDatabase;
    authenticate: (token: string) => Promise<{ userId: string }>;
    rateLimiter: RateLimiter;
    lifecycle: KnowledgeLifecycleParticipant;
}) {
    return new KnowledgeService({
        store: new DrizzleKnowledgeStore(options.database, options.lifecycle),
        authenticate: options.authenticate,
        rateLimiter: options.rateLimiter,
    });
}
