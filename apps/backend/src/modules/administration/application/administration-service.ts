import type {
    AdminActor,
    AdminAuditEventsQuery,
    AdminReason,
    AdminUserStatusMutationRequest,
    AdminUsersQuery,
    AdminUserStatus,
} from '@languon/contracts';

import type { AuthenticationService } from '../../authentication/application/authentication-service';
import { RecentAuthenticationRequiredError } from '../../authentication/application/authentication-errors';
import type { AccessTokenSigner } from '../../authentication/application/ports/access-token';
import type { Clock } from '../../authentication/application/ports/clock';
import type { IdGenerator } from '../../authentication/application/ports/id-generator';
import {
    AdminAccessDeniedError,
    AdminDeletionCancellationUnavailableError,
    AdminLastOwnerForbiddenError,
    AdminSelfDisableForbiddenError,
    AdminUserNotFoundError,
    AdminUserStateConflictError,
} from './administration-errors';
import type {
    AdministrationStore,
    AdminUserMutationInput,
} from './ports/administration-store';

const auditRetentionMilliseconds = 365 * 24 * 60 * 60 * 1_000;

export interface AdministrationServiceDependencies {
    accessTokens: AccessTokenSigner;
    authentication: AuthenticationService;
    clock: Clock;
    ids: IdGenerator;
    store: AdministrationStore;
}

interface AdminPrincipal {
    actor: AdminActor;
    sessionId: string;
}

export class AdministrationService {
    public constructor(
        private readonly dependencies: AdministrationServiceDependencies,
    ) {}

    public async currentActor(accessToken: string): Promise<AdminActor> {
        return (await this.authorize(accessToken)).actor;
    }

    public async assertActiveMembership(userId: string, correlationId: string) {
        const membership =
            await this.dependencies.store.findActiveMembership(userId);
        if (membership) return membership;
        await this.recordRejected({
            action: 'access_denied',
            actorUserId: userId,
            correlationId,
            reason: 'Administrator membership is not active',
        });
        throw new AdminAccessDeniedError();
    }

    public async dashboard(accessToken: string) {
        await this.authorize(accessToken);
        return this.dependencies.store.dashboard();
    }

    public async listUsers(accessToken: string, query: AdminUsersQuery) {
        await this.authorize(accessToken);
        return this.dependencies.store.listUsers(query);
    }

    public async user(accessToken: string, userId: string) {
        await this.authorize(accessToken);
        return this.dependencies.store.findUser(userId);
    }

    public async listAuditEvents(
        accessToken: string,
        query: AdminAuditEventsQuery,
    ) {
        await this.authorize(accessToken);
        return this.dependencies.store.listAuditEvents(query);
    }

    public async disableUser(
        accessToken: string,
        targetUserId: string,
        input: AdminUserStatusMutationRequest,
        correlationId: string,
    ) {
        const principal = await this.authorize(accessToken, correlationId);
        if (principal.actor.id === targetUserId) {
            const current =
                await this.dependencies.store.findUser(targetUserId);
            await this.recordRejected({
                action: 'user_disabled',
                actorUserId: principal.actor.id,
                ...(current
                    ? {
                          beforeStatus: current.status,
                          beforeVersion: current.version,
                      }
                    : {}),
                correlationId,
                metadata: {
                    expectedVersion: input.expectedVersion,
                    rejection: 'self_disable_forbidden',
                    requestedTargetUserId: targetUserId,
                },
                reason: input.reason,
                targetUserId,
            });
            throw new AdminSelfDisableForbiddenError();
        }
        return this.mutateUser(
            'user_disabled',
            principal,
            targetUserId,
            input,
            correlationId,
        );
    }

    public async restoreUser(
        accessToken: string,
        targetUserId: string,
        input: AdminUserStatusMutationRequest,
        correlationId: string,
    ) {
        const principal = await this.authorize(accessToken, correlationId);
        return this.mutateUser(
            'user_restored',
            principal,
            targetUserId,
            input,
            correlationId,
        );
    }

    public async cancelUserDeletion(
        accessToken: string,
        targetUserId: string,
        input: AdminUserStatusMutationRequest,
        correlationId: string,
    ) {
        const principal = await this.authorize(accessToken, correlationId);
        return this.mutateUser(
            'user_deletion_cancelled',
            principal,
            targetUserId,
            input,
            correlationId,
        );
    }

    private async authorize(
        accessToken: string,
        correlationId = this.dependencies.ids.generate(),
    ): Promise<AdminPrincipal> {
        const claims = await this.dependencies.accessTokens.verify(accessToken);
        const { account } =
            await this.dependencies.authentication.requireActiveSession({
                sessionId: claims.sessionId,
                userId: claims.userId,
            });
        const membership = await this.assertActiveMembership(
            claims.userId,
            correlationId,
        );
        return {
            actor: {
                id: claims.userId,
                primaryEmail: account.email.toLowerCase(),
                role: membership.role,
            },
            sessionId: claims.sessionId,
        };
    }

