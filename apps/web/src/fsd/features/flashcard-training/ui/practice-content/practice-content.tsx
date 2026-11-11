import type { FlashcardItem, Presentation } from '../../types';
import type { ReactNode } from 'react';
import { Undo2 } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import type { usePracticeSession } from '../../hooks/use-practice-session';
import type { useTrainingDisplay } from '../../hooks/use-training-display';
import { ConflictNotice } from '../conflict-notice/conflict-notice';
import { ResultsPanel } from '../results-panel/results-panel';
import { RetryButton } from '../retry-button/retry-button';
import { SessionStatus } from '../session-status/session-status';
import styles from './practice-content.module.css';
import { CardSkeleton } from './card-skeleton';
import { PracticeCardPhase } from './practice-card-phase';

export function PracticeContent({
    session,
    renderAudio,
    display,
    signedIn,
    dictionaryTitle,
    onClose,
    contentClassName,
}: {
    renderAudio?:
        | ((item: FlashcardItem, presentation: Presentation) => ReactNode)
        | undefined;
    session: ReturnType<typeof usePracticeSession>;
    display: ReturnType<typeof useTrainingDisplay>;
    signedIn: boolean;
    dictionaryTitle: string;
    onClose(): void;
    contentClassName: string;
}) {
    const { t } = useI18n();

    const { state } = session;

    const cardPhase = state.phase === 'card';

    const classes = `${styles.content} ${contentClassName} ${cardPhase ? styles.cardPhase : styles.otherPhase}`;

    const blocked = Boolean(
        state.pending || state.conflict || !session.currentItem,
    );

    function resolveSaving() {
        if (
            state.pending?.kind === 'rate' &&
            state.pending.status === 'saving'
        ) {
            return state.pending.rating;
        }

        return undefined;
    }

    const saving = resolveSaving();

    const position = `${state.index + 1} / ${state.queue.length}`;

    function resolveUndo() {
        if (state.lastAck && !state.pending) {
            return (
                <Button
                    desktopIconOnly
                    variant='ghost'
                    leadingIcon={<Undo2 className={styles.icon} />}
                    onClick={session.undo}
                >
                    {t('training.undo')}
                </Button>
            );
        }

        if (state.pending?.kind === 'undo') {
            return (
                <Button
                    desktopIconOnly
                    variant='ghost'
                    leadingIcon={<Undo2 className={styles.icon} />}
                    loading
                    disabled
                >
                    {t('training.undoing')}
                </Button>
            );
        }

        return null;
    }

    const undo = resolveUndo();

    const flipDisabled = Boolean(state.pending);

    return (
        <div className={styles.scroll}>
            <div className={classes}>
                {display.notice && (
                    <InlineAlert
                        onDismiss={display.dismissNotice}
                        dismissLabel={t('training.dismiss')}
                    >
                        {t('training.fullscreenNotice')}
                    </InlineAlert>
                )}
                {state.notices.map((notice, index) => (
                    <SkipNotice
                        key={`${notice}-${index}`}
                        index={index}
                        onDismiss={session.dismissNotice}
                    />
                ))}
                {state.conflict && (
                    <ConflictNotice
                        kind={state.conflict}
                        busy={state.conflictBusy}
                        onReload={session.resolveContentConflict}
                        onDismiss={session.dismissConflict}
                    />
                )}
                {state.pending?.status === 'error' && (
                    <InlineAlert
                        tone='error'
                        title={t('training.saveFailed')}
                        actions={
                            <RetryButton
                                retryAt={state.pending.retryAt}
                                onRetry={session.retry}
                            />
                        }
                    >
                        {t('training.saveFailedHelp')}
                    </InlineAlert>
                )}
                {state.pending?.status === 'saving' && (
                    <p role='status' className={styles.saving}>
                        {t('training.saving')}
                    </p>
                )}
                {state.phase === 'loading' && <CardSkeleton />}
                {cardPhase && (
                    <PracticeCardPhase
                        session={session}
                        renderAudio={renderAudio}
                        blocked={blocked}
                        saving={saving}
                        position={position}
                        flipDisabled={flipDisabled}
                        undo={undo}
                    />
                )}
                {state.phase === 'results' && (
                    <ResultsPanel
                        state={state}
                        signedIn={signedIn}
                        dictionaryTitle={dictionaryTitle}
                        onRetryProgress={session.refreshProgress}
                        onPractiseAgain={session.practiseAgain}
                        onStartOver={session.startOver}
                        onFinish={onClose}
                        undo={undo}
                    />
                )}
                {(state.phase === 'error' || state.phase === 'unavailable') && (
                    <SessionStatus
                        state={state}
                        signedIn={signedIn}
                        onRetry={session.retryLoad}
                        onClose={onClose}
                    />
                )}
            </div>
        </div>
    );
}

function SkipNotice({
    index,
    onDismiss,
}: {
    index: number;
    onDismiss(index: number): void;
}) {
    const { t } = useI18n();

    function dismiss() {
        onDismiss(index);
    }

    return (
        <InlineAlert
            title={t('training.cardSkipped')}
            onDismiss={dismiss}
            dismissLabel={t('training.dismiss')}
        >
            {t('training.removed')}
        </InlineAlert>
    );
}
