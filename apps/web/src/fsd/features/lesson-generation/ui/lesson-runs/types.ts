import type {
    ConversationEditorContext,
    GenerationRunSummary,
} from '@languon/contracts';
import type { ConversationSessionRequest } from '@/fsd/entities/conversation';
import type { useLessonRuns } from '../../hooks/use-lesson-runs';
import type {
    LessonPreviewSelection,
    CompletedLessonRenderer,
    PreparedLessonRenderer,
} from '../../types';

export type LessonRunsProps = {
    state: ReturnType<typeof useLessonRuns>;
    actorId: string;
    request: ConversationSessionRequest;
    busy: boolean;
    activeTurnId?: string | undefined;
    reconnecting: boolean;
    onAdjust(run: GenerationRunSummary): void;
    captureSourceContext?:
        (() => Promise<ConversationEditorContext | undefined>) | undefined;
    previewSelection?: LessonPreviewSelection | undefined;
    renderPreparedBody?: PreparedLessonRenderer | undefined;
    renderCompletedLesson?: CompletedLessonRenderer | undefined;
};
