import { and, eq, gt, inArray, lte, or, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import { adminAuditEventsTable, adminMembershipsTable } from '../../../../administration/infrastructure/persistence/drizzle/schema';
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
    dictionaryIdempotencyKeysTable,
} from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import type {
    AccountPurgeStore,
    ClaimedAccountPurge,
} from '../../../application/ports/account-purge-store';
import { accountDeletionRequestsTable } from './account-deletion-schema';
import { userEmailsTable, usersTable } from './schema';

type AccountPurgeDatabase = PostgresJsDatabase<typeof databaseSchema>;
const leaseMs = 5 * 60_000;
const retryMs = 5 * 60_000;

export class DrizzleAccountPurgeStore implements AccountPurgeStore {
    public constructor(private readonly database: AccountPurgeDatabase) {}

    public claimDue(input: { now: Date; workerId: string }): Promise<ClaimedAccountPurge | null> {
        return this.database.transaction(async (tx) => {
            const [request] = await tx.select({
                fencingToken: accountDeletionRequestsTable.fencingToken,
                state: accountDeletionRequestsTable.state,
                userId: accountDeletionRequestsTable.userId,
            }).from(accountDeletionRequestsTable).where(or(
                and(eq(accountDeletionRequestsTable.state, 'pending'), lte(accountDeletionRequestsTable.nextAttemptAt, input.now)),
                and(eq(accountDeletionRequestsTable.state, 'running'), lte(accountDeletionRequestsTable.leaseDeadline, input.now)),
            )).orderBy(accountDeletionRequestsTable.nextAttemptAt, accountDeletionRequestsTable.userId).limit(1).for('update', { skipLocked: true });
            if (!request) return null;
            const [user] = await tx.select({ status: usersTable.status }).from(usersTable)
                .where(eq(usersTable.id, request.userId)).limit(1).for('update');
            if (user?.status !== 'deletion_pending') {
                throw new Error('Due purge request does not belong to a deletion-pending account.');
            }
            const nextToken = request.fencingToken + 1;
            const [claimed] = await tx.update(accountDeletionRequestsTable).set({
                attemptCount: sql`${accountDeletionRequestsTable.attemptCount} + 1`,
                fencingToken: nextToken,
                leaseDeadline: new Date(input.now.getTime() + leaseMs),
                leaseWorkerId: input.workerId,
                state: 'running',
                updatedAt: input.now,
            }).where(eq(accountDeletionRequestsTable.userId, request.userId))
                .returning({ userId: accountDeletionRequestsTable.userId });
            return claimed ? { fencingToken: nextToken, userId: claimed.userId } : null;
        });
    }

    public async inspectOwner(input: ClaimedAccountPurge) {
        const [active, objects] = await Promise.all([
            this.database.select({ count: sql<number>`count(*)::int` }).from(dictionaryGenerationJobsTable).where(and(
                eq(dictionaryGenerationJobsTable.ownerId, input.userId),
                inArray(dictionaryGenerationJobsTable.executionState, ['queued', 'running']),
            )),
            this.database.select({
                cleanupState: dictionaryDocumentUploadsTable.cleanupState,
                objectKey: dictionaryDocumentUploadsTable.objectKey,
            }).from(dictionaryDocumentUploadsTable)
                .where(eq(dictionaryDocumentUploadsTable.ownerId, input.userId)),
        ]);
        return { activeJobs: active[0]?.count ?? 0, objects };
    }

    public async renew(input: ClaimedAccountPurge & { now: Date; workerId: string }): Promise<boolean> {
        const [renewed] = await this.database.update(accountDeletionRequestsTable).set({
            leaseDeadline: new Date(input.now.getTime() + leaseMs),
            updatedAt: input.now,
        }).where(and(
            eq(accountDeletionRequestsTable.userId, input.userId),
            eq(accountDeletionRequestsTable.fencingToken, input.fencingToken),
            eq(accountDeletionRequestsTable.leaseWorkerId, input.workerId),
            eq(accountDeletionRequestsTable.state, 'running'),
            sql`${accountDeletionRequestsTable.leaseDeadline} > ${input.now}`,
        )).returning({ userId: accountDeletionRequestsTable.userId });
        return Boolean(renewed);
    }

