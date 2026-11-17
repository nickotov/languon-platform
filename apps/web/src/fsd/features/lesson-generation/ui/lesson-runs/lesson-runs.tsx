import type {
    ConversationEditorContext,
    GenerationRunSummary,
} from '@languon/contracts';
import {
    ConversationApiError,
    conversationCopy,
    type ConversationSessionRequest,
} from '@/fsd/entities/conversation';
import { Button, ButtonLink, InlineAlert } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import type { useLessonRuns } from '../../hooks/use-lesson-runs';
import { lessonRunCopy } from '../../lib/lesson-run-copy';
import { LessonRun } from '../lesson-run/lesson-run';
import { LessonRunQuote } from '../lesson-run-quote/lesson-run-quote';

export function LessonRuns({
    state,
    actorId,
    request,
    busy,
    activeTurnId,
    reconnecting,
    onAdjust,
    captureSourceContext,
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
}) {
    const { locale, href } = useI18n();
    const copy = lessonRunCopy(locale);
    const blocked = busy || state.actions.pending;
    const error = state.isError || Boolean(state.actions.error);
    const creditsExhausted =
        state.actions.error instanceof ConversationApiError &&
        state.actions.error.detail.code === 'credits_exhausted';
    const selectionRequired =
        state.actions.error instanceof ConversationApiError &&
        state.actions.error.detail.code === 'source_selection_required';
    const capacityError =
        state.actions.error instanceof ConversationApiError &&
        state.actions.error.detail.code === 'generation_scope_change';
    const errorCopy = conversationCopy(locale);
    let errorMessage = copy.error;
    if (creditsExhausted) {
        errorMessage = errorCopy.creditsExhausted;
    } else if (selectionRequired) {
        errorMessage = copy.selectionRequired;
    } else if (capacityError) {
        errorMessage = copy.capacity;
    }

    const visible = state.runs.filter((run) => run.state !== 'discarded');
    function refresh() {
        state.actions.clearError();
        void state.refresh();
    }

    function refreshQuote() {
        if (state.actions.action) {
            state.actions.execute(state.actions.action);
        }
    }

    return (
        <>
            {visible.map((run) => (
                <LessonRun
                    key={run.id}
                    run={run}
                    actorId={actorId}
                    request={request}
                    busy={
                        blocked ||
                        Boolean(
                            activeTurnId && activeTurnId !== run.activeTurnId,
                        )
                    }
                    reconnecting={reconnecting}
                    failed={Boolean(state.actions.error)}
                    continueBlocked={
                        capacityError &&
                        state.actions.action?.run.id === run.id &&
                        state.actions.action.run.revision === run.revision
                    }
                    onAction={state.actions.execute}
                    onAdjust={onAdjust}
                    captureSourceContext={captureSourceContext}
                />
            ))}
            {error && (
                <InlineAlert tone='error'>
                    {errorMessage}
                    {creditsExhausted ? (
                        <ButtonLink
                            size='compact'
                            variant='secondary'
                            href={href('/profile?tab=credits')}
                        >
                            {errorCopy.viewCredits}
                        </ButtonLink>
                    ) : (
                        <Button
                            size='compact'
                            variant='ghost'
                            onClick={refresh}
                        >
                            {copy.refresh}
                        </Button>
                    )}
                </InlineAlert>
            )}
            <LessonRunQuote
                quote={state.actions.quote}
                revision={state.actions.action?.kind === 'revise'}
                busy={state.actions.pending || reconnecting}
                onConfirm={state.actions.confirm}
                onRefresh={refreshQuote}
                onClose={state.actions.cancelQuote}
            />
        </>
    );
}
