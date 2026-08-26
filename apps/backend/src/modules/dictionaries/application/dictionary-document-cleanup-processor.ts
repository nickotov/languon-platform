import type { DictionaryClock } from './dictionary-service';
import type { DictionaryDocumentStore } from './ports/dictionary-document-store';
import type { PrivateDocumentStorage } from './ports/private-document-storage';

class DictionaryDocumentCleanupFenceLostError extends Error {}

export interface DictionaryDocumentCleanupProcessorOptions {
    authorizationSweepLimit?: number;
    leaseDurationMs?: number;
    retryDelayMs?: number;
}

export class DictionaryDocumentCleanupProcessor {
    private readonly authorizationSweepLimit: number;
    private readonly leaseDurationMs: number;
    private readonly retryDelayMs: number;

    public constructor(
        private readonly dependencies: {
            clock: DictionaryClock;
            storage: PrivateDocumentStorage;
            store: DictionaryDocumentStore;
        },
        options: DictionaryDocumentCleanupProcessorOptions = {},
    ) {
        this.authorizationSweepLimit = options.authorizationSweepLimit ?? 100;
        this.leaseDurationMs = options.leaseDurationMs ?? 30_000;
        this.retryDelayMs = options.retryDelayMs ?? 5_000;
        if (
            !Number.isSafeInteger(this.authorizationSweepLimit) ||
            this.authorizationSweepLimit < 1 ||
            this.authorizationSweepLimit > 100 ||
            this.leaseDurationMs < 1_000 ||
            this.retryDelayMs < 100
        )
            throw new Error('Invalid document cleanup processor settings.');
    }

    public async processNext(input: {
        signal: AbortSignal;
        workerId: string;
    }): Promise<boolean> {
        input.signal.throwIfAborted();
        const now = this.dependencies.clock.now();
        const expired =
            await this.dependencies.store.expireUploadAuthorizations({
                context: { now, signal: input.signal },
                limit: this.authorizationSweepLimit,
            });
        const claim = await this.dependencies.store.claimCleanup({
            context: {
                now: this.dependencies.clock.now(),
                signal: input.signal,
            },
            leaseDurationMs: this.leaseDurationMs,
            workerId: input.workerId,
        });
        if (!claim) return expired > 0;

        const renewLease = async () => {
            const now = this.dependencies.clock.now();
            const retained = await this.dependencies.store.heartbeatCleanup({
                context: { now, signal: input.signal },
                fencingToken: claim.fencingToken,
                nextLeaseDeadline: new Date(
                    now.getTime() + this.leaseDurationMs,
                ),
                uploadId: claim.uploadId,
                workerId: claim.workerId,
            });
            if (!retained) throw new DictionaryDocumentCleanupFenceLostError();
        };

        try {
            if (claim.phase === 'delete_data') {
                await renewLease();
                const tombstone = await this.dependencies.storage.putTombstone({
                    objectKey: claim.objectKey,
                    signal: input.signal,
                });
                await renewLease();
                const recorded =
                    await this.dependencies.store.recordCleanupTombstone({
                        context: {
                            now: this.dependencies.clock.now(),
                            signal: input.signal,
                        },
                        fencingToken: claim.fencingToken,
                        storageVersionId: tombstone.versionId,
                        uploadId: claim.uploadId,
                        workerId: claim.workerId,
                    });
                if (!recorded)
                    throw new DictionaryDocumentCleanupFenceLostError();

                // Re-list only after the persisted tombstone barrier. This
                // catches every physical data version, including an upload that
                // completed immediately before the create-only tombstone.
                const physicalVersions =
                    await this.dependencies.storage.listVersions({
                        objectKey: claim.objectKey,
                        signal: input.signal,
                    });
                await renewLease();
                const deletedVersions = physicalVersions.filter(
                    (version) => version.kind === 'data',
                );
                for (const version of deletedVersions) {
                    await renewLease();
                    await this.dependencies.storage.deleteVersion({
                        objectKey: claim.objectKey,
                        signal: input.signal,
                        versionId: version.versionId,
                    });
                }
                for (const version of physicalVersions) {
                    if (
                        version.kind === 'tombstone' &&
                        version.versionId !== tombstone.versionId
                    ) {
                        await renewLease();
                        await this.dependencies.storage.deleteTombstone({
                            objectKey: claim.objectKey,
                            signal: input.signal,
                            versionId: version.versionId,
                        });
                    }
                }
                await renewLease();
                const remaining = await this.dependencies.storage.listVersions({
                    objectKey: claim.objectKey,
                    signal: input.signal,
                });
                if (
                    remaining.some((version) => version.kind === 'data') ||
                    remaining.filter(
                        (version) =>
                            version.kind === 'tombstone' &&
                            version.versionId === tombstone.versionId &&
                            version.isCurrent,
                    ).length !== 1 ||
                    remaining.some(
                        (version) =>
                            version.kind === 'tombstone' &&
                            version.versionId !== tombstone.versionId,
                    )
                )
                    throw new Error(
                        'Document data deletion could not be verified.',
                    );
                await renewLease();
                const retained =
                    await this.dependencies.store.recordDataVersionsDeleted({
                        context: {
                            now: this.dependencies.clock.now(),
                            signal: input.signal,
                        },
                        deletedVersions,
                        fencingToken: claim.fencingToken,
                        uploadId: claim.uploadId,
                        workerId: claim.workerId,
                    });
                if (!retained)
                    throw new DictionaryDocumentCleanupFenceLostError();
                return true;
            }

            await renewLease();
            const physicalVersions =
                await this.dependencies.storage.listVersions({
                    objectKey: claim.objectKey,
                    signal: input.signal,
                });
            await renewLease();
            if (physicalVersions.some((version) => version.kind === 'data'))
                throw new Error(
                    'A data version remained after the tombstone barrier.',
                );
            const tombstones = physicalVersions.filter(
                (version) => version.kind === 'tombstone',
            );
            if (!claim.designatedTombstoneVersionId)
                throw new Error('The persisted cleanup tombstone is missing.');
            for (const tombstone of tombstones) {
                await renewLease();
                await this.dependencies.storage.deleteTombstone({
                    objectKey: claim.objectKey,
                    signal: input.signal,
                    versionId: tombstone.versionId,
                });
            }
            await renewLease();
            const remaining = await this.dependencies.storage.listVersions({
                objectKey: claim.objectKey,
                signal: input.signal,
            });
            if (remaining.length !== 0)
                throw new Error(
                    'Document tombstone deletion could not be verified.',
                );
            await renewLease();
            const completed = await this.dependencies.store.completeCleanup({
                context: {
                    now: this.dependencies.clock.now(),
                    signal: input.signal,
                },
                deletedTombstoneVersionId: claim.designatedTombstoneVersionId,
                fencingToken: claim.fencingToken,
                uploadId: claim.uploadId,
                workerId: claim.workerId,
            });
            if (!completed) throw new DictionaryDocumentCleanupFenceLostError();
            return true;
        } catch (error) {
            if (input.signal.aborted) throw input.signal.reason;
            if (error instanceof DictionaryDocumentCleanupFenceLostError)
                return true;
            await this.dependencies.store.failCleanup({
                context: {
                    now: this.dependencies.clock.now(),
                    signal: input.signal,
                },
                failureCategory: 'cleanup_failed',
                fencingToken: claim.fencingToken,
                retryAt: new Date(
                    this.dependencies.clock.now().getTime() + this.retryDelayMs,
                ),
                uploadId: claim.uploadId,
                workerId: claim.workerId,
            });
            return true;
        }
    }
}
