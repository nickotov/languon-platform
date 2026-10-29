import type {
    KnowledgeMediaAccess,
    KnowledgeMediaAsset,
} from '@languon/contracts';

export interface VerifiedKnowledgeAudio {
    bytes: Uint8Array;
    mimeType: 'audio/wav' | 'audio/mpeg';
    durationMs: number;
}
export interface KnowledgeMediaStore {
    upload(
        ownerId: string,
        noteId: string,
        audio: VerifiedKnowledgeAudio,
    ): Promise<KnowledgeMediaAsset>;
    read(
        noteId: string,
        assetId: string,
        authority: { ownerId?: string; access?: KnowledgeMediaAccess },
    ): Promise<VerifiedKnowledgeAudio>;
}
