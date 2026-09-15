export interface DeletionBlockingEvent {
    scheduledAt: Date;
    userId: string;
    userVersion: number;
}

export interface DeletionCancellationEvent {
    cancelledAt: Date;
    userId: string;
    userVersion: number;
}

/**
 * Stored outside PostgreSQL so a historical database restore cannot silently
 * reactivate an account that was removed after the selected backup snapshot.
 */
export interface AccountDeletionRecoveryJournal {
    recordBlockingIntent(event: DeletionBlockingEvent): Promise<void>;
    recordCommittedDeletion(event: DeletionBlockingEvent): Promise<void>;
    recordCancellation(event: DeletionCancellationEvent): Promise<void>;
}
