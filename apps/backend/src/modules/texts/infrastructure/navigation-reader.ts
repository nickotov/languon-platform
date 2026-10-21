import { sql } from 'drizzle-orm';
import { createNavigationReader } from '../../navigation/infrastructure/navigation-reader';
import type { NavigationDatabase } from '../../navigation/infrastructure/persistence/drizzle/drizzle-navigation-metadata-store';
import { textsTable, textFoldersTable } from './persistence/drizzle/schema';
export function createTextNavigationReader(database: NavigationDatabase) {
    return createNavigationReader(
        database,
        'text',
        (ownerId) => sql`
        select t.id, t.updated_at as activity_at, t.title, '/texts/' || t.id::text as href, f.name as description, t.source_language as language
        from ${textsTable} t left join ${textFoldersTable} f on f.id=t.folder_id and f.owner_id=t.owner_id
        where t.owner_id = ${ownerId}::uuid and t.lifecycle='active' and (t.folder_id is null or f.lifecycle='active')
    `,
    );
}
