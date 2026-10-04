'use client';
import { restoreSentenceTopLayer } from '../restore-sentence-top-layer';
import { useSentenceDisplay } from '../use-sentence-display';
import { useCompactPresentation } from '../use-compact-presentation';
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
    preferencesOpen?: boolean;
    previousAttempts?: SentenceAttempt[];
    previousAttemptsLoading?: boolean;
    previousAttemptsError?: ApiError | null;
    onRetryPreviousAttempts?(): void;
    onPreferencesClose?(): void;
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
    preferencesOpen,
    previousAttempts = [],
    previousAttemptsLoading,
    previousAttemptsError,
    onRetryPreviousAttempts,
}: SentencePracticeSessionProps) {
    const { t, languageName } = useSentenceCopy();
    const compact = useCompactPresentation();
    const display = useSentenceDisplay(initialFullscreen);
    const fullscreen = display.mode !== 'dialog';
    const fallback = display.notice;
    const [confirmClose, setConfirmClose] = useState(false);
    const [summary, setSummary] = useState(false);
    const draftRef = useRef<HTMLTextAreaElement>(null);
    const frameRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        if (open && display.mode === 'fullscreen')
            restoreSentenceTopLayer(
                frameRef.current?.closest('dialog') ?? null,
            );
    }, [open, display.mode]);
    const hasUnsentDraft = !!c.draft.trim() && c.draft !== c.acknowledgedAnswer;
    const draftLength = Array.from(c.draft).length;
    const draftOverLimit = draftLength > SENTENCE_LIMITS.answerCodePoints;
    useEffect(() => {
        if (c.exercise) draftRef.current?.focus();
    }, [c.exercise?.id]);
    useEffect(() => {
        if (!open || (!hasUnsentDraft && !c.busy && !c.uncertain)) return;
        const beforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
        };
        window.addEventListener('beforeunload', beforeUnload);
        return () => window.removeEventListener('beforeunload', beforeUnload);
    }, [open, hasUnsentDraft, c.busy, c.uncertain]);
    function leaveFullscreen() {
        display.toDialog();
    }
    function togglePresentation() {
        if (fullscreen) display.toDialog();
        else display.toFullscreen();
    }
    function close() {
        if (hasUnsentDraft || c.busy || c.uncertain) setConfirmClose(true);
        else finish();
    }
    function finish() {
        setConfirmClose(false);
        void leaveFullscreen();
        onClose();
    }
    const exercise = c.exercise;
    const jobPending = c.job && ['queued', 'running'].includes(c.job.state);
    const completed = !!(c.attempt || c.reference);
    const footer = (
        <div className='mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3'>
            <div className='flex flex-wrap gap-2'>
                {exercise ? (
                    <>
                        <Button
                            variant={completed ? 'secondary' : 'primary'}
                            loading={
                                !!jobPending && c.job?.kind === 'sentence-check'
                            }
                            disabled={
                                c.busy ||
                                c.uncertain ||
                                c.referenceLoading ||
                                !c.draft.trim() ||
                                draftOverLimit
                            }
                            onClick={() => void c.check()}
                        >
                            {t(
                                completed
                                    ? 'Check new answer'
                                    : 'Check with AI',
                            )}
                        </Button>
                        <Button
                            variant='secondary'
                            loading={c.referenceLoading}
                            disabled={
                                !!c.reference ||
                                c.referenceLoading ||
                                c.uncertain
                            }
                            onClick={() => void c.revealReference()}
                        >
                            {t('Show reference answer — free')}
                        </Button>
                    </>
                ) : null}
            </div>
            {exercise || c.phase === 'empty' ? (
                <Button
                    variant={completed ? 'primary' : 'secondary'}
                    disabled={
                        c.busy ||
                        c.uncertain ||
                        c.referenceLoading ||
                        c.phase === 'empty'
                    }
                    onClick={() => void c.next()}
                >
                    {t(completed ? 'Next sentence' : 'Skip sentence')}
                </Button>
            ) : null}
        </div>
    );
    return (
        <Dialog
            open={open}
            size='lg'
            closeLabel={t('Sentence practice')}
            showHeader={false}
            showCloseButton={false}
            dismissOnOverlayClick={false}
            onClose={() => {
                if (preferencesOpen || summary || confirmClose) return;
                if (fullscreen) void leaveFullscreen();
                else close();
            }}
            className={
                fullscreen || compact
                    ? '!fixed !inset-0 !m-0 !h-[100dvh] !max-h-[100dvh] !w-screen !max-w-none !rounded-none'
                    : ''
            }
            bodyClassName='!p-0'
            footerClassName='pb-[max(1rem,env(safe-area-inset-bottom))]'
            footer={footer}
        >
            <div
                ref={frameRef}
                className='sticky top-0 z-20 bg-background-surface'
            >
                <header className='flex flex-wrap items-center justify-between gap-3 border-b border-border-default px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]'>
                    <div>
                        <h2 className='font-semibold'>
                            {t('Sentence practice')}
                        </h2>
                        {dictionaryTitle ? (
                            <p className='text-xs text-text-secondary'>
                                {dictionaryTitle}
                            </p>
                        ) : null}
                        {c.configuration ? (
                            <p className='mt-1 text-xs text-text-secondary'>
                                {c.exercise ? (
                                    <>
                                        {languageName(
                                            c.exercise.sourceLanguage,
                                        )}{' '}
                                        →{' '}
                                        {languageName(
                                            c.exercise.targetLanguage,
                                        )}
                                        {' · '}
                                    </>
                                ) : null}
                                {t(
                                    c.configuration.mode === 'saved-first'
                                        ? 'Saved first'
                                        : c.configuration.mode === 'new-only'
                                          ? 'New only'
                                          : 'Review only',
                                )}
                                {' · '}
                                {t('Feedback in {language}').replace(
                                    '{language}',
                                    languageName(
                                        c.configuration.explanationLanguage ??
                                            'en',
                                    ),
                                )}
                            </p>
                        ) : null}
                    </div>
                    <div className='flex flex-wrap gap-2'>
                        <Button
                            variant='secondary'
                            size='compact'
                            onClick={() => setSummary(true)}
                        >
                            {t('Summary')}
                        </Button>
                        {onOpenHistory ? (
                            <Button
                                variant='ghost'
                                size='compact'
                                onClick={onOpenHistory}
                            >
                                {t('History')}
                            </Button>
                        ) : null}
                        <Button
                            className='hidden md:inline-flex'
                            variant='ghost'
                            size='compact'
                            onClick={togglePresentation}
                        >
                            {fullscreen
                                ? t('Switch to dialog')
                                : t('Fullscreen')}
                        </Button>
                        <Button variant='ghost' size='compact' onClick={close}>
                            {t('Close practice')}
                        </Button>
                    </div>
                </header>
                <div className='flex flex-wrap justify-center gap-x-5 gap-y-1 border-b border-border-default bg-background-subtle px-4 py-2 text-xs text-text-secondary'>
                    <span>
                        {c.progress ? (
                            <>
                                {c.progress.usedCount} {t('entries seen')}
                            </>
                        ) : (
                            t(
                                c.progressLoading
                                    ? 'Loading progress…'
                                    : 'Progress unavailable',
                            )
                        )}
                    </span>
                    <span>
                        {c.progress ? (
                            <>
                                {c.progress.remainingCount} {t('not seen yet')}
                            </>
                        ) : null}
                    </span>
                    <span>
                        {c.counts.checked} {t('AI checks')}
                    </span>
                    <span>
                        {c.counts.manuallyReviewed} {t('Manual reviews')}
                    </span>
                </div>
            </div>
            <div className='mx-auto min-h-64 max-w-3xl space-y-5 px-4 py-5 md:py-8'>
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
                        onRetry={c.canRetry ? () => void c.retry() : undefined}
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
                {jobPending ? (
                    <InlineAlert
                        tone='info'
                        title={
                            c.job?.state === 'queued'
                                ? t('AI task queued')
                                : t('AI task running')
                        }
                        actions={
                            <Button
                                variant='secondary'
                                size='compact'
                                onClick={() => void c.cancel()}
                                disabled={!!c.job?.cancellationRequested}
                                loading={!!c.job?.cancellationRequested}
                            >
                                {t(
                                    c.job?.cancellationRequested
                                        ? 'Stopping…'
                                        : 'Cancel task',
                                )}
                            </Button>
                        }
                    >
                        {c.job?.kind === 'sentence-generation'
                            ? t(
                                  'Generating a sentence. Your previous sentences stay saved.',
                              )
                            : t(
                                  'Checking your submitted answer. Your answer is kept.',
                              )}{' '}
                        {t(
                            'Cancellation does not guarantee a refund for work already started.',
                        )}
                    </InlineAlert>
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
                        <h3 className='font-semibold'>
                            {c.emptyReason === 'review-exhausted'
                                ? t('Saved review complete')
                                : t('No eligible sentences')}
                        </h3>
                        <p className='mt-2 text-sm text-text-secondary'>
                            {t(
                                'You have reached the end of this session. Start another session to change your words or sentence mode.',
                            )}
                        </p>
                        <Button
                            className='mt-4'
                            variant='secondary'
                            onClick={() => setSummary(true)}
                        >
                            {t('View summary')}
                        </Button>
                        <div className='mt-3 flex flex-wrap justify-center gap-2'>
                            {c.emptyReason === 'review-exhausted' ? (
                                <Button
                                    variant='secondary'
                                    disabled={c.busy || c.uncertain}
                                    onClick={() => void c.restartReview()}
                                >
                                    {t('Restart saved review')}
                                </Button>
                            ) : null}
                            <Button
                                disabled={c.busy || c.uncertain}
                                onClick={() => void c.changeMode('new-only')}
                            >
                                {t('Generate new sentences')}
                            </Button>
                        </div>
                    </div>
                ) : null}
                {exercise ? (
                    <>
                        <p className='text-xs font-medium uppercase tracking-wide text-text-tertiary'>
                            {languageName(exercise.sourceLanguage)} →{' '}
                            {languageName(exercise.targetLanguage)}
                        </p>
                        <SentenceWithHints
                            exercise={exercise}
                            revealedHintIds={c.revealedHintIds}
                            onReveal={c.toggleHint}
                        />
                        <Textarea
                            ref={draftRef}
                            label={t('Your translation ({language})').replace(
                                '{language}',
                                languageName(exercise.targetLanguage),
                            )}
                            lang={exercise.targetLanguage}
                            dir={languageDirection(exercise.targetLanguage)}
                            value={c.draft}
                            onChange={(event) => c.setDraft(event.target.value)}
                            rows={5}
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
                        Math.floor(SENTENCE_LIMITS.answerCodePoints * 0.85) ? (
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
                        <p className='text-xs text-text-tertiary'>
                            {t(
                                'Generating sentences and checking with AI use credits. Showing the saved reference answer is free.',
                            )}
                        </p>
                        {c.referenceError ? (
                            <SentenceErrorNotice
                                error={c.referenceError}
                                onRetry={() => void c.revealReference()}
                            />
                        ) : null}
                        {c.reference ? (
                            <ReferencePanel
                                key={c.reference.id}
                                review={c.reference}
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
                {exercise ? (
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
                {onOpenPreferences ? (
                    <Button
                        variant='ghost'
                        size='compact'
                        onClick={onOpenPreferences}
                    >
                        {t('AI preferences')}
                    </Button>
                ) : null}
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
                        'Your unsent draft will be discarded. A task already started may continue and its result will be saved to your personal history. Leaving does not cancel the task or guarantee a refund.',
                    )}
                </p>
            </Dialog>
            <Dialog
                open={summary}
                variant={compact ? 'sheet' : 'dialog'}
                className={
                    compact ? '!mb-0 !w-full !max-w-none !rounded-b-none' : ''
                }
                onClose={() => setSummary(false)}
                title={t('Session summary')}
                footer={
                    <div className='flex flex-wrap gap-2'>
                        <Button
                            variant='secondary'
                            onClick={() => setSummary(false)}
                        >
                            {t('Keep practising')}
                        </Button>
                        {onOpenHistory ? (
                            <Button
                                variant='secondary'
                                onClick={() => {
                                    setSummary(false);
                                    onOpenHistory();
                                }}
                            >
                                {t('My practice history')}
                            </Button>
                        ) : null}
                        <Button
                            onClick={() => {
                                setSummary(false);
                                close();
                            }}
                        >
                            {t('Leave practice')}
                        </Button>
                    </div>
                }
            >
                <p className='text-sm text-text-secondary'>
                    {t('This session')}
                </p>
                <div className='mt-3 grid grid-cols-2 gap-4'>
                    <div>
                        <strong className='text-2xl'>
                            {c.counts.presented}
                        </strong>
                        <p className='text-sm text-text-secondary'>
                            {t('Sentences seen')}
                        </p>
                    </div>
                    <div>
                        <strong className='text-2xl'>{c.counts.checked}</strong>
                        <p className='text-sm text-text-secondary'>
                            {t('AI checks')}
                        </p>
                    </div>
                    <div>
                        <strong className='text-2xl'>
                            {c.counts.manuallyReviewed}
                        </strong>
                        <p className='text-sm text-text-secondary'>
                            {t('Manual reviews')}
                        </p>
                    </div>
                </div>
                <p className='mt-4 text-sm'>
                    {c.counts.assisted} {t('Assisted AI checks')}
                </p>
                <h3 className='mt-5 text-sm font-semibold'>
                    {t('AI ratings')}
                </h3>
                <ul className='mt-2 space-y-2 text-sm'>
                    {Object.entries(c.counts.ratings).map(([rating, count]) => (
                        <li key={rating} className='flex justify-between'>
                            <span>
                                {t(
                                    {
                                        perfect: 'Perfect',
                                        good: 'Good',
                                        notBad: 'Not bad',
                                        practiseAgainLater:
                                            'Practise again later',
                                    }[rating as 'perfect'] ?? rating,
                                )}
                            </span>
                            <strong>{count}</strong>
                        </li>
                    ))}
                </ul>
                <p className='mt-4 text-xs text-text-tertiary'>
                    {t(
                        'Manual reviews are separate from AI scores. Seeing an entry in a sentence does not mean it is mastered.',
                    )}
                </p>
            </Dialog>
        </Dialog>
    );
}
