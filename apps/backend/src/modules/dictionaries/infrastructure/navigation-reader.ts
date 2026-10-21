import { sql } from 'drizzle-orm';
import { createNavigationReader } from '../../navigation/infrastructure/navigation-reader';
import type { NavigationDatabase } from '../../navigation/infrastructure/persistence/drizzle/drizzle-navigation-metadata-store';
import { dictionariesTable } from './persistence/drizzle/schema';
export function createDictionaryNavigationReader(database: NavigationDatabase) {
    return createNavigationReader(
        database,
        'dictionary',
        (ownerId) => sql`
        select id, updated_at as activity_at, name as title, '/dictionaries/' || id::text as href, upper(source_language_tag) || ' → ' || upper(target_language_tag) as description, source_language_tag as language
        from ${dictionariesTable} where owner_id = ${ownerId}::uuid and lifecycle = 'active'
    `,
    );
}
