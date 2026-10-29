import type {
    CopyKnowledgeVocabularyRequest,
    CopyKnowledgeTextRequest,
    KnowledgeVocabularyPreview,
    KnowledgeTextLibraryPreview,
    DictionaryDeterministicImportResponse,
    TextDocument,
} from '@languon/contracts';
import type { LearnerSourceAccess } from './learner-store';

export interface KnowledgeLibraryCopyStore {
    previewVocabulary(
        actorId: string,
        request: CopyKnowledgeVocabularyRequest,
        signal: AbortSignal,
        access?: LearnerSourceAccess,
    ): Promise<KnowledgeVocabularyPreview>;
    copyVocabulary(
        actorId: string,
        request: CopyKnowledgeVocabularyRequest,
        signal: AbortSignal,
        access?: LearnerSourceAccess,
    ): Promise<DictionaryDeterministicImportResponse>;
    previewText(
        actorId: string,
        request: CopyKnowledgeTextRequest,
        signal: AbortSignal,
        access?: LearnerSourceAccess,
    ): Promise<KnowledgeTextLibraryPreview>;
    copyText(
        actorId: string,
        request: CopyKnowledgeTextRequest,
        signal: AbortSignal,
        access?: LearnerSourceAccess,
    ): Promise<TextDocument>;
}
