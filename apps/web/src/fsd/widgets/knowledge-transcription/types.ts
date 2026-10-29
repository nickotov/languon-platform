import type { LearningBlock } from '@languon/contracts';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
export type TranscriptionAudioBlock = Extract<LearningBlock, { type: 'audio' }>;
export interface TranscriptionDraft {
    branchId: string;
    branchVersion: number;
    blocks: LearningBlock[];
}
export interface KnowledgeTranscriptionProps {
    hideWhenEmpty?: boolean;
    noteId: string;
    blocks: LearningBlock[];
    language: string;
    requestWithSession: RequestWithSession;
    flush(): Promise<TranscriptionDraft>;
    onApply(
        expected: TranscriptionAudioBlock,
        replacement: TranscriptionAudioBlock,
        source: { noteId: string; branchId: string; branchVersion: number },
    ):
        | 'applied'
        | 'changed'
        | 'missing'
        | 'invalid'
        | Promise<'applied' | 'changed' | 'missing' | 'invalid'>;
}
