import { and, eq, gt, inArray, lte, or, sql } from 'drizzle-orm';
import { conversationDeletionBusy } from '../../../../conversations/infrastructure/persistence/drizzle/conversation-deletion-participant';
import {
    dictionariesTable,
    dictionaryDocumentUploadsTable,
    dictionaryGenerationJobsTable,
} from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import { portraitDeletionBusy } from '../../../../learner-portraits/infrastructure/persistence/drizzle/portrait-deletion-participant';
import { sentenceDeletionBusy } from '../../../../learning/infrastructure/persistence/drizzle/sentence-deletion-participant';
import { textsDeletionBusy } from '../../../../texts/infrastructure/persistence/drizzle/texts-deletion-participant';
import type { ClaimedAccountPurge } from '../../../application/ports/account-purge-store';
import { accountDeletionRequestsTable } from './account-deletion-schema';
import {
    leaseMs,
    retryMs,
    type AccountPurgeContext,
} from './account-purge-persistence-support';
import { usersTable } from './schema';

export function claimDue(
    persistence: AccountPurgeContext,
    input: {
        now: Date;
        workerId: string;
    },
): Promise<ClaimedAccountPurge | null> {
    return persistence.database.transaction(async (tx) => {
        const [request] = await tx
            .select({
                fencingToken: accountDeletionRequestsTable.fencingToken,
                state: accountDeletionRequestsTable.state,
                userId: accountDeletionRequestsTable.userId,
            })
            .from(accountDeletionRequestsTable)
            .where(
                or(
                    and(
                        eq(accountDeletionRequestsTable.state, 'pending'),
                        lte(
                            accountDeletionRequestsTable.nextAttemptAt,
                            input.now,
                        ),
                    ),
                    and(
                        eq(accountDeletionRequestsTable.state, 'running'),
                        lte(
                            accountDeletionRequestsTable.leaseDeadline,
                            input.now,
                        ),
                    ),
                ),
            )
            .orderBy(
                accountDeletionRequestsTable.nextAttemptAt,
                accountDeletionRequestsTable.userId,
            )
            .limit(1)
            .for('update', { skipLocked: true });

        if (!request) return null;
        const [user] = await tx
            .select({ status: usersTable.status })
            .from(usersTable)
            .where(eq(usersTable.id, request.userId))
            .limit(1);

        if (user?.status !== 'deletion_pending') {
            throw new Error(
                'Due purge request does not belong to a deletion-pending account.',
            );
        }

        const nextToken = request.fencingToken + 1;
        const [claimed] = await tx
            .update(accountDeletionRequestsTable)
            .set({
                attemptCount: sql`${accountDeletionRequestsTable.attemptCount} + 1`,
                fencingToken: nextToken,
                leaseDeadline: new Date(input.now.getTime() + leaseMs),
                leaseWorkerId: input.workerId,
                state: 'running',
                updatedAt: input.now,
            })
            .where(eq(accountDeletionRequestsTable.userId, request.userId))
            .returning({ userId: accountDeletionRequestsTable.userId });

        return claimed
            ? {
                  fencingToken: nextToken,
                  userId: claimed.userId,
              }
            : null;
    });
}

export async function inspectOwner(
    persistence: AccountPurgeContext,
    input: ClaimedAccountPurge & { workerId: string },
) {
    if (!input.workerId)
        throw new Error(
            'Account inspection requires its expected worker identity.',
        );
    const authorization = {
        workerId: input.workerId,
        fencingToken: input.fencingToken,
    };
    const portraitBusy = await persistence.database.transaction((tx) =>
        portraitDeletionBusy(tx, input.userId, new Date(), authorization),
    );
    const conversationBusy = await persistence.database.transaction((tx) =>
        conversationDeletionBusy(tx, { ownerId: input.userId }),
    );
    const textsBusy = await persistence.database.transaction((tx) =>
        textsDeletionBusy(tx, input.userId),
    );
    const sentenceBusy = await persistence.database.transaction(async (tx) => {
        const ownedDictionaries = await tx
            .select({ id: dictionariesTable.id })
            .from(dictionariesTable)
            .where(eq(dictionariesTable.ownerId, input.userId));

        return sentenceDeletionBusy(tx, {
            accountPurge: true,
            learnerId: input.userId,
            dictionaryIds: ownedDictionaries.map((dictionary) => dictionary.id),
        });
    });
    const [active, objects] = await Promise.all([
        persistence.database
            .select({ count: sql<number>`count(*)::int` })
            .from(dictionaryGenerationJobsTable)
            .where(
                and(
                    eq(dictionaryGenerationJobsTable.ownerId, input.userId),
                    inArray(dictionaryGenerationJobsTable.executionState, [
                        'queued',
                        'running',
                    ]),
                ),
            ),
        persistence.database
            .select({
                cleanupState: dictionaryDocumentUploadsTable.cleanupState,
                objectKey: dictionaryDocumentUploadsTable.objectKey,
            })
            .from(dictionaryDocumentUploadsTable)
            .where(eq(dictionaryDocumentUploadsTable.ownerId, input.userId)),
    ]);

    return {
        activeJobs:
            (active[0]?.count ?? 0) +
            (sentenceBusy ? 1 : 0) +
            (textsBusy ? 1 : 0) +
            (conversationBusy ? 1 : 0) +
            (portraitBusy ? 1 : 0),
        objects,
    };
}

export async function renew(
    persistence: AccountPurgeContext,
    input: ClaimedAccountPurge & { now: Date; workerId: string },
): Promise<boolean> {
    const [renewed] = await persistence.database
        .update(accountDeletionRequestsTable)
        .set({
            leaseDeadline: new Date(input.now.getTime() + leaseMs),
            updatedAt: input.now,
        })
        .where(
            and(
                eq(accountDeletionRequestsTable.userId, input.userId),
                eq(
                    accountDeletionRequestsTable.fencingToken,
                    input.fencingToken,
                ),
                eq(accountDeletionRequestsTable.leaseWorkerId, input.workerId),
                eq(accountDeletionRequestsTable.state, 'running'),
                gt(accountDeletionRequestsTable.leaseDeadline, input.now),
            ),
        )
        .returning({ userId: accountDeletionRequestsTable.userId });

    return Boolean(renewed);
}

export async function retry(
    persistence: AccountPurgeContext,
    input: ClaimedAccountPurge & { now: Date; workerId: string },
): Promise<void> {
    await persistence.database
        .update(accountDeletionRequestsTable)
        .set({
            leaseDeadline: null,
            leaseWorkerId: null,
            nextAttemptAt: new Date(input.now.getTime() + retryMs),
            state: 'pending',
            updatedAt: input.now,
        })
        .where(
            and(
                eq(accountDeletionRequestsTable.userId, input.userId),
                eq(
                    accountDeletionRequestsTable.fencingToken,
                    input.fencingToken,
                ),
                eq(accountDeletionRequestsTable.leaseWorkerId, input.workerId),
                eq(accountDeletionRequestsTable.state, 'running'),
            ),
        );
}

export async function releaseWorkerLeases(
    persistence: AccountPurgeContext,
    input: {
        now: Date;
        workerId: string;
    },
): Promise<void> {
    await persistence.database
        .update(accountDeletionRequestsTable)
        .set({
            leaseDeadline: null,
            leaseWorkerId: null,
            nextAttemptAt: input.now,
            state: 'pending',
            updatedAt: input.now,
        })
        .where(
            and(
                eq(accountDeletionRequestsTable.leaseWorkerId, input.workerId),
                eq(accountDeletionRequestsTable.state, 'running'),
            ),
        );
}
