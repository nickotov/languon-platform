import type {
    AdminActor,
    AdminAuditAction,
    AdminSentenceDictionaryQuery,
    AdminSentenceLibraryQuery,
    AdminSentenceLibrarySnapshotRequest,
    AdminSentenceLibraryMutationRequest,
    AdminAiCreditAdjustmentRequest,
    AdminAiCreditPolicyMutationRequest,
    AdminAiCreditsQuery,
    AdminAiSettingsMutationRequest,
    AdminAuditEventsQuery,
    AdminReason,
    AdminUserStatusMutationRequest,
    AdminUsersQuery,
    AdminUserStatus,
} from '@languon/contracts';

import type { AuthenticationService } from '../../authentication/application/authentication-service';
import { RecentAuthenticationRequiredError } from '../../authentication/application/authentication-errors';
import type { AccessTokenSigner } from '../../authentication/application/ports/access-token';
import type { AdminSentenceLibrary } from './ports/admin-sentence-library';
import { SentenceLibraryDeletionBusyError } from '../../learning/application/ports/sentence-library-store';
import {
    SentenceConflictError,
    SentenceUnavailableError,
} from '../../learning/domain/sentence-errors';
import { AdminSentenceLibraryUnavailableError } from './administration-errors';
import type { Clock } from '../../authentication/application/ports/clock';
import type { IdGenerator } from '../../authentication/application/ports/id-generator';
import {
    AdminAccessDeniedError,
    AdminAiCreditAccountConflictError,
    AdminAiCreditAdjustmentExceedsAvailableError,
    AdminAiCreditInvalidRequestError,
    AdminAiCreditTargetUnavailableError,
    AdminAiSettingsConflictError,
    AdminAiSettingsUnavailableError,
    AdminDeletionCancellationUnavailableError,
    AdminLastOwnerForbiddenError,
    AdminSelfDisableForbiddenError,
    AdminUserNotFoundError,
    AdminUserStateConflictError,
} from './administration-errors';
import type {
    AdministrationStore,
    AdminAiCreditMutationRejection,
    AdminAiSettingsMutationInput,
    AdminUserMutationInput,
} from './ports/administration-store';

const auditRetentionMilliseconds = 365 * 24 * 60 * 60 * 1_000;

export interface AdministrationServiceDependencies {
    accessTokens: AccessTokenSigner;
    authentication: AuthenticationService;
    clock: Clock;
    ids: IdGenerator;
    store: AdministrationStore;
    sentenceLibrary?: AdminSentenceLibrary;
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

    public async aiSettings(accessToken: string) {
        await this.authorize(accessToken);
        return this.dependencies.store.aiSettings();
    }

    public async aiCredits(
        accessToken: string,
        targetUserId: string,
        query: AdminAiCreditsQuery,
    ) {
        await this.authorize(accessToken);
        return this.dependencies.store.aiCredits(
            targetUserId,
            query,
            this.dependencies.clock.now(),
        );
    }

    public async updateAiCreditPolicy(
        accessToken: string,
        targetUserId: string,
        input: AdminAiCreditPolicyMutationRequest,
        correlationId: string,
    ) {
        return this.mutateAiCredits(
            'ai_credit_policy_updated',
            accessToken,
            targetUserId,
            input,
            correlationId,
        );
    }

    public async adjustAiCredits(
        accessToken: string,
        targetUserId: string,
        input: AdminAiCreditAdjustmentRequest,
        correlationId: string,
    ) {
        return this.mutateAiCredits(
            'ai_credits_adjusted',
            accessToken,
            targetUserId,
            input,
            correlationId,
        );
    }

