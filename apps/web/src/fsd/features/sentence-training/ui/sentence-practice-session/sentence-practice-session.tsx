'use client';
import { ActionConsentDialog } from '@/fsd/entities/ai-action';
import styles from './sentence-practice-session.module.css';
import { restoreSentenceTopLayer } from '../restore-sentence-top-layer';
import { useSentenceDisplay } from '../use-sentence-display';
import { useSentenceCopy } from '../sentence-copy';

import {
    type ReactNode,
    type SyntheticEvent,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { Button, Dialog, DialogActions } from '@/fsd/shared/ui';
import { SENTENCE_LIMITS, type SentenceAttempt } from '@languon/contracts';
import type { ApiError } from '../../lib/api-error';
import type {
    SentenceSessionController,
    SentenceAudioRenderer,
} from '../../types';
import { SentenceSessionResults } from '../sentence-session-results/sentence-session-results';

import { SentencePracticeHeader } from '../sentence-practice-header/sentence-practice-header';
import { SentencePracticeFooter } from '../sentence-practice-footer/sentence-practice-footer';

import { SentencePracticeNotices } from './sentence-practice-notices';
import { SentencePracticeExercise } from './sentence-practice-exercise';
import { SentenceEarlierAttempts } from './sentence-earlier-attempts';
import { SentencePracticeReference } from './sentence-practice-reference';

export type SentencePracticeSessionProps = {
    renderAudio?: SentenceAudioRenderer;
    controller: SentenceSessionController;
    open: boolean;
    onClose(): void;
    dictionaryTitle?: string;
    initialFullscreen?: Promise<boolean> | undefined;
    onOpenPreferences?(): void;
    onOpenHistory?(): void;
    preferencesContent?: ReactNode;
    historyContent?: ReactNode;
    historyOpen?: boolean;
    onHistoryClose?(): void;
    preferencesOpen?: boolean;
    previousAttempts?: SentenceAttempt[];
    previousAttemptsLoading?: boolean;
    previousAttemptsError?: ApiError | null;
    onRetryPreviousAttempts?(): void;
    onPreferencesClose?(afterClose?: () => void): void;
};

export function SentencePracticeSession({
    controller: c,

    renderAudio,
    open,
    onClose,
    dictionaryTitle,
    initialFullscreen,
    onOpenPreferences,
    onOpenHistory,
    preferencesContent,
    historyContent,
    historyOpen,
    onHistoryClose,
    preferencesOpen,
    onPreferencesClose,
    previousAttempts = [],
    previousAttemptsLoading,
    previousAttemptsError,
    onRetryPreviousAttempts,
}: SentencePracticeSessionProps) {
    const { t, languageName } = useSentenceCopy();
    const display = useSentenceDisplay(initialFullscreen);
    const fullscreen = display.mode !== 'dialog';
    const fallback = display.notice;
    const [confirmClose, setConfirmClose] = useState(false);
    const [earlierAttemptsOpen, setEarlierAttemptsOpen] = useState(false);
    useEffect(() => setEarlierAttemptsOpen(false), [c.exercise?.id]);
    function toggleEarlierAttempts(event: SyntheticEvent<HTMLDetailsElement>) {
        setEarlierAttemptsOpen(event.currentTarget.open);
    }

    const draftRef = useRef<HTMLTextAreaElement>(null);
    const frameRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        if (open && display.mode === 'fullscreen') {
            restoreSentenceTopLayer(
                frameRef.current?.closest('dialog') ?? null,
            );
        }
    }, [open, display.mode]);

    useEffect(() => {
        if (!open || !window.visualViewport) {
            return;
        }

        const viewport = window.visualViewport;
        const dialog = frameRef.current?.closest('dialog');
        if (!dialog) {
            return;
        }

        const previousHeight = dialog.style.height;
        const previousTop = dialog.style.top;
        const update = () => {
            dialog.style.height = `${Math.min(window.innerHeight, viewport.height)}px`;
            dialog.style.top = `${viewport.offsetTop}px`;
        };

        update();
        viewport.addEventListener('resize', update);
        viewport.addEventListener('scroll', update);

        return () => {
            viewport.removeEventListener('resize', update);
            viewport.removeEventListener('scroll', update);
            dialog.style.height = previousHeight;
            dialog.style.top = previousTop;
        };
    }, [open]);

    const hasUnsentDraft =
        c.phase !== 'completed' &&
        !!c.draft.trim() &&
        c.draft !== c.acknowledgedAnswer;
    const draftLength = Array.from(c.draft).length;
    const draftOverLimit = draftLength > SENTENCE_LIMITS.answerCodePoints;
    useEffect(() => {
        if (
            !open ||
            preferencesOpen ||
            historyOpen ||
            confirmClose ||
            c.phase === 'completed'
        ) {
            return;
        }

        if (c.exercise) {
            draftRef.current?.focus();
        } else {
            frameRef.current
                ?.querySelector<HTMLButtonElement>('button')
                ?.focus();
        }
    }, [
        c.exercise?.id,
        c.phase,
        open,
        preferencesOpen,
        historyOpen,
        confirmClose,
    ]);

    useEffect(() => {
        if (
            !open ||
            (!hasUnsentDraft && !c.busy && !c.uncertain && !c.referenceLoading)
        ) {
            return;
        }

        const beforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
        };

        window.addEventListener('beforeunload', beforeUnload);

        return () => window.removeEventListener('beforeunload', beforeUnload);
    }, [open, hasUnsentDraft, c.busy, c.uncertain, c.referenceLoading]);

    function leaveFullscreen() {
        display.toDialog();
    }

    function togglePresentation() {
        if (fullscreen) {
            display.toDialog();
        } else {
            display.toFullscreen();
        }
    }

    function close() {
        if (preferencesOpen) {
            onPreferencesClose?.(closePracticeWithGuard);

            return;
        }

        closePracticeWithGuard();
    }

    function closePracticeWithGuard() {
        if (hasUnsentDraft || c.busy || c.uncertain || c.referenceLoading) {
            setConfirmClose(true);
        } else {
            finish();
        }
    }

    function backToPractice() {
        if (historyOpen) {
            onHistoryClose?.();
        } else {
            onPreferencesClose?.();
        }
    }

    function nextSentence() {
        if (c.attempt || c.reference) {
            void c.next();
        } else {
            void c.skip();
        }
    }

    function finish() {
        setConfirmClose(false);
        void leaveFullscreen();
        onClose();
    }

    const exercise = c.exercise;
    const sessionId = c.sessionId;
    const promptAudio =
        exercise && sessionId
            ? renderAudio?.({ kind: 'prompt', id: exercise.id, sessionId })
            : null;
    const referenceAudio =
        exercise && sessionId
            ? renderAudio?.({ kind: 'reference', id: exercise.id, sessionId })
            : null;
    const checkedAudio = c.attempt
        ? renderAudio?.({ kind: 'checked-answer', id: c.attempt.id })
        : null;
    const jobPending = c.job && ['queued', 'running'].includes(c.job.state);
    const completed = !!(c.attempt || c.reference);
    const hasRoundCoverage = c.roundEligibleCount !== null;
    let emptyTitle = t('No eligible sentences');
    if (c.roundComplete) {
        emptyTitle = t('Round complete');
    } else if (c.emptyReason === 'review-exhausted') {
        emptyTitle = t('Saved review complete');
    }

    let nextLabel = t('Skip');
    if (c.roundComplete) {
        nextLabel = t('Skip and finish');
    } else if (completed) {
        nextLabel = t('Next sentence');
    }

    function compareAnswer() {
        void c.recompare();
    }

    function revealReference() {
        void c.revealReference();
    }

    function cancelRequest() {
        void c.cancel();
    }

    function checkAnswer() {
        void c.check();
    }

    const innerView = !!(preferencesOpen || historyOpen);
    let headerTitle = t('Sentence practice');
    if (preferencesOpen) {
        headerTitle = t('AI settings');
    } else if (historyOpen) {
        headerTitle = t('My practice history');
    }

    const dialogLabel = headerTitle;
    if (!innerView && dictionaryTitle) {
        headerTitle += ` · ${dictionaryTitle}`;
    }

    let headerSubtitle = t('Your answer and exercise are kept');
    if (!innerView) {
        if (c.phase === 'completed') {
            headerSubtitle = t(
                c.replaying ? 'Replay complete' : 'Round complete',
            );
        } else {
            const direction = exercise
                ? `${languageName(exercise.sourceLanguage)} → ${languageName(exercise.targetLanguage)} · `
                : '';
            const coverage = hasRoundCoverage
                ? `${c.roundEntryCount} / ${c.roundEligibleCount} ${t('Selected words seen')}`
                : t(
                      c.progressLoading
                          ? 'Loading progress…'
                          : 'Progress unavailable',
                  );

            headerSubtitle = `${direction}${t('Sentence')} ${Math.max(1, c.counts.presented)} · ${coverage}`;
        }
    }

    const actionPending = c.busy || c.uncertain || c.referenceLoading;
    const footer = (
        <SentencePracticeFooter
            hasExercise={!!exercise}
            hasDraft={!!c.draft.trim()}
            referenceShown={!!c.reference}
            showNext={!!exercise || c.phase === 'empty'}
            completed={completed}
            nextLabel={nextLabel}
            nextDisabled={actionPending || c.phase === 'empty'}
            comparisonDisabled={actionPending || !c.draft.trim()}
            referenceDisabled={actionPending || !!c.reference}
            checkDisabled={actionPending || !c.draft.trim() || draftOverLimit}
            referenceLoading={c.referenceLoading}
            checkLoading={!!jobPending && c.job?.kind === 'sentence-check'}
            onNext={nextSentence}
            onCompare={compareAnswer}
            onRevealReference={revealReference}
            onCheck={checkAnswer}
        />
    );

    function handleDialogClose() {
        if (confirmClose) {
            return;
        }

        if (historyOpen) {
            onHistoryClose?.();

            return;
        }

        if (preferencesOpen) {
            onPreferencesClose?.();

            return;
        }

        if (fullscreen) {
            void leaveFullscreen();
        } else {
            close();
        }
    }

    function keepPractising() {
        setConfirmClose(false);
    }

    return (
        <Dialog
            open={open}
            size='viewport'
            closeLabel={dialogLabel}
            showHeader={false}
            showCloseButton={false}
            dismissOnOverlayClick={false}
            onClose={handleDialogClose}
            className={styles.practiceDialog}
            bodyClassName={styles.practiceBody}
            footerClassName={styles.practiceFooter}
            footer={
                preferencesOpen ||
                historyOpen ||
                !['loading', 'exercise'].includes(c.phase)
                    ? undefined
                    : footer
            }
        >
            <div ref={frameRef} className={styles.stickyHeader}>
                <SentencePracticeHeader
                    title={headerTitle}
                    subtitle={headerSubtitle}
                    innerView={innerView}
                    fullscreen={fullscreen}
                    onBack={backToPractice}
                    onTogglePresentation={togglePresentation}
                    onClose={close}
                    onOpenPreferences={onOpenPreferences}
                    onOpenHistory={onOpenHistory}
                />
            </div>
            <div
                hidden={preferencesOpen || historyOpen}
                className={styles.practiceContent}
            >
                {c.actionConsent && (
                    <ActionConsentDialog
                        quote={c.actionConsent.quote}
                        onSend={c.actionConsent.confirm}
                        onClose={c.actionConsent.cancel}
                    />
                )}
                {c.phase === 'completed' ? (
                    <SentenceSessionResults
                        controller={c}
                        renderAudio={innerView ? undefined : renderAudio}
                    />
                ) : (
                    <>
                        <SentencePracticeNotices
                            c={c}
                            fallback={fallback}
                            jobPending={jobPending}
                            emptyTitle={emptyTitle}
                            onCancel={cancelRequest}
                            onOpenPreferences={onOpenPreferences}
                        />
                        {exercise ? (
                            <SentencePracticeExercise
                                c={c}
                                exercise={exercise}
                                draftRef={draftRef}
                                draftLength={draftLength}
                                draftOverLimit={draftOverLimit}
                                innerView={innerView}
                                promptAudio={promptAudio}
                                checkedAudio={checkedAudio}
                                jobPending={jobPending}
                                onCancel={cancelRequest}
                            />
                        ) : null}
                        {exercise &&
                        (previousAttempts.length > 0 ||
                            previousAttemptsLoading ||
                            previousAttemptsError) ? (
                            <SentenceEarlierAttempts
                                key={exercise.id}
                                exerciseId={exercise.id}
                                previousAttempts={previousAttempts}
                                previousAttemptsLoading={
                                    previousAttemptsLoading
                                }
                                previousAttemptsError={previousAttemptsError}
                                onRetryPreviousAttempts={
                                    onRetryPreviousAttempts
                                }
                                onToggle={toggleEarlierAttempts}
                                innerView={innerView}
                                earlierAttemptsOpen={earlierAttemptsOpen}
                                renderAudio={renderAudio}
                            />
                        ) : null}
                        {exercise ? (
                            <SentencePracticeReference
                                c={c}
                                exercise={exercise}
                                innerView={innerView}
                                referenceAudio={referenceAudio}
                            />
                        ) : null}
                    </>
                )}
            </div>
            {preferencesContent}
            {historyContent}
            <Dialog
                open={confirmClose}
                onClose={keepPractising}
                title={t('Leave practice?')}
                footer={
                    <DialogActions className={styles.comparisonActions}>
                        <Button variant='secondary' onClick={keepPractising}>
                            {t('Keep practising')}
                        </Button>
                        <Button onClick={finish}>{t('Leave practice')}</Button>
                    </DialogActions>
                }
            >
                <p className={styles.referenceNote}>
                    {t(
                        'Your unsent draft will be discarded. An AI task or reference review already started may continue and be saved to your personal history. Leaving does not cancel pending work or guarantee a refund.',
                    )}
                </p>
            </Dialog>
        </Dialog>
    );
}
