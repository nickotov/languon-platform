import type { BlockInsertionBookmark } from '../../../lib/block-insertion-bookmark';
import type {
    KnowledgeBlockProposal,
    KnowledgeWorkingBranch,
} from '@languon/contracts';
import type { LearningBlockPlayback } from '@/fsd/entities/learning-blocks';
import type { ConversationSessionRequest } from '@/fsd/entities/conversation';
export type KnowledgeBlockProposalContext = {
    requestWithSession: ConversationSessionRequest;
    conversationId: string;
    branchId: string;
    branchVersion: number;
    disabled?: boolean | undefined;
    captureInsertion?(): BlockInsertionBookmark | null;
    beforeApply(): Promise<{ branchId: string; version: number }>;
    onApplied(branch: KnowledgeWorkingBranch): void | Promise<void>;
    onApplyingChange?(busy: boolean): void;
    onShowBlocks?(blockIds: string[]): void;
    getBlockLabel?(blockId: string): string | undefined;
    getPlayback?(
        proposal: KnowledgeBlockProposal,
    ): LearningBlockPlayback | undefined;
    onAskAgain?(proposal: KnowledgeBlockProposal): void;
};