    public async updateAiSettings(
        accessToken: string,
        input: AdminAiSettingsMutationRequest,
        correlationId: string,
    ) {
        const principal = await this.authorize(accessToken, correlationId);
        try {
            await this.requireRecent(principal);
            const occurredAt = this.dependencies.clock.now();
            const mutation: AdminAiSettingsMutationInput = {
                ...input,
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
                revisionId: this.dependencies.ids.generate(),
            };
            return await this.dependencies.store.updateAiSettings(mutation);
        } catch (error) {
            if (!(
                error instanceof AdminAiSettingsConflictError ||
                error instanceof AdminAiSettingsUnavailableError ||
                error instanceof RecentAuthenticationRequiredError ||
                error instanceof AdminAccessDeniedError
            )) {
                throw error;
            }
            const current = await this.dependencies.store.aiSettings();
            await this.recordRejected({
                action: 'ai_settings_updated',
                actorUserId: principal.actor.id,
                ...(current.settings.version > 0
                    ? { beforeVersion: current.settings.version }
                    : {}),
                correlationId,
                metadata: {
                    expectedVersion: input.expectedVersion,
                    rejection:
                        error instanceof AdminAiSettingsConflictError
                            ? 'ai_settings_conflict'
                            : error instanceof AdminAiSettingsUnavailableError
                              ? 'capability_unavailable'
                              : error instanceof
                                  RecentAuthenticationRequiredError
                                ? 'recent_authentication_required'
                                : 'admin_access_denied',
                    targetKind: 'dictionary_ai_configuration',
                    targetId: 'global',
                },
                reason: input.reason,
            });
            throw error;
        }
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

    private async mutateAiCredits(
        action: 'ai_credit_policy_updated' | 'ai_credits_adjusted',
        accessToken: string,
        targetUserId: string,
        input:
            AdminAiCreditPolicyMutationRequest | AdminAiCreditAdjustmentRequest,
        correlationId: string,
    ) {
        const principal = await this.authorize(accessToken, correlationId);
        try {
            await this.requireRecent(principal);
        } catch (error) {
            if (!(error instanceof RecentAuthenticationRequiredError)) {
                throw error;
            }
            const target = await this.dependencies.store.findUser(targetUserId);
            await this.recordRejected({
                action,
                actorUserId: principal.actor.id,
                correlationId,
                metadata: {
                    expectedVersion: input.expectedVersion,
                    rejection: 'recent_authentication_required',
                    requestedTargetUserId: targetUserId,
                    targetId: targetUserId,
                    targetKind: 'ai_credit_account',
                },
                reason: input.reason,
                ...(target ? { targetUserId: target.id } : {}),
            });
            throw error;
        }
        const occurredAt = this.dependencies.clock.now();
        const common = {
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
            targetUserId,
        };
        const result =
            action === 'ai_credit_policy_updated'
                ? await this.dependencies.store.updateAiCreditPolicy({
                      ...common,
                      ...(input as AdminAiCreditPolicyMutationRequest),
                  })
                : await this.dependencies.store.adjustAiCredits({
                      ...common,
                      ...(input as AdminAiCreditAdjustmentRequest),
                  });
        if (result.ok) return result.response;
        throw creditMutationError(result.rejection);
    }

    async sentenceDictionaries(
        accessToken: string,
        targetUserId: string,
        query: AdminSentenceDictionaryQuery,
        correlationId: string,
    ) {
        const principal = await this.authorize(accessToken);
        const scope = {
            actorId: principal.actor.id,
            actorSessionId: principal.sessionId,
            targetUserId,
            audit: {
                id: this.dependencies.ids.generate(),
                correlationId,
                expiresAt: new Date(
                    this.dependencies.clock.now().getTime() +
                        auditRetentionMilliseconds,
                ),
            },
        };
        return this.requireSentenceLibrary().adminDictionaries(
            scope,
            query,
            this.sentenceLibraryContext(),
        );
    }

    async sentenceLibraryList(
        accessToken: string,
        targetUserId: string,
        dictionaryId: string,
        query: AdminSentenceLibraryQuery,
        correlationId: string,
    ) {
        const principal = await this.authorize(accessToken);
        const library = this.requireSentenceLibrary();
        return library.adminList(
            this.sentenceLibraryScope(
                principal,
                targetUserId,
                dictionaryId,
                correlationId,
            ),
            query,
            this.sentenceLibraryContext(),
        );
    }

    async sentenceLibraryDetail(
        accessToken: string,
        targetUserId: string,
        dictionaryId: string,
        exerciseId: string,
        correlationId: string,
    ) {
        const principal = await this.authorize(accessToken);
        const library = this.requireSentenceLibrary();
        return library.adminDetail(
            this.sentenceLibraryScope(
                principal,
                targetUserId,
                dictionaryId,
                correlationId,
            ),
            exerciseId,
            this.sentenceLibraryContext(),
        );
    }

    async sentenceLibrarySnapshot(
        accessToken: string,
        targetUserId: string,
        dictionaryId: string,
        input: AdminSentenceLibrarySnapshotRequest,
        correlationId: string,
    ) {
        const principal = await this.authorize(accessToken);
        await this.requireRecent(principal);
        return this.requireSentenceLibrary().adminSnapshot(
            this.sentenceLibraryScope(
                principal,
                targetUserId,
                dictionaryId,
                correlationId,
            ),
            input,
            this.sentenceLibraryContext(),
        );
    }

    async mutateSentenceLibrary(
        accessToken: string,
        targetUserId: string,
        dictionaryId: string,
        input: AdminSentenceLibraryMutationRequest,
        correlationId: string,
    ) {
        const principal = await this.authorize(accessToken);
        try {
            await this.requireRecent(principal);
            return await this.requireSentenceLibrary().adminMutate(
                this.sentenceLibraryScope(
                    principal,
                    targetUserId,
                    dictionaryId,
                    correlationId,
                ),
                input,
                this.sentenceLibraryContext(),
            );
        } catch (error) {
            const code =
                error instanceof SentenceLibraryDeletionBusyError
                    ? 'sentence_library_deletion_busy'
                    : error instanceof SentenceConflictError
                      ? 'sentence_library_conflict'
                      : error instanceof SentenceUnavailableError ||
                          error instanceof AdminSentenceLibraryUnavailableError
                        ? 'sentence_library_unavailable'
                        : isAuditableMutationRejection(error)
                          ? rejectionCode(error)
                          : null;
            const target = code
                ? await this.dependencies.store.findUser(targetUserId)
                : null;
            if (code)
                await this.recordRejected({
                    action: sentenceLibraryAuditAction(input.operation),
                    actorUserId: principal.actor.id,
                    ...(target ? { targetUserId } : {}),
                    correlationId,
                    reason: input.reason,
                    metadata: {
                        targetKind: 'sentence_library',
                        requestedTargetUserId: targetUserId,
                        dictionaryId,
                        operationId: input.operationId,
                        selectionKind: input.selection.type,
                        code,
                    },
                });
            throw error;
        }
    }

    private requireSentenceLibrary(): AdminSentenceLibrary {
        if (!this.dependencies.sentenceLibrary)
            throw new AdminSentenceLibraryUnavailableError();
        return this.dependencies.sentenceLibrary;
    }

    private sentenceLibraryScope(
        principal: AdminPrincipal,
        targetUserId: string,
        dictionaryId: string,
        correlationId: string,
    ) {
        return {
            actorId: principal.actor.id,
            actorSessionId: principal.sessionId,
            targetUserId,
            dictionaryId,
            audit: {
                id: this.dependencies.ids.generate(),
                correlationId,
                expiresAt: new Date(
                    this.dependencies.clock.now().getTime() +
                        auditRetentionMilliseconds,
                ),
            },
        };
    }

    private sentenceLibraryContext() {
        return {
            now: this.dependencies.clock.now(),
            signal: new AbortController().signal,
        };
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
        action: AdminAuditAction;
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

function creditMutationError(rejection: AdminAiCreditMutationRejection): Error {
    if (rejection === 'account_conflict') {
        return new AdminAiCreditAccountConflictError();
    }
    if (rejection === 'adjustment_exceeds_available') {
        return new AdminAiCreditAdjustmentExceedsAvailableError();
    }
    if (rejection === 'target_unavailable') {
        return new AdminAiCreditTargetUnavailableError();
    }
    if (rejection === 'invalid_request') {
        return new AdminAiCreditInvalidRequestError(
            'The AI credit mutation is invalid.',
        );
    }
    if (rejection === 'recent_authentication_required') {
        return new RecentAuthenticationRequiredError();
    }
    return new AdminAccessDeniedError();
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

export function sentenceLibraryAuditAction(
    operation: AdminSentenceLibraryMutationRequest['operation'],
): AdminAuditAction {
    switch (operation) {
        case 'archive':
            return 'sentence_personally_archived';
        case 'restore':
            return 'sentence_personally_restored';
        case 'global-archive':
            return 'sentence_globally_archived';
        case 'global-restore':
            return 'sentence_globally_restored';
        case 'delete':
            return 'sentence_permanently_deleted';
    }
}
