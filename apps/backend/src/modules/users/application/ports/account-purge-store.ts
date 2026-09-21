export interface ClaimedAccountPurge {
    fencingToken: number;
    userId: string;
}

export interface OwnedDocumentObject {
    kind?: 'document';
    cleanupState: string;
    objectKey: string;
}

export interface OwnedAudioObject {
    kind: 'pronunciation-audio';
    cleanupState: string;
    reference: {
        backend: 'postgres' | 's3';
        namespace: string;
        key: string;
        versionId?: string;
    };
}

export interface AccountPurgeStore {
    claimDue(input: {
        now: Date;
        workerId: string;
    }): Promise<ClaimedAccountPurge | null>;
    inspectOwner(input: ClaimedAccountPurge): Promise<{
        activeJobs: number;
        objects: (OwnedDocumentObject | OwnedAudioObject)[];
    }>;
    renew(
        input: ClaimedAccountPurge & { now: Date; workerId: string },
    ): Promise<boolean>;
    finish(
        input: ClaimedAccountPurge & {
            now: Date;
            workerId: string;
        },
    ): Promise<boolean>;
    retry(
        input: ClaimedAccountPurge & {
            now: Date;
            workerId: string;
        },
    ): Promise<void>;
    releaseWorkerLeases(input: { now: Date; workerId: string }): Promise<void>;
}

export interface AccountPurgeObjectStorage {
    removeAllVersions(objectKey: string, signal: AbortSignal): Promise<void>;
    removeAudioVersions?(
        reference: OwnedAudioObject['reference'],
        signal: AbortSignal,
    ): Promise<void>;
}
