import type {
    SubmitKnowledgeTranscriptionRequest,
    KnowledgeTranscriptionJob,
    KnowledgeTranscriptionRequest,
    KnowledgeTranscriptionResult,
    KnowledgeTranscriptionDispatchPermit,
} from '@languon/contracts';
import type { VerifiedKnowledgeAudio } from './media-store';
import type { TranscriptionDispatchRequest } from './transcription-provider';
export interface KnowledgeTranscriptionLease extends KnowledgeTranscriptionRequest {
    ownerId: string;
    workerId: string;
    fencingToken: number;
    leaseToken: string;
    deadlineAt: Date;
    leaseDeadline: Date;
}
/** A transient database outage or transaction abort that permits replaying the same fenced write. */
export class TransientTranscriptionStoreError extends Error {
    constructor() {
        super('The transcription store is temporarily unavailable.');
    }
}

export interface KnowledgeTranscriptionJobStore {
    submit(
        actorId: string,
        input: SubmitKnowledgeTranscriptionRequest,
        signal: AbortSignal,
    ): Promise<KnowledgeTranscriptionJob>;
    read(
        actorId: string,
        noteId: string,
        operationId: string,
    ): Promise<KnowledgeTranscriptionJob>;
    cancel(
        actorId: string,
        noteId: string,
        operationId: string,
    ): Promise<KnowledgeTranscriptionJob>;
    claim(workerId: string): Promise<KnowledgeTranscriptionLease | null>;
    /** The committed database lease deadline, or null when the worker no longer has authority. */
    heartbeat(lease: KnowledgeTranscriptionLease): Promise<Date | null>;
    audio(lease: KnowledgeTranscriptionLease): Promise<VerifiedKnowledgeAudio>;
    authorizeDispatch(
        lease: KnowledgeTranscriptionLease,
        input: TranscriptionDispatchRequest,
    ): Promise<KnowledgeTranscriptionDispatchPermit>;
    /** Replaying an identical receipt and disposition is safe after an uncertain commit.
     * False means no further terminal transition was applied under this fence. */
    finish(
        lease: KnowledgeTranscriptionLease,
        result: KnowledgeTranscriptionResult | null,
        failureCode?: string,
    ): Promise<boolean>;
    /** Expired ambiguous dispatches settle as failures and never enqueue another HTTP request. */
    recoverExpired(): Promise<number>;
}
