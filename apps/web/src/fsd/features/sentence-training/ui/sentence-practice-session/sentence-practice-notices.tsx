import { Button, InlineAlert, LoadingState } from '@/fsd/shared/ui';
import type { SentenceSessionController } from '../../types';
import { SentenceErrorNotice } from '../sentence-errors/sentence-errors';
import { SentenceJobStatus } from '../sentence-job-status/sentence-job-status';
import { useSentenceCopy } from '../sentence-copy';
import styles from './sentence-practice-session.module.css';

export function SentencePracticeNotices({
    c,
    fallback,
    jobPending,
    emptyTitle,
    onCancel,
    onOpenPreferences,
}: {
    c: Pick<
        SentenceSessionController,
        | 'progressError'
        | 'progress'
        | 'error'
        | 'canRetry'
        | 'uncertain'
        | 'phase'
        | 'job'
        | 'busy'
        | 'emptyReason'
        | 'retryProgress'
        | 'retry'
        | 'restartReview'
        | 'changeMode'
    >;
    fallback: boolean;
    jobPending: boolean | null | undefined;
    emptyTitle: string;
    onCancel(): void;
    onOpenPreferences: (() => void) | undefined;
}) {
    const { t } = useSentenceCopy();

    function retryProgress() {
        void c.retryProgress();
    }

    function retryRequest() {
        void c.retry();
    }

    function restartReview() {
        void c.restartReview();
    }

    function generateNew() {
        void c.changeMode('new-only');
    }

    return (
        <>
            {c.progressError ? (
                <InlineAlert
                    tone='warning'
                    title={t('Progress unavailable')}
                    actions={
                        <Button
                            variant='secondary'
                            size='compact'
                            onClick={retryProgress}
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
                    onRetry={c.canRetry ? retryRequest : undefined}
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
                <div className={styles.emptyState}>
                    <h3 className={styles.emptyTitle}>{emptyTitle}</h3>
                    <p className={styles.emptyDescription}>
                        {t(
                            'You have reached the end of this session. Start another session to change your words or sentence mode.',
                        )}
                    </p>
                    <div className={styles.emptyActions}>
                        {c.emptyReason === 'review-exhausted' ? (
                            <Button
                                variant='secondary'
                                disabled={c.busy || c.uncertain}
                                onClick={restartReview}
                            >
                                {t('Restart saved review')}
                            </Button>
                        ) : null}
                        <Button
                            disabled={c.busy || c.uncertain}
                            onClick={generateNew}
                        >
                            {t('Generate new sentences')}
                        </Button>
                    </div>
                </div>
            ) : null}
            {jobPending && c.job?.kind === 'sentence-generation' ? (
                <>
                    <div aria-hidden className={styles.loadingPanel}>
                        <div className={styles.skeletonLine} />
                        <div className={styles.skeletonShortLine} />
                    </div>
                    <SentenceJobStatus job={c.job} onCancel={onCancel} />
                </>
            ) : null}
        </>
    );
}
