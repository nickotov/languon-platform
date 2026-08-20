import { randomUUID } from 'node:crypto';

import { and, count, eq, isNull, lte, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import { EmailAddress } from '../../../../users/domain/email-address';
import {
    userEmailsTable,
    usersTable,
} from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    AdminLastOwnerForbiddenError,
    AdminMembershipConflictError,
    AdminOperatorActorRequiredError,
    AdminUserNotFoundError,
} from '../../../application/administration-errors';
import { activeOwnerMutationLock } from './owner-lock';
import { adminAuditEventsTable, adminMembershipsTable } from './schema';

type AdministrationDatabase = PostgresJsDatabase<typeof databaseSchema>;
type AdministrationTransaction = Parameters<
    Parameters<AdministrationDatabase['transaction']>[0]
>[0];

export interface MembershipMutationInput {
    actorEmail?: string;
    email: string;
    now: Date;
    reason: string;
}

interface MembershipMutationRejection {
    action: 'membership_granted' | 'membership_revoked';
    actorUserId: string;
    error:
        | AdminLastOwnerForbiddenError
        | AdminMembershipConflictError
        | AdminUserNotFoundError;
    metadata: Record<string, unknown>;
    targetUserId?: string;
}

export class DrizzleAdministrationOperator {
    public constructor(private readonly database: AdministrationDatabase) {}

    public async grant(input: MembershipMutationInput) {
        const result = await this.database.transaction(async (transaction) => {
            await lockOwners(transaction);
            const target = await findUserByEmail(transaction, input.email);
            const activeOwners = await ownerCount(transaction);
            const actor =
                activeOwners === 0
                    ? requireBootstrapTarget(target)
                    : await requireActor(transaction, input.actorEmail);
            if (!target || target.status !== 'active' || !target.verifiedAt) {
                return rejection({
                    action: 'membership_granted',
                    actorUserId: actor.id,
                    error: new AdminUserNotFoundError(),
                    metadata: {
                        activeOwnerCount: activeOwners,
                        rejection: 'user_not_found_or_ineligible',
                        requestedTargetEmail: input.email.toLowerCase(),
                    },
                    ...(target ? { targetUserId: target.id } : {}),
                });
            }
            const existing = await activeMembership(transaction, target.id);
            if (existing) {
                return rejection({
                    action: 'membership_granted',
                    actorUserId: actor.id,
                    error: new AdminMembershipConflictError(
                        'The user already has an active owner membership.',
                    ),
                    metadata: {
                        activeOwnerCount: activeOwners,
                        membershipId: existing.id,
                        rejection: 'membership_already_active',
                        targetStatus: target.status,
                        targetVersion: target.version,
                    },
                    targetUserId: target.id,
                });
            }
            const membershipId = randomUUID();
            await transaction.insert(adminMembershipsTable).values({
                grantReason: input.reason,
                grantedAt: input.now,
                grantedByUserId: actor.id,
                id: membershipId,
                role: 'owner',
                updatedAt: input.now,
                userId: target.id,
            });
            await writeMembershipAudit(transaction, {
                action: 'membership_granted',
                actorUserId: actor.id,
                membershipId,
                now: input.now,
                reason: input.reason,
                targetUserId: target.id,
            });
            return success({
                actorEmail: actor.email.toLowerCase(),
                email: target.email.toLowerCase(),
                grantedAt: input.now.toISOString(),
                id: membershipId,
                role: 'owner' as const,
            });
        });
        if (result.outcome === 'rejected') {
            await writeMembershipRejectedAudit(this.database, input, result);
            throw result.error;
        }
        return result.value;
    }

