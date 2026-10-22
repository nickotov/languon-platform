import {
    portraitDeletionBusy,
    eraseOwnerLearnerPortrait,
} from '../../../../learner-portraits/infrastructure/persistence/drizzle/portrait-deletion-participant';
import {
    conversationDeletionBusy,
    eraseOwnerConversations,
} from '../../../../conversations/infrastructure/persistence/drizzle/conversation-deletion-participant';
import { eraseOwnerKnowledge } from '../../../../knowledge/infrastructure/persistence/drizzle/knowledge-deletion-participant';
import { eraseNavigationOwnedMetadata } from '../../../../navigation/infrastructure/persistence/drizzle/navigation-deletion-participant';
import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import {
    eraseTextsOwnedContent,
    textsDeletionBusy,
} from '../../../../texts/infrastructure/persistence/drizzle/texts-deletion-participant';
import { purgeSpeechActor } from '../../../../speech/infrastructure/drizzle-speech-store';
import { and, eq, gt, inArray, lte, or, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import {
    DrizzleAiCreditTransactionParticipant,
    aiCreditOwnerLockNamespace,
} from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import {
    adminAuditEventsTable,
    adminMembershipsTable,
} from '../../../../administration/infrastructure/persistence/drizzle/schema';
import {
    authPasskeysTable,
    authSecurityEventsTable,
    authSessionsTable,
    authVerificationChallengesTable,
    passwordCredentialsTable,
} from '../../../../authentication/infrastructure/persistence/drizzle/schema';
import {
    dictionariesTable,
    dictionaryCardRevisionsTable,
    dictionaryDocumentExtractionsTable,
    dictionaryDocumentObjectVersionsTable,
    dictionaryDocumentUploadsTable,
    dictionaryGenerationJobsTable,
    dictionaryGenerationProposalsTable,
    dictionaryDeletionReceiptsTable,
    dictionaryGenerationProviderUsageArchiveTable,
    dictionaryIdempotencyKeysTable,
} from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import type {
    AccountPurgeStore,
    ClaimedAccountPurge,
} from '../../../application/ports/account-purge-store';
import { accountDeletionRequestsTable } from './account-deletion-schema';
import {
    flashcardAttemptsTable,
    flashcardEntryProgressTable,
    flashcardPreferencesTable,
} from '../../../../learning/infrastructure/persistence/drizzle/schema';
import { userEmailsTable, usersTable } from './schema';
import { textAiPreferencesTable } from '../../../../text-ai/infrastructure/persistence/drizzle/schema';
import {
    sentenceDeletionBusy,
    eraseSentenceDerivedContent,
} from '../../../../learning/infrastructure/persistence/drizzle/sentence-deletion-participant';

type AccountPurgeDatabase = PostgresJsDatabase<typeof databaseSchema>;
const leaseMs = 5 * 60_000;
const retryMs = 5 * 60_000;

export class DrizzleAccountPurgeStore implements AccountPurgeStore {
    public constructor(private readonly database: AccountPurgeDatabase) {}

    public claimDue(input: {
        now: Date;
        workerId: string;
    }): Promise<ClaimedAccountPurge | null> {
        return this.database.transaction(async (tx) => {
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

    public async inspectOwner(
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
        const portraitBusy = await this.database.transaction((tx) =>
            portraitDeletionBusy(tx, input.userId, new Date(), authorization),
        );
        const conversationBusy = await this.database.transaction((tx) =>
            conversationDeletionBusy(tx, { ownerId: input.userId }),
        );
        const textsBusy = await this.database.transaction((tx) =>
            textsDeletionBusy(tx, input.userId),
        );
        const sentenceBusy = await this.database.transaction(async (tx) => {
            const ownedDictionaries = await tx
                .select({ id: dictionariesTable.id })
                .from(dictionariesTable)
                .where(eq(dictionariesTable.ownerId, input.userId));
            return sentenceDeletionBusy(tx, {
                accountPurge: true,
                learnerId: input.userId,
                dictionaryIds: ownedDictionaries.map(
                    (dictionary) => dictionary.id,
                ),
            });
        });
        const [active, objects] = await Promise.all([
            this.database
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
            this.database
                .select({
                    cleanupState: dictionaryDocumentUploadsTable.cleanupState,
                    objectKey: dictionaryDocumentUploadsTable.objectKey,
                })
                .from(dictionaryDocumentUploadsTable)
                .where(
                    eq(dictionaryDocumentUploadsTable.ownerId, input.userId),
                ),
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

    public async renew(
        input: ClaimedAccountPurge & { now: Date; workerId: string },
    ): Promise<boolean> {
        const [renewed] = await this.database
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
                    eq(
                        accountDeletionRequestsTable.leaseWorkerId,
                        input.workerId,
                    ),
                    eq(accountDeletionRequestsTable.state, 'running'),
                    gt(accountDeletionRequestsTable.leaseDeadline, input.now),
                ),
            )
            .returning({ userId: accountDeletionRequestsTable.userId });
        return Boolean(renewed);
    }

    public async finish(
        input: ClaimedAccountPurge & { now: Date; workerId: string },
    ): Promise<boolean> {
        return this.database.transaction(async (tx) => {
            await lockTextAiCapacity(tx);
            await tx.execute(
                sql`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 76021941))`,
            );
            const [request] = await tx
                .select({
                    fencingToken: accountDeletionRequestsTable.fencingToken,
                    leaseDeadline: accountDeletionRequestsTable.leaseDeadline,
                    leaseWorkerId: accountDeletionRequestsTable.leaseWorkerId,
                    state: accountDeletionRequestsTable.state,
                })
                .from(accountDeletionRequestsTable)
                .where(eq(accountDeletionRequestsTable.userId, input.userId))
                .limit(1)
                .for('update');
            if (
                request?.state !== 'running' ||
                request.fencingToken !== input.fencingToken ||
                request.leaseWorkerId !== input.workerId ||
                !request.leaseDeadline ||
                request.leaseDeadline <= input.now
            )
                return false;
            await tx.execute(
                sql`select languon_assert_accounting_purge_claim(${input.userId}::uuid,${input.workerId},${input.fencingToken}::integer)`,
            );
            const [user] = await tx
                .select({ status: usersTable.status })
                .from(usersTable)
                .where(eq(usersTable.id, input.userId))
                .limit(1);
            if (user?.status !== 'deletion_pending') return false;
            const ownedDictionaries = await tx
                .select({ id: dictionariesTable.id })
                .from(dictionariesTable)
                .where(eq(dictionariesTable.ownerId, input.userId));
            const sentenceScope = {
                accountPurge: true,
                learnerId: input.userId,
                dictionaryIds: ownedDictionaries.map(
                    (dictionary) => dictionary.id,
                ),
            };
            if (
                await conversationDeletionBusy(
                    tx,
                    { ownerId: input.userId },
                    input.now,
                )
            )
                throw new Error('Conversation work is not quiescent');
            if (
                await portraitDeletionBusy(tx, input.userId, input.now, {
                    workerId: input.workerId,
                    fencingToken: input.fencingToken,
                })
            )
                throw new Error('Portrait work is not quiescent');
            if (await textsDeletionBusy(tx, input.userId))
                throw new Error('Text work is not quiescent');
            if (await sentenceDeletionBusy(tx, sentenceScope))
                throw new Error('Sentence work is not quiescent');
            const [active] = await tx
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
                );
            const [unclean] = await tx
                .select({ count: sql<number>`count(*)::int` })
                .from(dictionaryDocumentUploadsTable)
                .where(
                    and(
                        eq(
                            dictionaryDocumentUploadsTable.ownerId,
                            input.userId,
                        ),
                        or(
                            sql`${dictionaryDocumentUploadsTable.cleanupState} <> 'complete'`,
                            gt(
                                dictionaryDocumentUploadsTable.capabilityExpiresAt,
                                input.now,
                            ),
                        ),
                    ),
                );
            if ((active?.count ?? 0) > 0 || (unclean?.count ?? 0) > 0) {
                throw new Error(
                    'Owner jobs or physical document cleanup are not terminal.',
                );
            }

            // Child rows are removed in FK order. Audit and membership rows retain only
            // opaque user IDs, allowing the user row to remain as a minimal tombstone.
            await tx
                .delete(dictionaryDocumentExtractionsTable)
                .where(
                    sql`${dictionaryDocumentExtractionsTable.uploadId} in (select id from dictionary_document_uploads where owner_id = ${input.userId})`,
                );
            await tx
                .delete(dictionaryGenerationProposalsTable)
                .where(
                    sql`${dictionaryGenerationProposalsTable.jobId} in (select id from dictionary_generation_jobs where owner_id = ${input.userId})`,
                );
            await tx
                .delete(dictionaryDocumentObjectVersionsTable)
                .where(
                    sql`${dictionaryDocumentObjectVersionsTable.uploadId} in (select id from dictionary_document_uploads where owner_id = ${input.userId})`,
                );
            await tx
                .delete(dictionaryDocumentUploadsTable)
                .where(
                    eq(dictionaryDocumentUploadsTable.ownerId, input.userId),
                );
            await tx
                .delete(dictionaryCardRevisionsTable)
                .where(
                    sql`${dictionaryCardRevisionsTable.dictionaryId} in (select id from dictionaries where owner_id = ${input.userId})`,
                );
            await tx
                .delete(dictionaryGenerationJobsTable)
                .where(eq(dictionaryGenerationJobsTable.ownerId, input.userId));
            await eraseOwnerLearnerPortrait(tx, input.userId, input.now, {
                workerId: input.workerId,
                fencingToken: input.fencingToken,
            });
            await eraseOwnerConversations(tx, input.userId, input.now);
            await eraseOwnerKnowledge(tx, input.userId);
            await eraseTextsOwnedContent(tx, input.userId, input.now);
            await eraseNavigationOwnedMetadata(tx, input.userId);
            await eraseSentenceDerivedContent(tx, {
                ...sentenceScope,
                now: input.now,
            });
            await purgeSpeechActor(tx, input.userId, input.now, {
                workerId: input.workerId,
                fencingToken: input.fencingToken,
            });
            // Preserve anonymous financial attribution before deleting grants;
            // wallet locks always precede report invalidation locks.
            await tx.execute(
                sql`select pg_advisory_xact_lock(hashtextextended(${input.userId}, ${aiCreditOwnerLockNamespace}))`,
            );
            await new DrizzleAiCreditTransactionParticipant(tx).purgeOwner(
                input.userId,
                { workerId: input.workerId, fencingToken: input.fencingToken },
            );
            await tx
                .delete(textAiPreferencesTable)
                .where(eq(textAiPreferencesTable.userId, input.userId));

            // Purged users retain tombstones. Remove learning on foreign dictionaries
            // explicitly; owned-dictionary and user deletion cascades cannot cover it.
            await tx
                .delete(flashcardEntryProgressTable)
                .where(eq(flashcardEntryProgressTable.learnerId, input.userId));
            await tx
                .delete(flashcardAttemptsTable)
                .where(eq(flashcardAttemptsTable.learnerId, input.userId));
            await tx
                .delete(flashcardPreferencesTable)
                .where(eq(flashcardPreferencesTable.learnerId, input.userId));
            await tx
                .delete(dictionaryIdempotencyKeysTable)
                .where(
                    eq(dictionaryIdempotencyKeysTable.ownerId, input.userId),
                );
            await tx
                .delete(dictionaryDeletionReceiptsTable)
                .where(
                    eq(dictionaryDeletionReceiptsTable.ownerId, input.userId),
                );
            await tx
                .delete(dictionaryGenerationProviderUsageArchiveTable)
                .where(
                    eq(
                        dictionaryGenerationProviderUsageArchiveTable.ownerId,
                        input.userId,
                    ),
                );
            await tx
                .delete(dictionariesTable)
                .where(eq(dictionariesTable.ownerId, input.userId));
            await tx
                .delete(authVerificationChallengesTable)
                .where(
                    eq(authVerificationChallengesTable.userId, input.userId),
                );
            await tx
                .delete(authPasskeysTable)
                .where(eq(authPasskeysTable.userId, input.userId));
            await tx
                .delete(passwordCredentialsTable)
                .where(eq(passwordCredentialsTable.userId, input.userId));
            await tx
                .delete(authSessionsTable)
                .where(eq(authSessionsTable.userId, input.userId));
            await tx
                .delete(userEmailsTable)
                .where(eq(userEmailsTable.userId, input.userId));
            await tx
                .update(authSecurityEventsTable)
                .set({ metadata: {} })
                .where(eq(authSecurityEventsTable.userId, input.userId));
            await tx
                .update(adminAuditEventsTable)
                .set({ metadata: {}, reason: null })
                .where(
                    or(
                        eq(adminAuditEventsTable.actorUserId, input.userId),
                        eq(adminAuditEventsTable.targetUserId, input.userId),
                    ),
                );
            await tx
                .update(adminMembershipsTable)
                .set({
                    grantReason: 'Account purged',
                    revokeReason: sql`case when ${adminMembershipsTable.revokedAt} is null then null else 'Account purged' end`,
                    updatedAt: input.now,
                })
                .where(
                    or(
                        eq(adminMembershipsTable.userId, input.userId),
                        eq(adminMembershipsTable.grantedByUserId, input.userId),
                        eq(adminMembershipsTable.revokedByUserId, input.userId),
                    ),
                );
            await tx.execute(
                sql`select languon_complete_account_purge(${input.userId}::uuid,${input.workerId},${input.fencingToken}::integer)`,
            );
            return true;
        });
    }

    public async retry(
        input: ClaimedAccountPurge & { now: Date; workerId: string },
    ): Promise<void> {
        await this.database
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
                    eq(
                        accountDeletionRequestsTable.leaseWorkerId,
                        input.workerId,
                    ),
                    eq(accountDeletionRequestsTable.state, 'running'),
                ),
            );
    }

    public async releaseWorkerLeases(input: {
        now: Date;
        workerId: string;
    }): Promise<void> {
        await this.database
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
                    eq(
                        accountDeletionRequestsTable.leaseWorkerId,
                        input.workerId,
                    ),
                    eq(accountDeletionRequestsTable.state, 'running'),
                ),
            );
    }
}
