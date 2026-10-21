import { eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import type { NavigationResourceKind } from '@languon/contracts';
import {
    NavigationError,
    type NavigationMetadataStore,
} from '../../../application/navigation-ports';
import { navigationResourcesTable } from './schema';
export type NavigationDatabase = PostgresJsDatabase<typeof databaseSchema>;
export class DrizzleNavigationMetadataStore implements NavigationMetadataStore {
    constructor(private readonly database: NavigationDatabase) {}
    async record(
        ownerId: string,
        kind: NavigationResourceKind,
        resourceId: string,
        mutation: { openedAt?: Date; pinned?: boolean },
    ) {
        await this.database.transaction(async (tx) => {
            // Shared lifecycle fence prevents inserting metadata after account purge has begun.
            const [owner] = await tx
                .select({ status: usersTable.status })
                .from(usersTable)
                .where(eq(usersTable.id, ownerId))
                .for('share');
            if (owner?.status !== 'active')
                throw new NavigationError(
                    'resource_not_found',
                    'The resource is unavailable.',
                );
            const pinnedAt = mutation.pinned ? new Date() : null;
            const set = mutation.openedAt
                ? {
                      lastOpenedAt: sql`greatest(${navigationResourcesTable.lastOpenedAt}, ${mutation.openedAt.toISOString()}::timestamptz)`,
                  }
                : { pinnedAt };
            await tx
                .insert(navigationResourcesTable)
                .values({
                    ownerId,
                    kind,
                    resourceId,
                    lastOpenedAt: mutation.openedAt ?? null,
                    pinnedAt,
                })
                .onConflictDoUpdate({
                    target: [
                        navigationResourcesTable.ownerId,
                        navigationResourcesTable.kind,
                        navigationResourcesTable.resourceId,
                    ],
                    set,
                });
        });
    }
}
