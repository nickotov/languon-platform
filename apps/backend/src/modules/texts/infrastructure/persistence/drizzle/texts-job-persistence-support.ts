import type { TextAiAdmissionExecution } from '../../../../text-ai/application/text-ai-admission-participant';
import type { TextsLease } from '../../../application/ports/texts-job-store';
import {
    type TextsDatabase,
    type TextsJobRow,
    type TextsTransaction,
} from './texts-job-support';

export const clearLease = {
    workerId: null,
    leaseDeadline: null,
    heartbeatAt: null,
};

export const scope = (job: TextsJobRow, now: Date) => ({
    execution: job.selectedExecutionSnapshot,
    format: job.format,
    now,
});

export function owned(job: TextsJobRow, lease: TextsLease, now: Date) {
    return (
        job.executionState === 'running' &&
        job.workerId === lease.workerId &&
        job.fencingToken === BigInt(lease.fencingToken) &&
        job.attemptCount === lease.attempt &&
        job.leaseDeadline !== null &&
        job.leaseDeadline > now
    );
}

export interface TextsJobAdmissionPolicy {
    fingerprintSecret: string;
    resolveExecution(
        tx: TextsTransaction,
        userId: string,
        format: string,
        now: Date,
    ): Promise<TextAiAdmissionExecution>;
    globalQueueLimit?: number;
    userQueueLimit?: number;
    maxAttempts?: number;
}

export interface TextsJobStoreContext {
    readonly database: TextsDatabase;
    readonly policy: TextsJobAdmissionPolicy | undefined;
}
