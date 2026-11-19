import type {
    ConversationEditorContext,
    GenerationRunSummary,
} from '@languon/contracts';
import {
    ConversationApiError,
    type ConversationSessionRequest,
} from '@/fsd/entities/conversation';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import type { useLessonRuns } from '../../hooks/use-lesson-runs';
import { lessonRunCopy } from '../../lib/lesson-run-copy';
import { LessonRun } from '../lesson-run/lesson-run';
import { LessonActionNotice } from '../lesson-action-notice/lesson-action-notice';
import { LessonRunQuote } from '../lesson-run-quote/lesson-run-quote';
import type { PreparedLessonRenderer } from '../../types';

export function LessonRuns({
    state,
    actorId,
    request,
    busy,
    activeTurnId,
    reconnecting,
    onAdjust,
    captureSourceContext,
    renderPreparedBody,
}: {
    state: ReturnType<typeof useLessonRuns>;
    actorId: string;
    request: ConversationSessionRequest;
    busy: boolean;
    activeTurnId?: string | undefined;
    reconnecting: boolean;
    onAdjust(run: GenerationRunSummary): void;
    captureSourceContext?:
        (() => Promise<ConversationEditorContext | undefined>) | undefined;
    renderPreparedBody?: PreparedLessonRenderer | undefined;
}) {
    const { locale } = useI18n();
    const copy = lessonRunCopy(locale);
    const blocked = busy || state.actions.pending;
    const visible = state.runs.filter((run) => run.state !== 'discarded');
    function refresh() {
        void state.refresh();
    }

    function refreshQuote() {
        if (state.actions.action) {
            state.actions.execute(state.actions.action);
        }
    }

    return (
        <>
            {visible.map((run) => {
                const failure = state.actions.failureFor(run);
                const code =
                    failure?.error instanceof ConversationApiError
                        ? failure.error.detail.code
                        : undefined;

                function refreshRun() {
                    state.actions.clearError(run);
                    refresh();
                }

                return (
                    <LessonRun
                        key={run.id}
                        run={run}
                        actorId={actorId}
                        request={request}
                        busy={
                            blocked ||
                            Boolean(
                                activeTurnId &&
                                activeTurnId !== run.activeTurnId,
                            )
                        }
                        reconnecting={reconnecting || state.rechecking}
                        stopping={state.actions.stopping(run)}
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
                        captureSourceContext={captureSourceContext}
                        renderPreparedBody={renderPreparedBody}
                    />
                );
            })}
            {state.isError && (
                <InlineAlert tone='error'>
                    {copy.readFailed}
                    <Button size='compact' variant='ghost' onClick={refresh}>
                        {copy.refresh}
                    </Button>
                </InlineAlert>
            )}
            <LessonRunQuote
                quote={state.actions.quote}
                revision={state.actions.action?.kind === 'revise'}
                busy={state.actions.pending || reconnecting || state.rechecking}
                onConfirm={state.actions.confirm}
                onRefresh={refreshQuote}
                onClose={state.actions.cancelQuote}
            />
        </>
    );
}
