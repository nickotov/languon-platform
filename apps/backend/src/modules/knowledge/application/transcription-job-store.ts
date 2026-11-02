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
    heartbeat(lease: KnowledgeTranscriptionLease): Promise<boolean>;
    audio(lease: KnowledgeTranscriptionLease): Promise<VerifiedKnowledgeAudio>;
    authorizeDispatch(
        lease: KnowledgeTranscriptionLease,
        input: TranscriptionDispatchRequest,
    ): Promise<KnowledgeTranscriptionDispatchPermit>;
    finish(
        lease: KnowledgeTranscriptionLease,
        result: KnowledgeTranscriptionResult | null,
        failureCode?: string,
    ): Promise<boolean>;
    /** Expired ambiguous dispatches settle as failures and never enqueue another HTTP request. */
    recoverExpired(): Promise<number>;
}
