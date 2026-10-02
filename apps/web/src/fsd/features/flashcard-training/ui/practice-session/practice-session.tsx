import {
    useEffect,
    useRef,
    useState,
    type KeyboardEvent,
    type SyntheticEvent,
} from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { usePracticeSession } from '../../hooks/use-practice-session';
import { useTrainingDisplay } from '../../hooks/use-training-display';
import type { LearningApi, StartPayload } from '../../types';
import { EndSessionDialog } from '../end-session-dialog/end-session-dialog';
import { SessionHeader } from '../session-header/session-header';
import { PracticeContent } from '../practice-content/practice-content';
import styles from './practice-session.module.css';

export function PracticeSession({
    api,
    sessionId,
    payload,
    signedIn,
    dictionaryTitle,
    fullscreenRequest,
    onClose,
}: {
    api: LearningApi;
    sessionId: string;
    payload: StartPayload;
    signedIn: boolean;
    dictionaryTitle: string;
    fullscreenRequest: Promise<boolean>;
    onClose(): void;
}) {
    const { t } = useI18n();
    const session = usePracticeSession({
        api,
        sessionId,
        configuration: payload.configuration,
        shuffle: payload.shuffle,
        entryIds: payload.entryIds,
        signedIn,
    });
    const { state } = session;
    const display = useTrainingDisplay(fullscreenRequest);
    const [endOpen, setEndOpen] = useState(false);
    const dialogRef = useRef<HTMLDialogElement>(null);
    const dialogMode = display.mode === 'dialog';
    const title = t('training.practiceTitle', { name: dictionaryTitle });
    const total = state.queue.length;
    let subtitle = t('training.paused');
    if (state.phase === 'card')
        subtitle = t('training.roundCard', {
            round: state.round,
            card: Math.min(state.index + 1, total),
            total,
        });
    else if (state.phase === 'results')
        subtitle = t('training.roundResults', { round: state.round });
    else if (state.phase === 'loading') subtitle = t('training.preparing');
    const className = `${styles.frame} ${dialogMode ? styles.dialog : ''}`;
    let announcement = '';
    if (state.announcement === 'showingBack') announcement = t('training.back');
    else if (state.announcement === 'showingFront')
        announcement = t('training.front');
    else if (state.announcement === 'ratingConfirmed')
        announcement = t('training.saved');
    else if (state.announcement === 'ratingUndone')
        announcement = t('training.undo');
    else if (state.announcement === 'accessLost')
        announcement = t('training.accessLost');
    else if (state.announcement === 'roundComplete')
        announcement = t('training.roundComplete', { round: state.round });
    else if (state.announcement === 'entriesSkipped')
        announcement = t('training.removed');

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        dialog.showModal();
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            dialog.close();
            document.body.style.overflow = previous;
        };
    }, []);

    function handleEnd() {
        setEndOpen(true);
    }
    function handleKeep() {
        setEndOpen(false);
    }
    function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
        event.preventDefault();
        if (endOpen) return;
        if (display.mode === 'overlay') display.toDialog();
        else if (dialogMode) handleEnd();
    }
    function handleKey(event: KeyboardEvent<HTMLDialogElement>) {
        if (endOpen || event.defaultPrevented) return;
        const target = event.target as HTMLElement;
        if (
            target.closest(
                'input, textarea, select, [contenteditable="true"]',
            ) ||
            event.shiftKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            window.getSelection()?.toString()
        )
            return;
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            session.rate('again');
        } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            session.rate('known');
        } else if (
            (event.key === 'Enter' || event.key === ' ') &&
            !target.closest('button, a, [role="menuitem"]')
        ) {
            event.preventDefault();
            session.flip();
        }
    }

    return (
        <>
            <dialog
                ref={dialogRef}
                aria-label={title}
                aria-modal='true'
                onCancel={handleCancel}
                onKeyDown={handleKey}
                className={className}
            >
                <div className='flex h-full min-h-0 flex-col'>
                    <SessionHeader
                        dictionaryTitle={dictionaryTitle}
                        subtitle={subtitle}
                        dialogMode={dialogMode}
                        reviewed={state.roundStats.reviewed}
                        total={total}
                        showProgress={state.phase === 'card'}
                        onDialog={display.toDialog}
                        onFullscreen={display.toFullscreen}
                        onEnd={handleEnd}
                    />
                    {!signedIn && (
                        <p className='shrink-0 border-b border-border-default bg-background-subtle px-4 py-2 text-sm text-text-secondary md:px-6'>
                            {t('training.sessionOnlyNotice')}
                        </p>
                    )}
                    <PracticeContent
                        session={session}
                        display={display}
                        signedIn={signedIn}
                        dictionaryTitle={dictionaryTitle}
                        onClose={onClose}
                        contentClassName={styles.content ?? ''}
                    />
                </div>
                <div className='sr-only' aria-live='polite' aria-atomic='true'>
                    {announcement}
                </div>
            </dialog>
            <EndSessionDialog
                open={endOpen}
                signedIn={signedIn}
                saving={state.pending?.status === 'saving'}
                onKeep={handleKeep}
                onEnd={onClose}
            />
        </>
    );
}
