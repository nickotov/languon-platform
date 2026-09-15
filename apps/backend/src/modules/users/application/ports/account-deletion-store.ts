export interface ScheduledAccountDeletion {
    purgeAt: Date;
    scheduledAt: Date;
    userVersion: number;
}

export interface AccountDeletionStore {
    schedule(input: {
        beforeCommit(userVersion: number, scheduledAt: Date): Promise<void>;
        now: Date;
        purgeAt: Date;
        sessionId: string;
        userId: string;
    }): Promise<ScheduledAccountDeletion>;
}
