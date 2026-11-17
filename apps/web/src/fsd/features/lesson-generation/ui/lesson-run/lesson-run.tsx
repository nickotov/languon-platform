import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
    ConversationEditorContext,
    GenerationRunSummary,
} from '@languon/contracts';
import type { ConversationSessionRequest } from '@/fsd/entities/conversation';
import { Button, Dialog, DialogActions, InlineAlert } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { lessonRunsApi } from '../../api/lesson-runs-api';
import type { LessonRunAction } from '../../hooks/use-lesson-run-actions';
import { lessonRunCopy } from '../../lib/lesson-run-copy';
import { LessonRunCard } from '../lesson-run-card/lesson-run-card';
import { LessonRunRevision } from '../lesson-run-revision/lesson-run-revision';

export function LessonRun({
    run,
    actorId,
    request,
    busy,
    reconnecting,
    failed,
    continueBlocked,
    onAction,
    onAdjust,
    captureSourceContext,
}: {
    run: GenerationRunSummary;
    actorId: string;
    request: ConversationSessionRequest;
    busy: boolean;
    reconnecting: boolean;
    failed: boolean;
    continueBlocked: boolean;
    onAction(action: LessonRunAction): void;
    onAdjust(run: GenerationRunSummary): void;
    captureSourceContext?:
        (() => Promise<ConversationEditorContext | undefined>) | undefined;
}) {
    const { locale } = useI18n();
    const copy = lessonRunCopy(locale);
    const [dismissedCandidate, setDismissedCandidate] = useState<string | null>(
        null,
    );
    const [discarding, setDiscarding] = useState(false);
    const [stopRequested, setStopRequested] = useState<string | null>(null);
    const [capturing, setCapturing] = useState(false);
    const [captureFailed, setCaptureFailed] = useState(false);
    const captureLock = useRef(false);
    const detail = useQuery({
        queryKey: [
            'lesson-run',
            actorId,
            run.conversationId,
            run.id,
            run.revision,
            run.updatedAt,
        ],
        queryFn: ({ signal }) =>
            lessonRunsApi.detail(request, run.conversationId, run.id, signal),
        enabled: run.state === 'paused',
        retry: false,
        gcTime: 0,
    });
    const candidate =
        run.state === 'paused' ? detail.data?.revisionCandidate : undefined;
    const showCandidate = candidate && candidate.id !== dismissedCandidate;
    const stopping =
        run.activeTurnId !== null &&
        stopRequested === run.activeTurnId &&
        !failed;

    function continueRun() {
        onAction({ kind: 'continue', run });
    }

    function stop() {
        setStopRequested(run.activeTurnId);
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
            >
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
