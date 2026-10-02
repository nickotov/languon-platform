import { Undo2 } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, InlineAlert, Skeleton } from '@/fsd/shared/ui';
import type { usePracticeSession } from '../../hooks/use-practice-session';
import type { useTrainingDisplay } from '../../hooks/use-training-display';
import { ConflictNotice } from '../conflict-notice/conflict-notice';
import { Flashcard } from '../flashcard/flashcard';
import { RatingButton } from '../rating-button/rating-button';
import { ResultsPanel } from '../results-panel/results-panel';
import { RetryButton } from '../retry-button/retry-button';
import { SessionStatus } from '../session-status/session-status';

export function PracticeContent({
    session,
    display,
    signedIn,
    dictionaryTitle,
    onClose,
    contentClassName,
}: {
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
    const classes = `mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 pt-6 md:px-6 md:pt-8 ${contentClassName} ${cardPhase ? 'h-full' : 'min-h-full'}`;
    const blocked = Boolean(
        state.pending || state.conflict || !session.currentItem,
    );
    const saving =
        state.pending?.kind === 'rate' && state.pending.status === 'saving'
            ? state.pending.rating
            : undefined;
    const position = `${state.index + 1} / ${state.queue.length}`;
    const undo =
        state.lastAck && !state.pending ? (
            <Button
                variant='ghost'
                leadingIcon={<Undo2 className='h-4 w-4' />}
                onClick={session.undo}
            >
                {t('training.undo')}
            </Button>
        ) : state.pending?.kind === 'undo' ? (
            <Button variant='ghost' loading disabled>
                {t('training.undoing')}
            </Button>
        ) : null;
    const flipDisabled = Boolean(state.pending);

    return (
        <div className='min-h-0 flex-1 overflow-y-auto overflow-x-hidden'>
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
                    <p
                        role='status'
                        className='text-center text-sm text-text-secondary'
                    >
                        {t('training.saving')}
                    </p>
                )}
                {state.phase === 'loading' && <CardSkeleton />}
                {cardPhase && (
                    <>
                        <div
                            dir='ltr'
                            className='flex min-h-0 flex-1 items-center gap-2 lg:gap-4'
                        >
                            <RatingButton
                                rating='again'
                                onRate={session.rate}
                                disabled={blocked}
                                loading={saving === 'again'}
                            />
                            <div className='mx-auto flex h-full min-h-0 w-full min-w-0 max-w-2xl flex-1 items-center'>
                                {session.currentItem ? (
                                    <Flashcard
                                        item={session.currentItem}
                                        face={state.face}
                                        position={position}
                                        onFlip={session.flip}
                                        onRate={session.rate}
                                        ratingDisabled={blocked}
                                        flipDisabled={flipDisabled}
                                    />
                                ) : (
                                    <div className='w-full'>
                                        <CardSkeleton />
                                    </div>
                                )}
                            </div>
                            <RatingButton
                                rating='known'
                                onRate={session.rate}
                                disabled={blocked}
                                loading={saving === 'known'}
                            />
                        </div>
                        <div
                            dir='ltr'
                            className='flex shrink-0 gap-3 md:hidden'
                        >
                            <RatingButton
                                mobile
                                rating='again'
                                onRate={session.rate}
                                disabled={blocked}
                                loading={saving === 'again'}
                            />
                            <RatingButton
                                mobile
                                rating='known'
                                onRate={session.rate}
                                disabled={blocked}
                                loading={saving === 'known'}
                            />
                        </div>
                        <div className='flex min-h-11 shrink-0 items-center justify-center'>
                            {undo}
                        </div>
                    </>
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

function CardSkeleton() {
    const { t } = useI18n();
    return (
        <div className='flex flex-col gap-3'>
            <div className='rounded-3xl border border-border-default bg-background-surface p-6 shadow-elevation-sm'>
                <Skeleton width='30%' />
                <div className='mt-8'>
                    <Skeleton lines={3} />
                </div>
            </div>
            <p className='text-center text-sm text-text-secondary'>
                {t('training.preparing')}
            </p>
        </div>
    );
}
