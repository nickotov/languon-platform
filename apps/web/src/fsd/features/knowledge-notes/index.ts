export { KnowledgeNoteForm } from './ui/knowledge-note-form/knowledge-note-form';
export { KnowledgeEditor } from './ui/knowledge-editor/knowledge-editor';
export type { KnowledgeEditorHandle } from './ui/knowledge-editor/knowledge-editor';
export { KnowledgeProposalContent } from './ui/knowledge-proposal-content/knowledge-proposal-content';
export {
    parseProposalMarkdown,
    proposalPlainTextDocument,
    ProposalMarkdownError,
} from './lib/proposal-markdown';

export type {
    KnowledgeTutorAction,
    KnowledgeWorkspaceEditorOptions,
} from './ui/knowledge-note-form/knowledge-note-form';

export { knowledgeProposalLabels } from './ui/knowledge-proposal-content/knowledge-proposal-copy';

export { KnowledgeDocumentView } from './ui/knowledge-document-view/knowledge-document-view';
export { learningBlockPlainText } from './lib/learning-block-text';

export type { KnowledgeLibraryContext } from './api/library-copy-api';
export type { KnowledgeBlockCopyContext } from './api/block-copy-api';
export {
    KnowledgeBlockProposals,
    KnowledgeBlockProposalsForTurn,
} from './ui/block-proposals/knowledge-block-proposals';
export type { KnowledgeBlockProposalContext } from './ui/block-proposals/knowledge-block-proposals';

export { BlockLibrarySave } from './ui/library-copy/block-library-save';
export { localizedBlockLabels as knowledgeLearningBlockLabels } from './ui/learning-block-authoring/block-locales';

export type { KnowledgeReadingBlockOverrides } from './ui/knowledge-document-view/reader-learning-block';

export {
    knowledgeBlockReferences,
    knowledgeBlockMentionIds,
} from './lib/knowledge-block-references';
export type { KnowledgeBlockReference } from './lib/knowledge-block-references';
