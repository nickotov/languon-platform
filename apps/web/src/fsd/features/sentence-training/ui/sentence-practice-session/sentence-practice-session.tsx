'use client';
import { Flag, Scale } from 'lucide-react';
import { restoreSentenceTopLayer } from '../restore-sentence-top-layer';
import { useSentenceDisplay } from '../use-sentence-display';
import { useSentenceCopy } from '../sentence-copy';

import {
    type ReactNode,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import {
    Button,
    Dialog,
    InlineAlert,
    LoadingState,
    Textarea,
} from '@/fsd/shared/ui';
import { SENTENCE_LIMITS, type SentenceAttempt } from '@languon/contracts';
import type { ApiError } from '../../lib/api-error';
import type { SentenceSessionController } from '../../types';
import {
    AiResultPanel,
    ReferencePanel,
    SentenceWithHints,
    languageDirection,
} from '../sentence-content/sentence-content';
import { SentenceErrorNotice } from '../sentence-errors/sentence-errors';
import { SentenceJobStatus } from '../sentence-job-status/sentence-job-status';
import { SentenceReferenceComparison } from '../sentence-reference-comparison/sentence-reference-comparison';
import { SentenceSessionResults } from '../sentence-session-results/sentence-session-results';

import { SentencePracticeHeader } from '../sentence-practice-header/sentence-practice-header';
import { SentencePracticeFooter } from '../sentence-practice-footer/sentence-practice-footer';

export type SentencePracticeSessionProps = {
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
    const draftRef = useRef<HTMLTextAreaElement>(null);
    const frameRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        if (open && display.mode === 'fullscreen')
            restoreSentenceTopLayer(
                frameRef.current?.closest('dialog') ?? null,
            );
    }, [open, display.mode]);
    useEffect(() => {
        if (!open || !window.visualViewport) return;
        const viewport = window.visualViewport;
        const dialog = frameRef.current?.closest('dialog');
        if (!dialog) return;
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
        )
            return;
        if (c.exercise) draftRef.current?.focus();
        else
            frameRef.current
                ?.querySelector<HTMLButtonElement>('button')
                ?.focus();
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
        )
            return;
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
        if (fullscreen) display.toDialog();
        else display.toFullscreen();
    }
    function close() {
        if (preferencesOpen) {
            onPreferencesClose?.(closePracticeWithGuard);
            return;
        }
        closePracticeWithGuard();
    }
    function closePracticeWithGuard() {
        if (hasUnsentDraft || c.busy || c.uncertain || c.referenceLoading)
            setConfirmClose(true);
        else finish();
    }
    function backToPractice() {
        if (historyOpen) onHistoryClose?.();
        else onPreferencesClose?.();
    }
    function nextSentence() {
        if (c.attempt || c.reference) void c.next();
        else void c.skip();
    }
    function finish() {
        setConfirmClose(false);
        void leaveFullscreen();
        onClose();
    }
    const exercise = c.exercise;
    const jobPending = c.job && ['queued', 'running'].includes(c.job.state);
    const completed = !!(c.attempt || c.reference);
    const hasRoundCoverage = c.roundEligibleCount !== null;
    let emptyTitle = t('No eligible sentences');
    if (c.roundComplete) emptyTitle = t('Round complete');
    else if (c.emptyReason === 'review-exhausted')
        emptyTitle = t('Saved review complete');
    let nextLabel = t('Skip');
    if (c.roundComplete) nextLabel = t('Skip and finish');
    else if (completed) nextLabel = t('Next sentence');
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
    if (preferencesOpen) headerTitle = t('AI settings');
    else if (historyOpen) headerTitle = t('My practice history');
    const dialogLabel = headerTitle;
    if (!innerView && dictionaryTitle) headerTitle += ` · ${dictionaryTitle}`;
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
    return (
        <Dialog
            open={open}
            size='viewport'
            closeLabel={dialogLabel}
            showHeader={false}
            showCloseButton={false}
            dismissOnOverlayClick={false}
            onClose={() => {
                if (confirmClose) return;
                if (historyOpen) {
                    onHistoryClose?.();
                    return;
                }
                if (preferencesOpen) {
                    onPreferencesClose?.();
                    return;
                }
                if (fullscreen) void leaveFullscreen();
                else close();
            }}
            className='!bg-background-canvas'
            bodyClassName='!p-0 !text-text-primary'
            footerClassName='!bg-background-surface !px-4 !pt-3 !pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:!px-6'
            footer={
                preferencesOpen ||
                historyOpen ||
                !['loading', 'exercise'].includes(c.phase)
                    ? undefined
                    : footer
            }
        >
            <div
                ref={frameRef}
                className='sticky top-0 z-20 bg-background-surface'
            >
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
                className='mx-auto min-h-64 max-w-3xl space-y-5 px-4 py-5 sm:px-6 md:py-8'
            >
                {c.phase === 'completed' ? (
                    <SentenceSessionResults controller={c} />
                ) : (
                    <>
                        {c.progressError ? (
                            <InlineAlert
                                tone='warning'
                                title={t('Progress unavailable')}
                                actions={
                                    <Button
                                        variant='secondary'
                                        size='compact'
                                        onClick={() => void c.retryProgress()}
                                    >
                                        {t('Try again')}
                                    </Button>
                                }
                            >
                                {t(
                                    c.progress
                                        ? 'Showing the last loaded progress.'
                                        : 'Your progress could not be loaded. Your draft is kept.',
                                )}
                            </InlineAlert>
                        ) : null}
                        {fallback ? (
                            <InlineAlert tone='info'>
                                {t(
                                    'Native fullscreen is unavailable. Practice fills the window; your session is preserved.',
                                )}
                            </InlineAlert>
                        ) : null}
                        {c.error ? (
                            <SentenceErrorNotice
                                error={c.error}
                                onRetry={
                                    c.canRetry
                                        ? () => void c.retry()
                                        : undefined
                                }
                                onOpenPreferences={onOpenPreferences}
                            />
                        ) : null}
                        {c.uncertain ? (
                            <InlineAlert tone='warning'>
                                {t(
                                    'The task may still be running. Recover its result before submitting again.',
                                )}
                            </InlineAlert>
                        ) : null}
                        {c.phase === 'loading' && !jobPending ? (
                            <LoadingState>{t('Loading sentence')}</LoadingState>
                        ) : null}
                        {c.job?.state === 'cancelled' ? (
                            <InlineAlert tone='info'>
                                {t(
                                    'Task cancelled. Credits depend on work already performed. Your existing answers are kept.',
                                )}
                            </InlineAlert>
                        ) : null}
                        {c.phase === 'empty' ? (
                            <div className='rounded-xl border border-border-default p-6 text-center'>
                                <h3 className='font-semibold'>{emptyTitle}</h3>
                                <p className='mt-2 text-sm text-text-secondary'>
                                    {t(
                                        'You have reached the end of this session. Start another session to change your words or sentence mode.',
                                    )}
                                </p>
                                <div className='mt-3 flex flex-wrap justify-center gap-2'>
                                    {c.emptyReason === 'review-exhausted' ? (
                                        <Button
                                            variant='secondary'
                                            disabled={c.busy || c.uncertain}
                                            onClick={() =>
                                                void c.restartReview()
                                            }
                                        >
                                            {t('Restart saved review')}
                                        </Button>
                                    ) : null}
                                    <Button
                                        disabled={c.busy || c.uncertain}
                                        onClick={() =>
                                            void c.changeMode('new-only')
                                        }
                                    >
                                        {t('Generate new sentences')}
                                    </Button>
                                </div>
                            </div>
                        ) : null}
                        {jobPending && c.job?.kind === 'sentence-generation' ? (
                            <>
                                <div
                                    aria-hidden
                                    className='rounded-xl border border-border-default bg-background-surface p-5'
                                >
                                    <div className='h-[1.9rem] w-[88%] animate-pulse rounded bg-background-subtle' />
                                    <div className='mt-3 h-[1.9rem] w-[54%] animate-pulse rounded bg-background-subtle' />
                                </div>
                                <SentenceJobStatus
                                    job={c.job}
                                    onCancel={cancelRequest}
                                />
                            </>
                        ) : null}
                        {exercise ? (
                            <>
                                <p className='inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-border-default bg-background-surface px-2 py-1 text-sm font-medium text-text-primary'>
                                    {`${languageName(exercise.sourceLanguage)} → ${languageName(exercise.targetLanguage)}${c.configuration ? ` · ${t(c.configuration.mode === 'saved-first' ? 'Saved first' : c.configuration.mode === 'new-only' ? 'New only' : 'Review only')} · ${t('Feedback in {language}').replace('{language}', languageName(c.configuration.explanationLanguage ?? 'en'))}` : ''}`}
                                </p>
                                {c.roundComplete ? (
                                    <div
                                        role='status'
                                        className='flex items-start gap-2 rounded-xl border border-border-strong bg-background-surface p-3 text-sm text-text-primary'
                                    >
                                        <Flag
                                            aria-hidden
                                            className='mt-0.5 h-4 w-4 shrink-0 text-primary-default'
                                        />
                                        <p>
                                            <strong>
                                                {t('Last sentence.')}
                                            </strong>{' '}
                                            {t(
                                                'Check, compare or skip this sentence to see your results.',
                                            )}
                                        </p>
                                    </div>
                                ) : null}
                                <div className='rounded-xl border border-border-default bg-background-surface p-4 sm:p-6'>
                                    <SentenceWithHints
                                        key={exercise.id}
                                        exercise={exercise}
                                        revealedHintIds={c.revealedHintIds}
                                        onReveal={c.toggleHint}
                                    />
                                </div>
                                <Textarea
                                    ref={draftRef}
                                    label={t(
                                        'Your translation ({language})',
                                    ).replace(
                                        '{language}',
                                        languageName(exercise.targetLanguage),
                                    )}
                                    lang={exercise.targetLanguage}
                                    dir={languageDirection(
                                        exercise.targetLanguage,
                                    )}
                                    value={c.draft}
                                    onChange={(event) =>
                                        c.setDraft(event.target.value)
                                    }
                                    rows={3}
                                    className='text-base'
                                    {...(draftOverLimit
                                        ? {
                                              error: t(
                                                  'Your answer is over the 4,000-character limit.',
                                              ),
                                          }
                                        : {})}
                                    disabled={c.busy || c.uncertain}
                                    description={t(
                                        'Use the matching dictionary words. Hints and reference use do not reduce the AI score.',
                                    )}
                                />
                                {draftLength >=
                                Math.floor(
                                    SENTENCE_LIMITS.answerCodePoints * 0.85,
                                ) ? (
                                    <p
                                        aria-live='polite'
                                        className={
                                            draftOverLimit
                                                ? 'text-right text-xs text-danger-default'
                                                : 'text-right text-xs text-text-secondary'
                                        }
                                    >
                                        {draftLength} /{' '}
                                        {SENTENCE_LIMITS.answerCodePoints}
                                    </p>
                                ) : null}
                                {jobPending &&
                                c.job?.kind === 'sentence-check' ? (
                                    <SentenceJobStatus
                                        job={c.job}
                                        onCancel={cancelRequest}
                                    />
                                ) : null}
                                {c.attempt ? (
                                    <AiResultPanel
                                        key={c.attempt.id}
                                        attempt={c.attempt}
                                    />
                                ) : null}
                            </>
                        ) : null}
                        {exercise &&
                        (previousAttempts.length > 0 ||
                            previousAttemptsLoading ||
                            previousAttemptsError) ? (
                            <details className='rounded-xl border border-border-default p-4'>
                                <summary className='cursor-pointer text-sm font-medium'>
                                    {t('Earlier attempts for this sentence')}
                                </summary>
                                <div className='mt-3 space-y-3'>
                                    {previousAttemptsLoading ? (
                                        <LoadingState>
                                            {t('Loading history')}
                                        </LoadingState>
                                    ) : null}
                                    {previousAttemptsError ? (
                                        <SentenceErrorNotice
                                            error={previousAttemptsError}
                                            onRetry={onRetryPreviousAttempts}
                                        />
                                    ) : null}
                                    {!previousAttemptsLoading &&
                                    !previousAttemptsError &&
                                    !previousAttempts.length ? (
                                        <p className='text-sm text-text-secondary'>
                                            {t('No earlier attempts yet.')}
                                        </p>
                                    ) : null}
                                    {previousAttempts.map((attempt) => (
                                        <AiResultPanel
                                            key={attempt.id}
                                            attempt={attempt}
                                        />
                                    ))}
                                </div>
                            </details>
                        ) : null}
                        {exercise ? (
                            <>
                                {!c.reference ? (
                                    <section className='space-y-3 rounded-xl border border-dashed border-border-strong bg-background-subtle p-4'>
                                        <div className='flex flex-wrap items-start justify-between gap-3'>
                                            <div className='min-w-0 max-w-prose'>
                                                <h3 className='flex items-center gap-1.5 text-sm font-semibold text-text-primary'>
                                                    <Scale
                                                        aria-hidden
                                                        className='h-4 w-4'
                                                    />
                                                    {t('Two ways to check')}
                                                </h3>
                                                <p className='mt-1 text-xs text-text-secondary'>
                                                    {t(
                                                        'Check with AI evaluates meaning, grammar and required words — may need credits.',
                                                    )}{' '}
                                                    {t(
                                                        'The free reference action needs no AI.',
                                                    )}
                                                </p>
                                                <p
                                                    id='practice-compare-note'
                                                    className='mt-1 text-xs text-text-secondary'
                                                >
                                                    {t(
                                                        c.draft.trim()
                                                            ? 'Comparison ignores case, spacing, punctuation and apostrophe style. Accents and word order matter.'
                                                            : 'Reveals one saved translation. No comparison is made without an answer.',
                                                    )}{' '}
                                                    {t(
                                                        'Revealing records a manual review — no grade, no credits.',
                                                    )}
                                                </p>
                                            </div>
                                            {c.referenceLoading ? (
                                                <p
                                                    role='status'
                                                    className='text-xs font-medium text-text-secondary'
                                                >
                                                    {t('Revealing…')}
                                                </p>
                                            ) : null}
                                        </div>
                                    </section>
                                ) : null}
                                {c.referenceError ? (
                                    <SentenceErrorNotice
                                        error={c.referenceError}
                                        onRetry={() => void c.revealReference()}
                                    />
                                ) : null}
                                {c.comparison ? (
                                    <SentenceReferenceComparison
                                        comparison={c.comparison}
                                        exercise={exercise}
                                        onRecompare={() => {
                                            void c.recompare();
                                        }}
                                        disabled={
                                            c.busy ||
                                            c.uncertain ||
                                            c.referenceLoading ||
                                            !c.draft.trim()
                                        }
                                    />
                                ) : c.reference ? (
                                    <ReferencePanel
                                        key={c.reference.id}
                                        review={c.reference}
                                    />
                                ) : null}
                            </>
                        ) : null}
                    </>
                )}
            </div>
            {preferencesContent}
            {historyContent}
            <Dialog
                open={confirmClose}
                onClose={() => setConfirmClose(false)}
                title={t('Leave practice?')}
                footer={
                    <div className='flex justify-end gap-2'>
                        <Button
                            variant='secondary'
                            onClick={() => setConfirmClose(false)}
                        >
                            {t('Keep practising')}
                        </Button>
                        <Button onClick={finish}>{t('Leave practice')}</Button>
                    </div>
                }
            >
                <p className='text-sm text-text-secondary'>
                    {t(
                        'Your unsent draft will be discarded. An AI task or reference review already started may continue and be saved to your personal history. Leaving does not cancel pending work or guarantee a refund.',
                    )}
                </p>
            </Dialog>
        </Dialog>
    );
}
