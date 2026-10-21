import type { RateLimiter } from '../../authentication/application/ports/rate-limiter';
import { createDictionaryNavigationReader } from '../../dictionaries/infrastructure/navigation-reader';
import { createTextNavigationReader } from '../../texts/infrastructure/navigation-reader';
import { createKnowledgeNavigationReader } from '../../knowledge/infrastructure/navigation-reader';
import { NavigationService } from '../application/navigation-service';
import {
    DrizzleNavigationMetadataStore,
    type NavigationDatabase,
} from './persistence/drizzle/drizzle-navigation-metadata-store';
export function createNavigationService(options: {
    database: NavigationDatabase;
    authenticate: (token: string) => Promise<{ userId: string }>;
    rateLimiter: RateLimiter;
}) {
    return new NavigationService({
        ...options,
        metadata: new DrizzleNavigationMetadataStore(options.database),
        readers: [
            createDictionaryNavigationReader(options.database),
            createTextNavigationReader(options.database),
            createKnowledgeNavigationReader(options.database),
        ],
    });
}
