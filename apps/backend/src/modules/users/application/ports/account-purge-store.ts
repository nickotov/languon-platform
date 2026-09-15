export interface ClaimedAccountPurge {
    fencingToken: number;
    userId: string;
}

export interface OwnedDocumentObject {
    cleanupState: string;
    objectKey: string;
}

export interface AccountPurgeStore {
    claimDue(input: {
        now: Date;
        workerId: string;
    }): Promise<ClaimedAccountPurge | null>;
    inspectOwner(input: ClaimedAccountPurge): Promise<{
        activeJobs: number;
        objects: OwnedDocumentObject[];
    }>;
    renew(input: ClaimedAccountPurge & { now: Date; workerId: string }): Promise<boolean>;
    finish(input: ClaimedAccountPurge & {
        now: Date;
        workerId: string;
    }): Promise<boolean>;
    retry(input: ClaimedAccountPurge & {
        now: Date;
        workerId: string;
    }): Promise<void>;
    releaseWorkerLeases(input: { now: Date; workerId: string }): Promise<void>;
}

export interface AccountPurgeObjectStorage {
    removeAllVersions(objectKey: string, signal: AbortSignal): Promise<void>;
}