    public async finish(input: ClaimedAccountPurge & { now: Date; workerId: string }): Promise<boolean> {
        return this.database.transaction(async (tx) => {
            const [request] = await tx.select({
                fencingToken: accountDeletionRequestsTable.fencingToken,
                leaseDeadline: accountDeletionRequestsTable.leaseDeadline,
                leaseWorkerId: accountDeletionRequestsTable.leaseWorkerId,
                state: accountDeletionRequestsTable.state,
            }).from(accountDeletionRequestsTable).where(eq(accountDeletionRequestsTable.userId, input.userId))
                .limit(1).for('update');
            if (request?.state !== 'running' || request.fencingToken !== input.fencingToken ||
                request.leaseWorkerId !== input.workerId || !request.leaseDeadline || request.leaseDeadline <= input.now) return false;
            const [user] = await tx.select({ status: usersTable.status }).from(usersTable)
                .where(eq(usersTable.id, input.userId)).limit(1).for('update');
            if (user?.status !== 'deletion_pending') return false;
            const [active] = await tx.select({ count: sql<number>`count(*)::int` })
                .from(dictionaryGenerationJobsTable).where(and(
                    eq(dictionaryGenerationJobsTable.ownerId, input.userId),
                    inArray(dictionaryGenerationJobsTable.executionState, ['queued', 'running']),
                ));
            const [unclean] = await tx.select({ count: sql<number>`count(*)::int` })
                .from(dictionaryDocumentUploadsTable).where(and(
                    eq(dictionaryDocumentUploadsTable.ownerId, input.userId),
                    or(
                        sql`${dictionaryDocumentUploadsTable.cleanupState} <> 'complete'`,
                        gt(dictionaryDocumentUploadsTable.capabilityExpiresAt, input.now),
                    ),
                ));
            if ((active?.count ?? 0) > 0 || (unclean?.count ?? 0) > 0) {
                throw new Error('Owner jobs or physical document cleanup are not terminal.');
            }

            // Child rows are removed in FK order. Audit and membership rows retain only
            // opaque user IDs, allowing the user row to remain as a minimal tombstone.
            await tx.delete(dictionaryDocumentExtractionsTable).where(sql`${dictionaryDocumentExtractionsTable.uploadId} in (select id from dictionary_document_uploads where owner_id = ${input.userId})`);
            await tx.delete(dictionaryGenerationProposalsTable).where(sql`${dictionaryGenerationProposalsTable.jobId} in (select id from dictionary_generation_jobs where owner_id = ${input.userId})`);
            await tx.delete(dictionaryDocumentObjectVersionsTable).where(sql`${dictionaryDocumentObjectVersionsTable.uploadId} in (select id from dictionary_document_uploads where owner_id = ${input.userId})`);
            await tx.delete(dictionaryDocumentUploadsTable).where(eq(dictionaryDocumentUploadsTable.ownerId, input.userId));
            await tx.delete(dictionaryCardRevisionsTable).where(sql`${dictionaryCardRevisionsTable.dictionaryId} in (select id from dictionaries where owner_id = ${input.userId})`);
            await tx.delete(dictionaryGenerationJobsTable).where(eq(dictionaryGenerationJobsTable.ownerId, input.userId));
            await tx.delete(dictionaryIdempotencyKeysTable).where(eq(dictionaryIdempotencyKeysTable.ownerId, input.userId));
            await tx.delete(dictionariesTable).where(eq(dictionariesTable.ownerId, input.userId));
            await tx.delete(authVerificationChallengesTable).where(eq(authVerificationChallengesTable.userId, input.userId));
            await tx.delete(authPasskeysTable).where(eq(authPasskeysTable.userId, input.userId));
            await tx.delete(passwordCredentialsTable).where(eq(passwordCredentialsTable.userId, input.userId));
            await tx.delete(authSessionsTable).where(eq(authSessionsTable.userId, input.userId));
            await tx.delete(userEmailsTable).where(eq(userEmailsTable.userId, input.userId));
            await tx.update(authSecurityEventsTable).set({ metadata: {} }).where(eq(authSecurityEventsTable.userId, input.userId));
            await tx.update(adminAuditEventsTable).set({ metadata: {}, reason: null }).where(or(
                eq(adminAuditEventsTable.actorUserId, input.userId),
                eq(adminAuditEventsTable.targetUserId, input.userId),
            ));
            await tx.update(adminMembershipsTable).set({
                grantReason: 'Account purged',
                revokeReason: sql`case when ${adminMembershipsTable.revokedAt} is null then null else 'Account purged' end`,
                updatedAt: input.now,
            }).where(or(
                eq(adminMembershipsTable.userId, input.userId),
                eq(adminMembershipsTable.grantedByUserId, input.userId),
                eq(adminMembershipsTable.revokedByUserId, input.userId),
            ));
            await tx.update(usersTable).set({
                handle: null,
                status: 'purged',
                updatedAt: input.now,
                version: sql`${usersTable.version} + 1`,
            }).where(eq(usersTable.id, input.userId));
            await tx.update(accountDeletionRequestsTable).set({
                completedAt: input.now,
                leaseDeadline: null,
                leaseWorkerId: null,
                state: 'complete',
                updatedAt: input.now,
            }).where(eq(accountDeletionRequestsTable.userId, input.userId));
            return true;
        });
    }

    public async retry(input: ClaimedAccountPurge & { now: Date; workerId: string }): Promise<void> {
        await this.database.update(accountDeletionRequestsTable).set({
            leaseDeadline: null,
            leaseWorkerId: null,
            nextAttemptAt: new Date(input.now.getTime() + retryMs),
            state: 'pending',
            updatedAt: input.now,
        }).where(and(
            eq(accountDeletionRequestsTable.userId, input.userId),
            eq(accountDeletionRequestsTable.fencingToken, input.fencingToken),
            eq(accountDeletionRequestsTable.leaseWorkerId, input.workerId),
            eq(accountDeletionRequestsTable.state, 'running'),
        ));
    }

    public async releaseWorkerLeases(input: { now: Date; workerId: string }): Promise<void> {
        await this.database.update(accountDeletionRequestsTable).set({
            leaseDeadline: null,
            leaseWorkerId: null,
            nextAttemptAt: input.now,
            state: 'pending',
            updatedAt: input.now,
        }).where(and(
            eq(accountDeletionRequestsTable.leaseWorkerId, input.workerId),
            eq(accountDeletionRequestsTable.state, 'running'),
        ));
    }
}
