import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import { dictionaryGenerationJobsTable } from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import type { OwnerDeletionPreparation } from '../../../application/ports/owner-deletion-preparation';

/** Asks the existing generation worker to cancel active work after access is revoked. */
export class DrizzleOwnerDeletionPreparation implements OwnerDeletionPreparation {
    public constructor(private readonly database: PostgresJsDatabase<typeof databaseSchema>) {}

    public async requestCancellation(userId: string): Promise<void> {
        await this.database.update(dictionaryGenerationJobsTable).set({
            cancellationRequestedAt: new Date(),
        }).where(and(
            eq(dictionaryGenerationJobsTable.ownerId, userId),
            inArray(dictionaryGenerationJobsTable.executionState, ['queued', 'running']),
            isNull(dictionaryGenerationJobsTable.cancellationRequestedAt),
        ));
    }
}
