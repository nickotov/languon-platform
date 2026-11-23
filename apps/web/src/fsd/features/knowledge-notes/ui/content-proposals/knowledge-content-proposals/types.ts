import type { BlockInsertionBookmark } from '../../../lib/block-insertion-bookmark';
import type {
    KnowledgeContentProposal,
    KnowledgeWorkingBranch,
    KnowledgeNode,
} from '@languon/contracts';
import type { LearningBlockPlayback } from '@/fsd/entities/learning-blocks';
import type { ConversationSessionRequest } from '@/fsd/entities/conversation';
export type KnowledgeContentProposalContext = {
    requestWithSession: ConversationSessionRequest;
    conversationId: string;
    branchId: string;
    branchVersion: number;
    workingDocument?: KnowledgeNode | undefined;
    disabled?: boolean | undefined;
    captureInsertion?(): BlockInsertionBookmark | null;
    refreshLessonDraft?(): Promise<void>;
    beforeApply(): Promise<{ branchId: string; version: number }>;
    onApplied(branch: KnowledgeWorkingBranch): void | Promise<void>;
    onApplyingChange?(busy: boolean): void;
    onShowBlocks?(blockIds: string[]): void;
    getBlockLabel?(blockId: string): string | undefined;
    getPlayback?(
        proposal: KnowledgeContentProposal,
    ): LearningBlockPlayback | undefined;
    onAskAgain?(proposal: KnowledgeContentProposal): void;
};
