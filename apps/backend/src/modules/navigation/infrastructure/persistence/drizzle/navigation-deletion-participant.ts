import { eq } from 'drizzle-orm';
import type { NavigationDatabase } from './drizzle-navigation-metadata-store';
import { navigationResourcesTable } from './schema';

type NavigationTransaction = Parameters<
    Parameters<NavigationDatabase['transaction']>[0]
>[0];

/** Erase navigation history/pins inside the account purge transaction.
 * The lifecycle fence must already hold; users remain as purged tombstones. */
export async function eraseNavigationOwnedMetadata(
    tx: NavigationTransaction,
    ownerId: string,
): Promise<void> {
    await tx
        .delete(navigationResourcesTable)
        .where(eq(navigationResourcesTable.ownerId, ownerId));
}
