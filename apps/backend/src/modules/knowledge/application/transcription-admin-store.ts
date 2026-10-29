import type {
    KnowledgeTranscriptionAdminState,
    KnowledgeTranscriptionAdminPreviewRequest,
    KnowledgeTranscriptionAdminReadiness,
} from '@languon/contracts';
export interface TranscriptionAdminActor {
    userId: string;
    sessionId: string;
    correlationId: string;
}
export interface TranscriptionAdminStore {
    read(): Promise<KnowledgeTranscriptionAdminState>;
    preview(
        input: KnowledgeTranscriptionAdminPreviewRequest,
    ): Promise<KnowledgeTranscriptionAdminReadiness>;
    apply(
        actor: TranscriptionAdminActor,
        input: KnowledgeTranscriptionAdminPreviewRequest,
        expiresAt: Date,
    ): Promise<KnowledgeTranscriptionAdminState>;
}

export interface TranscriptionAdminPreviewSigner {
    sign(
        actor: TranscriptionAdminActor,
        request: KnowledgeTranscriptionAdminPreviewRequest,
        expiresAt: string,
    ): string;
    verify(
        actor: TranscriptionAdminActor,
        request: KnowledgeTranscriptionAdminPreviewRequest,
        expiresAt: string,
        signature: string,
    ): boolean;
}
