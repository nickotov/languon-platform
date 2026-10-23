import { requestPortraitCancellation } from '../../../../learner-portraits/infrastructure/persistence/drizzle/portrait-deletion-participant';
import { requestConversationCancellation } from '../../../../conversations/infrastructure/persistence/drizzle/conversation-deletion-participant';
import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { requestTextsCancellation } from '../../../../texts/infrastructure/persistence/drizzle/texts-deletion-participant';
import { cancelSpeechActorForScheduledDeletion } from '../../../../speech/infrastructure/drizzle-speech-store';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import { dictionaryGenerationJobsTable } from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import { dictionariesTable } from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import { requestSentenceCancellation } from '../../../../learning/infrastructure/persistence/drizzle/sentence-deletion-participant';
import type { OwnerDeletionPreparation } from '../../../application/ports/owner-deletion-preparation';

/** Asks the existing generation worker to cancel active work after access is revoked. */
export class DrizzleOwnerDeletionPreparation implements OwnerDeletionPreparation {
    public constructor(
        private readonly database: PostgresJsDatabase<typeof databaseSchema>,
    ) {}

    public async requestCancellation(userId: string): Promise<void> {
        // Preserve live leases until their bounded external writes have quiesced.
        await this.database.transaction(async (tx) => {
            await lockTextAiCapacity(tx);
            await cancelSpeechActorForScheduledDeletion(tx, userId);
            await tx.execute(
                sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 76021941))`,
            );

            await requestPortraitCancellation(tx, userId);
            await requestTextsCancellation(tx, userId, new Date());
            await requestConversationCancellation(
                tx,
                { ownerId: userId },
                new Date(),
            );

            const ownedDictionaries = await tx
                .select({ id: dictionariesTable.id })
                .from(dictionariesTable)
                .where(eq(dictionariesTable.ownerId, userId));

            await requestSentenceCancellation(tx, {
                accountPurge: true,
                learnerId: userId,
                dictionaryIds: ownedDictionaries.map(
                    (dictionary) => dictionary.id,
                ),
                now: new Date(),
            });
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
