import type { KnowledgeMediaAsset, LearningBlock } from '@languon/contracts';
import type { RequestWithSession } from '@/fsd/entities/dictionary';

export type KnowledgeSpeechDraft = {
    branchId: string;
    branchVersion: number;
    blocks: LearningBlock[];
};
export interface KnowledgeNarrationProps {
    hideWhenEmpty?: boolean;
    noteId: string;
    blocks: LearningBlock[];
    requestWithSession: RequestWithSession;
    flush(): Promise<KnowledgeSpeechDraft>;
    onApply(
        block: Extract<LearningBlock, { type: 'audio' }>,
    ): void | Promise<void>;
}
export type AppliedNarration = {
    asset: KnowledgeMediaAsset;
    sourceText: string;
    language: string;
};
