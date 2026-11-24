import type { ReactNode } from 'react';
import type { GenerationRunSummary } from '@languon/contracts';
import { ConversationApiError } from '@/fsd/entities/conversation';
import type { LessonRunsProps } from '../lesson-runs/types';
import { LessonRun } from '../lesson-run/lesson-run';
import { LessonActionNotice } from '../lesson-action-notice/lesson-action-notice';

export function LessonRunItem({
    state,
    run,
    result,
    actorId,
    request,
    busy,
    activeTurnId,
    reconnecting,
    onAdjust,
    captureSourceContext,
    previewSelection,
    renderPreparedBody,
    renderCompletedLesson,
}: LessonRunsProps & { run: GenerationRunSummary; result?: ReactNode }) {
    const failure = state.actions.failureFor(run);
    const code =
        failure?.error instanceof ConversationApiError
            ? failure.error.detail.code
            : undefined;

    const recordingAction =
        state.actions.action?.kind === 'continue' &&
        state.actions.action.run.id === run.id &&
        state.actions.action.run.revision === run.revision &&
        run.pauseReason === 'recording-confirmation';

    function refreshRun() {
        state.actions.clearError(run);
        void state.refresh();
    }

    return (
        <LessonRun
            result={result}
            run={run}
            actorId={actorId}
            request={request}
            busy={
                busy ||
                state.actions.pending ||
                Boolean(activeTurnId && activeTurnId !== run.activeTurnId)
            }
            reconnecting={reconnecting || state.rechecking}
            stopping={state.actions.stopping(run)}
            recordingPending={recordingAction && state.actions.pending}
            updatedRecordingQuote={recordingAction ? state.actions.quote : null}
            actionNotice={
                failure && (
                    <LessonActionNotice
                        error={failure.error}
                        kind={failure.kind}
                        refresh={refreshRun}
                    />
                )
            }
            continueBlocked={
                code === 'context_too_large' ||
                code === 'generation_scope_change'
            }
            onAction={state.actions.execute}
            onAdjust={onAdjust}
            previewSelection={previewSelection}
            captureSourceContext={captureSourceContext}
            renderPreparedBody={renderPreparedBody}
            renderCompletedLesson={renderCompletedLesson}
        />
    );
}
