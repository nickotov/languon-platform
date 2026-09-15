import type { AccountDeletionRecoveryJournal } from '../../application/ports/account-deletion-recovery-journal';
import type { JournalEvent } from './account-deletion-journal-codec';
import type { RecoveryReader } from './account-deletion-recovery-gate';

/** Deterministic development/test adapter. Never use for staging or production restore protection. */
export class InMemoryAccountDeletionRecoveryJournal implements AccountDeletionRecoveryJournal, RecoveryReader {
    private readonly events: JournalEvent[] = [];

    public async recordBlockingIntent(event: { scheduledAt: Date; userId: string; userVersion: number }): Promise<void> {
        this.events.push({ kind: 'blocking', occurredAt: event.scheduledAt.toISOString(), userId: event.userId, userVersion: event.userVersion });
    }

    public async recordCancellation(event: { cancelledAt: Date; userId: string; userVersion: number }): Promise<void> {
        this.events.push({ kind: 'cancellation', occurredAt: event.cancelledAt.toISOString(), userId: event.userId, userVersion: event.userVersion });
    }

    public async recordCommittedDeletion(event: { scheduledAt: Date; userId: string; userVersion: number }): Promise<void> {
        this.events.push({ kind: 'committed', occurredAt: event.scheduledAt.toISOString(), userId: event.userId, userVersion: event.userVersion });
    }

    public async readAll(): Promise<JournalEvent[]> {
        return this.events.map((event) => ({ ...event }));
    }
}
