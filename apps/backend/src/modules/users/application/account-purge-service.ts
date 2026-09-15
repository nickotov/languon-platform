import type {
    AccountPurgeObjectStorage,
    AccountPurgeStore,
} from './ports/account-purge-store';

export class AccountPurgeService {
    public constructor(
        private readonly store: AccountPurgeStore,
        private readonly storage: AccountPurgeObjectStorage,
    ) {}

    public async processNext(input: {
        now: Date;
        signal: AbortSignal;
        workerId: string;
    }): Promise<boolean> {
        input.signal.throwIfAborted();
        const claim = await this.store.claimDue(input);
        if (!claim) return false;
        try {
            const owner = await this.store.inspectOwner(claim);
            if (owner.activeJobs > 0 || owner.objects.some((object) => object.cleanupState !== 'complete')) {
                await this.store.retry({ ...claim, now: input.now, workerId: input.workerId });
                return true;
            }
            for (const object of owner.objects) {
                input.signal.throwIfAborted();
                if (!(await this.store.renew({ ...claim, now: new Date(), workerId: input.workerId }))) {
                    throw new Error('Account purge lease was lost.');
                }
                await this.storage.removeAllVersions(object.objectKey, input.signal);
            }
            input.signal.throwIfAborted();
            if (!(await this.store.finish({ ...claim, now: new Date(), workerId: input.workerId }))) {
                throw new Error('Account purge lease was lost before finalization.');
            }
            return true;
        } catch (error) {
            await this.store.retry({ ...claim, now: new Date(), workerId: input.workerId });
            throw error;
        }
    }

    public releaseWorkerLeases(input: { now: Date; workerId: string }): Promise<void> {
        return this.store.releaseWorkerLeases(input);
    }
}
