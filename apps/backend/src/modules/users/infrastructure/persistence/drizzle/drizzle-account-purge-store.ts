import type {
    AccountPurgeStore,
    ClaimedAccountPurge,
} from '../../../application/ports/account-purge-store';
import { finish } from './account-purge-completion';
import {
    claimDue,
    inspectOwner,
    releaseWorkerLeases,
    renew,
    retry,
} from './account-purge-leases';
import { type AccountPurgeDatabase } from './account-purge-persistence-support';
export class DrizzleAccountPurgeStore implements AccountPurgeStore {
    public constructor(private readonly database: AccountPurgeDatabase) {}

    public claimDue(input: {
        now: Date;
        workerId: string;
    }): Promise<ClaimedAccountPurge | null> {
        return claimDue({ database: this.database }, input);
    }

    public async inspectOwner(
        input: ClaimedAccountPurge & { workerId: string },
    ) {
        return inspectOwner({ database: this.database }, input);
    }

    public async renew(
        input: ClaimedAccountPurge & { now: Date; workerId: string },
    ): Promise<boolean> {
        return renew({ database: this.database }, input);
    }

    public async finish(
        input: ClaimedAccountPurge & { now: Date; workerId: string },
    ): Promise<boolean> {
        return finish({ database: this.database }, input);
    }

    public async retry(
        input: ClaimedAccountPurge & { now: Date; workerId: string },
    ): Promise<void> {
        return retry({ database: this.database }, input);
    }

    public async releaseWorkerLeases(input: {
        now: Date;
        workerId: string;
    }): Promise<void> {
        return releaseWorkerLeases({ database: this.database }, input);
    }
}