    public async revoke(input: MembershipMutationInput) {
        const result = await this.database.transaction(async (transaction) => {
            await lockOwners(transaction);
            const actor = await requireActor(transaction, input.actorEmail);
            const target = await findUserByEmail(transaction, input.email);
            if (!target) {
                return rejection({
                    action: 'membership_revoked',
                    actorUserId: actor.id,
                    error: new AdminUserNotFoundError(),
                    metadata: {
                        rejection: 'user_not_found',
                        requestedTargetEmail: input.email.toLowerCase(),
                    },
                });
            }
            const membership = await activeMembership(transaction, target.id);
            if (!membership) {
                return rejection({
                    action: 'membership_revoked',
                    actorUserId: actor.id,
                    error: new AdminMembershipConflictError(
                        'The user has no active owner membership.',
                    ),
                    metadata: {
                        rejection: 'membership_not_active',
                        targetStatus: target.status,
                        targetVersion: target.version,
                    },
                    targetUserId: target.id,
                });
            }
            const activeOwners = await ownerCount(transaction);
            if (activeOwners <= 1) {
                return rejection({
                    action: 'membership_revoked',
                    actorUserId: actor.id,
                    error: new AdminLastOwnerForbiddenError(),
                    metadata: {
                        activeOwnerCount: activeOwners,
                        membershipId: membership.id,
                        rejection: 'last_owner_forbidden',
                        targetStatus: target.status,
                        targetVersion: target.version,
                    },
                    targetUserId: target.id,
                });
            }
            await transaction
                .update(adminMembershipsTable)
                .set({
                    revokedAt: input.now,
                    revokedByUserId: actor.id,
                    revokeReason: input.reason,
                    updatedAt: input.now,
                })
                .where(eq(adminMembershipsTable.id, membership.id));
            await writeMembershipAudit(transaction, {
                action: 'membership_revoked',
                actorUserId: actor.id,
                membershipId: membership.id,
                now: input.now,
                reason: input.reason,
                targetUserId: target.id,
            });
            return success({
                actorEmail: actor.email.toLowerCase(),
                email: target.email.toLowerCase(),
                id: membership.id,
                revokedAt: input.now.toISOString(),
                role: 'owner' as const,
            });
        });
        if (result.outcome === 'rejected') {
            await writeMembershipRejectedAudit(this.database, input, result);
            throw result.error;
        }
        return result.value;
    }

    public async list() {
        const rows = await this.database
            .select({
                email: userEmailsTable.email,
                grantedAt: adminMembershipsTable.grantedAt,
                id: adminMembershipsTable.id,
                role: adminMembershipsTable.role,
                userId: adminMembershipsTable.userId,
            })
            .from(adminMembershipsTable)
            .innerJoin(
                userEmailsTable,
                and(
                    eq(userEmailsTable.userId, adminMembershipsTable.userId),
                    eq(userEmailsTable.isPrimary, true),
                ),
            )
            .where(isNull(adminMembershipsTable.revokedAt))
            .orderBy(adminMembershipsTable.grantedAt);
        return rows.map((row) => ({
            ...row,
            email: row.email.toLowerCase(),
            grantedAt: row.grantedAt.toISOString(),
        }));
    }

    public prune(input: { actorEmail: string; now: Date; reason: string }) {
        return this.database.transaction(async (transaction) => {
            await lockOwners(transaction);
            const actor = await requireActor(transaction, input.actorEmail);
            const removed = await transaction
                .delete(adminAuditEventsTable)
                .where(lte(adminAuditEventsTable.expiresAt, input.now))
                .returning({ id: adminAuditEventsTable.id });
            await transaction.insert(adminAuditEventsTable).values({
                action: 'audit_pruned',
                actorUserId: actor.id,
                correlationId: randomUUID(),
                expiresAt: auditExpiry(input.now),
                id: randomUUID(),
                metadata: { removedCount: removed.length },
                occurredAt: input.now,
                outcome: 'success',
                reason: input.reason,
            });
            return {
                prunedAt: input.now.toISOString(),
                removed: removed.length,
            };
        });
    }
}

async function lockOwners(transaction: AdministrationTransaction) {
    await transaction.execute(
        sql`select pg_advisory_xact_lock(${activeOwnerMutationLock})`,
    );
}

