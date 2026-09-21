import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import { dictionaryGenerationJobsTable } from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import { dictionaryAudioJobsTable } from '../../../../dictionaries/infrastructure/persistence/drizzle/audio-schema';
import type { OwnerDeletionPreparation } from '../../../application/ports/owner-deletion-preparation';

/** Asks the existing generation worker to cancel active work after access is revoked. */
export class DrizzleOwnerDeletionPreparation implements OwnerDeletionPreparation {
    public constructor(
        private readonly database: PostgresJsDatabase<typeof databaseSchema>,
    ) {}

    public async requestCancellation(userId: string): Promise<void> {
        // Preserve live leases until their bounded external writes have quiesced.
        await this.database.transaction(async (tx) => {
            await tx.execute(
                sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 76021941))`,
            );
            await tx
                .update(dictionaryAudioJobsTable)
                .set({
                    // Preserve submitted/ambiguous work as a non-retryable
                    // tombstone even if deletion is cancelled and access restored.
                    state: sql`case when ${dictionaryAudioJobsTable.state} = 'queued' then 'cancelled' when ${dictionaryAudioJobsTable.state} in ('submitting','waiting_provider','storing','submission_unknown') then 'submission_unknown' else ${dictionaryAudioJobsTable.state} end`,
                    text: '',
                })
                .where(eq(dictionaryAudioJobsTable.ownerId, userId));
        });
        await this.database
            .update(dictionaryGenerationJobsTable)
            .set({
                cancellationRequestedAt: new Date(),
            })
            .where(
                and(
                    eq(dictionaryGenerationJobsTable.ownerId, userId),
                    inArray(dictionaryGenerationJobsTable.executionState, [
                        'queued',
                        'running',
                    ]),
                    isNull(
                        dictionaryGenerationJobsTable.cancellationRequestedAt,
                    ),
                ),
            );
    }
}
