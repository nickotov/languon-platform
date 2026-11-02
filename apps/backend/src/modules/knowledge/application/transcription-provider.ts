import type {
    KnowledgeTranscriptionDispatchPermit,
    KnowledgeTranscriptionRequest,
    KnowledgeTranscriptionResult,
} from '@languon/contracts';
import type { VerifiedKnowledgeAudio } from './media-store';

export interface TranscriptionDispatchRequest extends KnowledgeTranscriptionRequest {
    checksum: string;
    byteLength: number;
    durationMs: number;
    signal: AbortSignal;
}
/** Must be implemented by existing admission/receipt authority before production dispatch is wired. */
export interface TranscriptionAdmissionAuthority {
    authorizeDispatch(
        input: TranscriptionDispatchRequest,
    ): Promise<KnowledgeTranscriptionDispatchPermit>;
}
export interface KnowledgeTranscriptionProvider {
    transcribe(
        input: KnowledgeTranscriptionRequest & {
            audio: VerifiedKnowledgeAudio;
            signal: AbortSignal;
        },
    ): Promise<KnowledgeTranscriptionResult>;
}
