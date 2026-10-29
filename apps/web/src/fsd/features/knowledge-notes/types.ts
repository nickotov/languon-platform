import type {
    CopyKnowledgeTextRequest,
    CopyKnowledgeVocabularyRequest,
    KnowledgeTextLibraryPreview,
    KnowledgeVocabularyPreview,
    LearningBlock,
} from '@languon/contracts';
export type LibraryContentBlock = Extract<
    LearningBlock,
    { type: 'vocabulary' | 'bilingual-text' }
>;
/** Preview and publication retain the same request identity for safe retries. */
export type PreparedLibraryCopy =
    | {
          kind: 'vocabulary';
          request: CopyKnowledgeVocabularyRequest;
          content: KnowledgeVocabularyPreview;
      }
    | {
          kind: 'text';
          request: CopyKnowledgeTextRequest;
          content: KnowledgeTextLibraryPreview;
      };

export type CopyDestination = { noteId: string; branchId: string };
