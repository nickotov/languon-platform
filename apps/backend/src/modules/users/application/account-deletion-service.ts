import type { AuthenticationService } from '../../authentication/application/authentication-service';

import type { AccountDeletionRecoveryJournal } from './ports/account-deletion-recovery-journal';
import type {
    AccountDeletionStore,
    ScheduledAccountDeletion,
} from './ports/account-deletion-store';
import type { OwnerDeletionPreparation } from './ports/owner-deletion-preparation';

export const accountDeletionGracePeriodMs = 30 * 24 * 60 * 60 * 1_000;

export class AccountDeletionOwnerTransferRequiredError extends Error {
    public constructor() {
        super(
            'Transfer and revoke administrator ownership before removing this account.',
        );
        this.name = 'AccountDeletionOwnerTransferRequiredError';
    }
}

export class AccountDeletionConflictError extends Error {
    public constructor() {
        super('The account changed or deletion is already pending.');
        this.name = 'AccountDeletionConflictError';
    }
}

export class AccountDeletionJournalUnavailableError extends Error {
    public constructor() {
        super('Account removal is temporarily unavailable.');
        this.name = 'AccountDeletionJournalUnavailableError';
    }
}

export class AccountDeletionService {
    public constructor(
        private readonly dependencies: {
            authentication: Pick<
                AuthenticationService,
                'requireRecentlyAuthenticatedSession'
            >;
            clock: { now(): Date };
            journal: AccountDeletionRecoveryJournal;
            preparation: OwnerDeletionPreparation;
            store: AccountDeletionStore;
        },
    ) {}

    public async schedule(input: {
        sessionId: string;
        userId: string;
    }): Promise<ScheduledAccountDeletion> {
        await this.dependencies.authentication.requireRecentlyAuthenticatedSession(
            input,
        );
        const now = this.dependencies.clock.now();
        const purgeAt = new Date(now.getTime() + accountDeletionGracePeriodMs);
        const scheduled = await this.dependencies.store.schedule({
            beforeCommit: async (userVersion, scheduledAt) => {
                try {
                    // Called after the DB locks/preconditions but before its commit.
                    // A failed journal write rolls back removal; a rare SQL failure
                    // after this marker conservatively blocks historical restores.
                    await this.dependencies.journal.recordBlockingIntent({
                        scheduledAt,
                        userId: input.userId,
                        userVersion,
                    });
                } catch {
                    throw new AccountDeletionJournalUnavailableError();
                }
            },
            now,
            purgeAt,
            sessionId: input.sessionId,
            userId: input.userId,
        });
        try {
            await this.dependencies.journal.recordCommittedDeletion({
                scheduledAt: scheduled.scheduledAt,
                userId: input.userId,
                userVersion: scheduled.userVersion,
            });
        } catch {
            // SQL is already committed and access is blocked. The restore gate
            // will fail-stop on an indeterminate intent until reconciled.
            throw new AccountDeletionJournalUnavailableError();
        }
        // Cancellation is an improvement in latency and provider cost, not the
        // authorization boundary. Status and session revocation already committed;
        // the purge worker verifies all work is terminal before erasing data.
        try {
            await this.dependencies.preparation.requestCancellation(
                input.userId,
            );
        } catch {
            // Retry is driven by durable work and purge verification; never undo
            // a successful account-removal transaction after an external failure.
        }
        return scheduled;
    }
}
