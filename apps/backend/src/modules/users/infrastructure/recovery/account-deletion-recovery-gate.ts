import type { JournalEvent } from './account-deletion-journal-codec';

export interface RecoveredUser {
    id: string;
    status: 'active' | 'pending' | 'disabled' | 'deletion_pending' | 'purged';
    version: number;
    deletionState?: 'pending' | 'running' | 'complete' | 'cancelled' | null;
}

export interface RecoveryStore {
    /** Must lock the user, block authentication, restore the purge deadline, and revoke sessions atomically. */
    blockAccount(input: {
        scheduledAt: Date;
        userId: string;
        userVersion: number;
    }): Promise<void>;
    findUser(userId: string): Promise<RecoveredUser | null>;
}

export interface RecoveryReader {
    /** Throws if sentinel, listing, encryption, or any object is unavailable/corrupt. */
    readAll(): Promise<JournalEvent[]>;
}

/**
 * Run after a PostgreSQL restore and before any backend/admin/worker traffic.
 * A future cancellation marker never authorizes an older restored snapshot.
 */
export async function runAccountDeletionRecoveryGate(input: {
    reader: RecoveryReader;
    store: RecoveryStore;
}): Promise<{ blocked: number; inspected: number }> {
    const events = await input.reader.readAll();
    const grouped = new Map<
        string,
        Array<Extract<JournalEvent, { userId: string }>>
    >();
    for (const event of events) {
        if (event.kind === 'sentinel')
            throw new Error('Unexpected deletion journal sentinel.');
        const group = grouped.get(event.userId) ?? [];
        group.push(event);
        grouped.set(event.userId, group);
    }
    let blocked = 0;
    for (const [userId, group] of grouped) {
        const intents = group.filter((event) => event.kind === 'blocking');
        const commits = group.filter((event) => event.kind === 'committed');
        for (const intent of intents) {
            if (
                !commits.some(
                    (commit) =>
                        commit.userVersion === intent.userVersion &&
                        commit.occurredAt === intent.occurredAt,
                )
            ) {
                throw new Error(
                    'Deletion journal has an indeterminate blocking intent; operator reconciliation is required.',
                );
            }
        }
        const blocking = intents.sort(
            (a, b) => b.userVersion - a.userVersion,
        )[0];
        if (!blocking)
            throw new Error('Cancellation without a deletion intent.');
        const cancellation = group
            .filter((event) => event.kind === 'cancellation')
            .sort((a, b) => b.userVersion - a.userVersion)[0];
        const user = await input.store.findUser(userId);
        if (!user || user.status === 'purged') continue;
        const cancellationCommittedInSnapshot =
            cancellation &&
            cancellation.userVersion > blocking.userVersion &&
            user.version >= cancellation.userVersion &&
            user.deletionState === 'cancelled';
        if (cancellationCommittedInSnapshot) continue;
        if (
            user.status === 'deletion_pending' &&
            user.version >= blocking.userVersion &&
            (user.deletionState === 'pending' ||
                user.deletionState === 'running' ||
                user.deletionState === 'complete')
        )
            continue;
        await input.store.blockAccount({
            scheduledAt: new Date(blocking.occurredAt),
            userId,
            userVersion: blocking.userVersion,
        });
        blocked += 1;
    }
    return { blocked, inspected: grouped.size };
}