async function activeMembership(
    transaction: AdministrationTransaction,
    userId: string,
) {
    const [membership] = await transaction
        .select({ id: adminMembershipsTable.id })
        .from(adminMembershipsTable)
        .where(
            and(
                eq(adminMembershipsTable.userId, userId),
                isNull(adminMembershipsTable.revokedAt),
            ),
        )
        .limit(1);
    return membership ?? null;
}

async function ownerCount(transaction: AdministrationTransaction) {
    const [result] = await transaction
        .select({ value: count() })
        .from(adminMembershipsTable)
        .innerJoin(usersTable, eq(usersTable.id, adminMembershipsTable.userId))
        .where(
            and(
                isNull(adminMembershipsTable.revokedAt),
                eq(usersTable.status, 'active'),
            ),
        );
    return result?.value ?? 0;
}

async function requireActor(
    transaction: AdministrationTransaction,
    actorEmail: string | undefined,
) {
    if (!actorEmail) throw new AdminOperatorActorRequiredError();
    const actor = await findUserByEmail(transaction, actorEmail);
    if (
        !actor ||
        actor.status !== 'active' ||
        !actor.verifiedAt ||
        !(await activeMembership(transaction, actor.id))
    ) {
        throw new AdminOperatorActorRequiredError();
    }
    return actor;
}

async function findUserByEmail(
    transaction: AdministrationTransaction,
    email: string,
) {
    const canonical = EmailAddress.create(email).canonicalValue;
    const [user] = await transaction
        .select({
            email: userEmailsTable.email,
            id: usersTable.id,
            status: usersTable.status,
            verifiedAt: userEmailsTable.verifiedAt,
            version: usersTable.version,
        })
        .from(usersTable)
        .innerJoin(
            userEmailsTable,
            and(
                eq(userEmailsTable.userId, usersTable.id),
                eq(userEmailsTable.isPrimary, true),
            ),
        )
        .where(eq(userEmailsTable.canonicalEmail, canonical))
        .limit(1)
        .for('update');
    return user ?? null;
}

function requireBootstrapTarget(
    target: Awaited<ReturnType<typeof findUserByEmail>>,
) {
    if (!target || target.status !== 'active' || !target.verifiedAt) {
        throw new AdminUserNotFoundError();
    }
    return target;
}

function success<T>(value: T) {
    return { outcome: 'success' as const, value };
}

function rejection(input: MembershipMutationRejection) {
    return { outcome: 'rejected' as const, ...input };
}

async function writeMembershipRejectedAudit(
    database: AdministrationDatabase,
    input: MembershipMutationInput,
    rejectionInput: MembershipMutationRejection,
) {
    await database.insert(adminAuditEventsTable).values({
        action: rejectionInput.action,
        actorUserId: rejectionInput.actorUserId,
        correlationId: randomUUID(),
        expiresAt: auditExpiry(input.now),
        id: randomUUID(),
        metadata: rejectionInput.metadata,
        occurredAt: input.now,
        outcome: 'rejected',
        reason: input.reason,
        ...(rejectionInput.targetUserId
            ? { targetUserId: rejectionInput.targetUserId }
            : {}),
    });
}

async function writeMembershipAudit(
    transaction: AdministrationTransaction,
    input: {
        action: 'membership_granted' | 'membership_revoked';
        actorUserId: string;
        membershipId: string;
        now: Date;
        reason: string;
        targetUserId: string;
    },
) {
    await transaction.insert(adminAuditEventsTable).values({
        action: input.action,
        actorUserId: input.actorUserId,
        correlationId: randomUUID(),
        expiresAt: auditExpiry(input.now),
        id: randomUUID(),
        metadata: { membershipId: input.membershipId },
        occurredAt: input.now,
        outcome: 'success',
        reason: input.reason,
        targetUserId: input.targetUserId,
    });
}

function auditExpiry(now: Date): Date {
    return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1_000);
}