    private async mutateUser(
        action: 'user_disabled' | 'user_restored' | 'user_deletion_cancelled',
        principal: AdminPrincipal,
        targetUserId: string,
        input: AdminUserStatusMutationRequest,
        correlationId: string,
    ) {
        try {
            await this.requireRecent(principal);
            const mutation = this.mutationInput(
                principal,
                targetUserId,
                input,
                correlationId,
            );
            if (action === 'user_disabled') {
                return this.dependencies.store.disableUser(mutation);
            }
            if (action === 'user_restored') {
                return this.dependencies.store.restoreUser(mutation);
            }
            return this.dependencies.store.cancelUserDeletion(mutation);
        } catch (error) {
            if (!isAuditableMutationRejection(error)) throw error;
            const current =
                await this.dependencies.store.findUser(targetUserId);
            await this.recordRejected({
                action,
                actorUserId: principal.actor.id,
                ...(current
                    ? {
                          beforeStatus: current.status,
                          beforeVersion: current.version,
                          targetUserId: current.id,
                      }
                    : {}),
                correlationId,
                metadata: {
                    expectedVersion: input.expectedVersion,
                    rejection: rejectionCode(error),
                    requestedTargetUserId: targetUserId,
                },
                reason: input.reason,
            });
            throw error;
        }
    }

    private async requireRecent(principal: AdminPrincipal): Promise<void> {
        await this.dependencies.authentication.requireRecentlyAuthenticatedSession(
            {
                sessionId: principal.sessionId,
                userId: principal.actor.id,
            },
        );
    }

    private mutationInput(
        principal: AdminPrincipal,
        targetUserId: string,
        input: AdminUserStatusMutationRequest,
        correlationId: string,
    ): AdminUserMutationInput {
        const occurredAt = this.dependencies.clock.now();
        return {
            actorSessionId: principal.sessionId,
            actorUserId: principal.actor.id,
            audit: {
                correlationId,
                expiresAt: new Date(
                    occurredAt.getTime() + auditRetentionMilliseconds,
                ),
                id: this.dependencies.ids.generate(),
                occurredAt,
            },
            expectedVersion: input.expectedVersion,
            reason: input.reason,
            targetUserId,
        };
    }

    private async recordRejected(input: {
        action:
            | 'access_denied'
            | 'user_disabled'
            | 'user_restored'
            | 'user_deletion_cancelled';
        actorUserId: string;
        beforeStatus?: AdminUserStatus;
        beforeVersion?: number;
        correlationId: string;
        metadata?: Record<string, unknown>;
        reason: AdminReason | string;
        targetUserId?: string;
    }): Promise<void> {
        const occurredAt = this.dependencies.clock.now();
        await this.dependencies.store.recordAudit({
            action: input.action,
            actorUserId: input.actorUserId,
            ...(input.beforeStatus ? { beforeStatus: input.beforeStatus } : {}),
            ...(input.beforeVersion
                ? { beforeVersion: input.beforeVersion }
                : {}),
            correlationId: input.correlationId,
            expiresAt: new Date(
                occurredAt.getTime() + auditRetentionMilliseconds,
            ),
            id: this.dependencies.ids.generate(),
            ...(input.metadata ? { metadata: input.metadata } : {}),
            occurredAt,
            outcome: 'rejected',
            reason: input.reason,
            ...(input.targetUserId ? { targetUserId: input.targetUserId } : {}),
        });
    }
}

function isAuditableMutationRejection(error: unknown): error is Error {
    return (
        error instanceof AdminAccessDeniedError ||
        error instanceof AdminLastOwnerForbiddenError ||
        error instanceof AdminUserNotFoundError ||
        error instanceof AdminUserStateConflictError ||
        error instanceof AdminDeletionCancellationUnavailableError ||
        error instanceof RecentAuthenticationRequiredError
    );
}

function rejectionCode(error: Error): string {
    if (error instanceof AdminAccessDeniedError) return 'admin_access_denied';
    if (error instanceof AdminLastOwnerForbiddenError)
        return 'last_owner_forbidden';
    if (error instanceof AdminUserNotFoundError) return 'user_not_found';
    if (error instanceof AdminUserStateConflictError)
        return 'user_state_conflict';
    if (error instanceof AdminDeletionCancellationUnavailableError)
        return 'deletion_cancellation_unavailable';
    return 'recent_authentication_required';
}
