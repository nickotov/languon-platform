import { useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
    ConversationEditorContext,
    GenerationRunSummary,
} from '@languon/contracts';
import type { ConversationSessionRequest } from '@/fsd/entities/conversation';
import { Button, Dialog, DialogActions, InlineAlert } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { lessonRunsApi } from '../../api/lesson-runs-api';
import type { LessonRunAction } from '../../types';
import { lessonRunCopy } from '../../lib/lesson-run-copy';
import { LessonRunCard } from '../lesson-run-card/lesson-run-card';
import { LessonRunRevision } from '../lesson-run-revision/lesson-run-revision';
import { LessonRunPreview } from '../lesson-run-preview/lesson-run-preview';
import { useLessonPreview } from '../../hooks/use-lesson-preview';
import type { PreparedLessonRenderer } from '../../types';

export function LessonRun({
    run,
    actorId,
    request,
    busy,
    reconnecting,
    failed,
    actionNotice,
    continueBlocked,
    onAction,
    onAdjust,
    captureSourceContext,
    renderPreparedBody,
}: {
    run: GenerationRunSummary;
    actorId: string;
    request: ConversationSessionRequest;
    busy: boolean;
    reconnecting: boolean;
    failed: boolean;
    actionNotice?: ReactNode;
    continueBlocked: boolean;
    onAction(action: LessonRunAction): void;
    onAdjust(run: GenerationRunSummary): void;
    captureSourceContext?:
        (() => Promise<ConversationEditorContext | undefined>) | undefined;
    renderPreparedBody?: PreparedLessonRenderer | undefined;
}) {
    const { locale } = useI18n();
    const copy = lessonRunCopy(locale);
    const [dismissedCandidate, setDismissedCandidate] = useState<string | null>(
        null,
    );
    const [discarding, setDiscarding] = useState(false);
    const [stopRequested, setStopRequested] = useState<string | null>(null);
    const [capturing, setCapturing] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [captureFailed, setCaptureFailed] = useState(false);
    const captureLock = useRef(false);
    const preview = useLessonPreview({
        run,
        actorId,
        request,
        open: previewOpen,
    });
    const detail = useQuery({
        queryKey: [
            'lesson-run',
            actorId,
            run.conversationId,
            run.id,
            run.revision,
        ],
        queryFn: ({ signal }) =>
            lessonRunsApi.detail(request, run.conversationId, run.id, signal),
        enabled: run.state === 'paused' && !run.automation?.enabled,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        retry: false,
        gcTime: 0,
    });
    const candidate =
        run.state === 'paused' ? detail.data?.revisionCandidate : undefined;
    const showCandidate = candidate && candidate.id !== dismissedCandidate;
    const stopping =
        (run.state === 'running' || run.automation?.enabled === true) &&
        stopRequested === (run.activeTurnId ?? run.id) &&
        !failed;

    function continueRun() {
        onAction({
            kind: 'continue',
            run,
            ...(run.uncertainTurnId
                ? { acknowledgedUncertainTurnId: run.uncertainTurnId }
                : {}),
        });
    }

    function openPreview() {
        setPreviewOpen(true);
    }

    function closePreview() {
        setPreviewOpen(false);
    }

    function retryPreview() {
        void preview.refetch();
    }

    function stop() {
        setStopRequested(run.activeTurnId ?? run.id);
        onAction({ kind: 'stop', run });
    }

    function adjust() {
        onAdjust(run);
    }

    function openDiscard() {
        setDiscarding(true);
    }

    function closeDiscard() {
        if (!busy) {
            setDiscarding(false);
        }
    }

    function discard() {
        onAction({ kind: 'discard', run });
        setDiscarding(false);
    }

    function keepSources() {
        onAction({ kind: 'resolveSource', run, choice: 'keep-snapshot' });
    }

    async function refreshSources() {
        if (busy || captureLock.current) {
            return;
        }

        captureLock.current = true;
        setCapturing(true);
        setCaptureFailed(false);
        try {
            const editorContext = await captureSourceContext?.();
            // Current chat selection references share the same captured passage.
            const sourceId = detail.data?.plan?.sources.find(
                (source) => source.reference.kind === 'selection',
            )?.id;

            onAction({
                kind: 'resolveSource',
                run,
                choice: 'refresh',
                ...(sourceId && editorContext
                    ? { sourceId, editorContext }
                    : {}),
            });
        } catch {
            setCaptureFailed(true);
        } finally {
            captureLock.current = false;
            setCapturing(false);
        }
    }

    function applyRevision() {
        if (candidate) {
            onAction({ kind: 'applyRevision', run, candidateId: candidate.id });
        }
    }

    function dismissRevision() {
        setDismissedCandidate(candidate?.id ?? null);
    }

    return (
        <>
            <LessonRunCard
                run={run}
                busy={busy || capturing}
                stopping={stopping}
                reconnecting={reconnecting}
                continueBlocked={continueBlocked}
                onContinue={continueRun}
                onStop={stop}
                onAdjust={adjust}
                onDiscard={openDiscard}
                onKeepSources={keepSources}
                onRefreshSources={refreshSources}
                onPreview={renderPreparedBody ? openPreview : undefined}
            >
                {actionNotice}
                {captureFailed && (
                    <InlineAlert tone='warning'>
                        {copy.selectionRequired}
                    </InlineAlert>
                )}
                {showCandidate && (
                    <LessonRunRevision
                        candidate={candidate}
                        run={run}
                        busy={busy || reconnecting}
                        onApply={applyRevision}
                        onDismiss={dismissRevision}
                    />
                )}
            </LessonRunCard>
            {renderPreparedBody && (
                <LessonRunPreview
                    run={run}
                    preview={preview.data}
                    open={previewOpen && run.state !== 'discarded'}
                    loading={preview.isPending}
                    failed={preview.isError}
                    accessDenied={preview.accessDenied}
                    onClose={closePreview}
                    onRetry={retryPreview}
                    renderBody={renderPreparedBody}
                />
            )}
            <Dialog
                open={discarding}
                onClose={closeDiscard}
                closeLabel={copy.cancel}
                title={copy.discardTitle}
                description={copy.discardNote}
                footer={
                    <DialogActions>
                        <Button
                            variant='secondary'
                            onClick={closeDiscard}
                            disabled={busy}
                        >
                            {copy.cancel}
                        </Button>
                        <Button
                            variant='danger'
                            onClick={discard}
                            disabled={busy}
                        >
                            {copy.discard}
                        </Button>
                    </DialogActions>
                }
            />
        </>
    );
}
