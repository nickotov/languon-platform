import { sql } from 'drizzle-orm';
import { createNavigationReader } from '../../navigation/infrastructure/navigation-reader';
import type { NavigationDatabase } from '../../navigation/infrastructure/persistence/drizzle/drizzle-navigation-metadata-store';
import {
    knowledgeNotesTable,
    knowledgeWorkingBranchesTable,
} from './persistence/drizzle/schema';
export function createKnowledgeNavigationReader(database: NavigationDatabase) {
    return createNavigationReader(
        database,
        'knowledge',
        (ownerId) => sql`
        select n.id, greatest(n.updated_at,b.updated_at) as activity_at, coalesce(b.content->>'title',n.title) as title, '/knowledge/' || n.id::text as href,
        null::text as description, coalesce(b.content->>'studiedLanguage',n.studied_language) as language
        from ${knowledgeNotesTable} n left join ${knowledgeWorkingBranchesTable} b on b.id=n.preferred_branch_id and b.note_id=n.id
        where n.owner_id=${ownerId}::uuid
    `,
    );
}
