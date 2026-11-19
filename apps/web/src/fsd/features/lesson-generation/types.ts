import type { ReactNode } from 'react';
import type {
    KnowledgeBody,
    LearningBlock,
    GenerationRunSummary,
    ConversationEditorContext,
} from '@languon/contracts';

/** The widget composes the document renderer without importing a sibling feature. */
export type PreparedLessonRenderer = (
    body: KnowledgeBody,
    dependencies?: LearningBlock[],
) => ReactNode;

export type LessonRunAction =
    | {
          kind: 'continue';
          run: GenerationRunSummary;
          acknowledgedUncertainTurnId?: string;
      }
    | { kind: 'stop' | 'discard'; run: GenerationRunSummary }
    | {
          kind: 'revise';
          run: GenerationRunSummary;
          instruction: string;
          acknowledgedUncertainTurnId?: string;
      }
    | { kind: 'applyRevision'; run: GenerationRunSummary; candidateId: string }
    | {
          kind: 'resolveSource';
          run: GenerationRunSummary;
          choice: 'keep-snapshot' | 'refresh';
          sourceId?: string;
          editorContext?: ConversationEditorContext;
      };
