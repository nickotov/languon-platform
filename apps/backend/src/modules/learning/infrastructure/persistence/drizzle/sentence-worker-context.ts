import type { SentenceJobFailure } from '@languon/contracts';
import { type TextAiCircuitFailureCategory } from '../../../../../infrastructure/text-ai/text-ai-circuit';
import type { SentenceLease } from '../../../application/ports/sentence-worker-store';
import {
    type SentenceDatabase,
    type SentenceJobRow,
} from './sentence-persistence-support';

export type Usage = { inputTokens: number; outputTokens: number };

export function leased(job: SentenceJobRow, lease: SentenceLease, now: Date) {
    return (
        job.executionState === 'running' &&
        job.workerId === lease.workerId &&
        job.fencingToken === BigInt(lease.fencingToken) &&
        job.attemptCount === lease.attempt &&
        job.leaseDeadline !== null &&
        job.leaseDeadline > now
    );
}

export function circuitFailureCategory(
    code: SentenceJobFailure,
): TextAiCircuitFailureCategory | null {
    switch (code) {
        case 'provider_unavailable':
        case 'provider_rate_limited':
            return 'provider_error';
        case 'provider_timeout':
            return 'provider_timeout';
        default:
            return null;
    }
}

export function circuitScope(job: SentenceJobRow, now: Date) {
    return {
        execution: job.selectedExecutionSnapshot,
        format: job.format,
        now,
    };
}

export const clearLease = {
    workerId: null,
    leaseDeadline: null,
    heartbeatAt: null,
};

export interface SentenceWorkerPersistenceContext {
    database: SentenceDatabase;
}
