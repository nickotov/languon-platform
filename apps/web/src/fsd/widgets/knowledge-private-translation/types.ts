import type {
    LearningBlock,
    WorkbookLearningShareAccess,
} from '@languon/contracts';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
export interface KnowledgePrivateTranslationProps {
    actorId: string;
    noteId: string;
    noteVersion: number;
    block: Extract<LearningBlock, { type: 'bilingual-text' }>;
    requestWithSession: RequestWithSession;
    access?: WorkbookLearningShareAccess | undefined;
}
