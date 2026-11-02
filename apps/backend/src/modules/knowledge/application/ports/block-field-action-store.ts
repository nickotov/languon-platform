import type { RequestKnowledgeBlockFieldAction } from '@languon/contracts';

export interface KnowledgeFieldActionInput extends RequestKnowledgeBlockFieldAction {
    noteId: string;
}
