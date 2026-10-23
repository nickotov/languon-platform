import { type PortraitInterviewerOutput } from '@languon/contracts';
import type {
    ClaimedInterviewOperation,
    InterviewStore,
} from '../../../application/ports/interview-store';
import {
    type PortraitDatabase,
    type PortraitTransaction,
} from './drizzle-portrait-store';
import { enqueue } from './interview-enqueue-operation';
import { type InterviewAdmission } from './interview-persistence-support';
import {
    read,
    setLocale,
    start,
    status,
    stop,
} from './interview-session-operations';
import {
    claim,
    complete,
    fail,
    heartbeat,
    withOperation,
} from './interview-worker-operations';
export class DrizzleInterviewStore implements InterviewStore {
    constructor(
        private readonly database: PortraitDatabase,
        private readonly admission: InterviewAdmission,
        private readonly recover?: (
            tx: PortraitTransaction,
            operationId: string,
            now: Date,
        ) => Promise<void>,
    ) {}

    status(ownerId: string, now: Date) {
        return status(
            {
                database: this.database,
                admission: this.admission,
                recover: this.recover,
            },
            ownerId,
            now,
        );
    }

    start(input: Parameters<InterviewStore['start']>[0]) {
        return start(
            {
                database: this.database,
                admission: this.admission,
                recover: this.recover,
            },
            input,
        );
    }

    setLocale(input: Parameters<InterviewStore['setLocale']>[0]) {
        return setLocale(
            {
                database: this.database,
                admission: this.admission,
                recover: this.recover,
            },
            input,
        );
    }

    enqueue(input: Parameters<InterviewStore['enqueue']>[0]) {
        return enqueue(
            {
                database: this.database,
                admission: this.admission,
                recover: this.recover,
            },
            input,
        );
    }

    async read(ownerId: string, id: string) {
        return read(
            {
                database: this.database,
                admission: this.admission,
                recover: this.recover,
            },
            ownerId,
            id,
        );
    }

    async stop(ownerId: string, id: string, now: Date) {
        return stop(
            {
                database: this.database,
                admission: this.admission,
                recover: this.recover,
            },
            ownerId,
            id,
            now,
        );
    }

    claim(): Promise<ClaimedInterviewOperation | null> {
        return claim({
            database: this.database,
            admission: this.admission,
            recover: this.recover,
        });
    }

    async heartbeat(claim: ClaimedInterviewOperation) {
        return heartbeat(
            {
                database: this.database,
                admission: this.admission,
                recover: this.recover,
            },
            claim,
        );
    }

    async withOperation<T>(
        claim: ClaimedInterviewOperation,
        work: (tx: PortraitTransaction) => Promise<T>,
    ): Promise<T> {
        return withOperation(
            {
                database: this.database,
                admission: this.admission,
                recover: this.recover,
            },
            claim,
            work,
        );
    }

    async complete(
        claim: ClaimedInterviewOperation,
        value: PortraitInterviewerOutput,
        now: Date,
    ) {
        return complete(
            {
                database: this.database,
                admission: this.admission,
                recover: this.recover,
            },
            claim,
            value,
            now,
        );
    }

    async fail(claim: ClaimedInterviewOperation, code: string, now: Date) {
        return fail(
            {
                database: this.database,
                admission: this.admission,
                recover: this.recover,
            },
            claim,
            code,
            now,
        );
    }
}
export {
    assertLiveInterviewOperation,
    expireLearnerPortraitInterviews,
} from './interview-persistence-support';
export type { InterviewAdmission } from './interview-persistence-support';
