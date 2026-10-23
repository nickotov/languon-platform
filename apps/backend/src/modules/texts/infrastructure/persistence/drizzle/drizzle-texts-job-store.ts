import type {
    EnqueueTextDetectionRequest,
    EnqueueTextTranslationRequest,
    TextAiJob,
} from '@languon/contracts';
import type {
    TextJobKind,
    TextJobResult,
    TextsTokenUsage,
} from '../../../application/ports/texts-ai-provider';
import type {
    ClaimedTextsJob,
    TextJobContext,
    TextsJobStore,
    TextsLease,
    TextsWorkerStore,
} from '../../../application/ports/texts-job-store';
import { cancel, enqueue, get } from './texts-job-admission';
import { claimNext } from './texts-job-claim';
import {
    complete,
    fail,
    heartbeat,
    markDispatched,
    releaseWorkerLeases,
} from './texts-job-execution';
import { type TextsJobAdmissionPolicy } from './texts-job-persistence-support';
import { type TextsDatabase } from './texts-job-support';
/** All writes use the existing global admission lock; no private queue or provider budget. */
export class DrizzleTextsJobStore implements TextsJobStore, TextsWorkerStore {
    constructor(
        private readonly database: TextsDatabase,
        private readonly policy?: TextsJobAdmissionPolicy,
    ) {}

    async enqueue(
        ownerId: string,
        kind: TextJobKind,
        raw: EnqueueTextDetectionRequest | EnqueueTextTranslationRequest,
        context: TextJobContext,
    ): Promise<TextAiJob> {
        return enqueue(
            { database: this.database, policy: this.policy },
            ownerId,
            kind,
            raw,
            context,
        );
    }

    async get(ownerId: string, jobId: string, context: TextJobContext) {
        return get(
            { database: this.database, policy: this.policy },
            ownerId,
            jobId,
            context,
        );
    }

    async cancel(ownerId: string, jobId: string, context: TextJobContext) {
        return cancel(
            { database: this.database, policy: this.policy },
            ownerId,
            jobId,
            context,
        );
    }

    async claimNext(
        input: Parameters<TextsWorkerStore['claimNext']>[0],
        context: TextJobContext,
    ): Promise<ClaimedTextsJob | null> {
        return claimNext(
            { database: this.database, policy: this.policy },
            input,
            context,
        );
    }

    async heartbeat(
        lease: TextsLease,
        leaseMs: number,
        context: TextJobContext,
    ) {
        return heartbeat(
            { database: this.database, policy: this.policy },
            lease,
            leaseMs,
            context,
        );
    }

    async markDispatched(lease: TextsLease, context: TextJobContext) {
        return markDispatched(
            { database: this.database, policy: this.policy },
            lease,
            context,
        );
    }

    async complete(
        lease: TextsLease,
        result: TextJobResult,
        usage: TextsTokenUsage | undefined,
        context: TextJobContext,
    ) {
        return complete(
            { database: this.database, policy: this.policy },
            lease,
            result,
            usage,
            context,
        );
    }

    async fail(
        lease: TextsLease,
        input: Parameters<TextsWorkerStore['fail']>[1],
        context: TextJobContext,
    ) {
        return fail(
            { database: this.database, policy: this.policy },
            lease,
            input,
            context,
        );
    }

    async releaseWorkerLeases(workerId: string, context: TextJobContext) {
        return releaseWorkerLeases(
            { database: this.database, policy: this.policy },
            workerId,
            context,
        );
    }
}
export type { TextsJobAdmissionPolicy } from './texts-job-persistence-support';
