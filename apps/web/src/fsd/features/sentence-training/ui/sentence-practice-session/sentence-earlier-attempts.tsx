import type { SyntheticEvent } from 'react';
import type { SentenceAttempt } from '@languon/contracts';
import type { ApiError } from '../../lib/api-error';
import type { SentenceAudioRenderer } from '../../types';
import { LoadingState } from '@/fsd/shared/ui';
import { AiResultPanel } from '../sentence-content/sentence-content';
import { SentenceErrorNotice } from '../sentence-errors/sentence-errors';
import { useSentenceCopy } from '../sentence-copy';
import styles from './sentence-practice-session.module.css';

export function SentenceEarlierAttempts({
    exerciseId,
    previousAttempts,
    previousAttemptsLoading,
    previousAttemptsError,
    onRetryPreviousAttempts,
    onToggle,
    innerView,
    earlierAttemptsOpen,
    renderAudio,
}: {
    exerciseId: string;
    previousAttempts: SentenceAttempt[];
    previousAttemptsLoading: boolean | undefined;
    previousAttemptsError: ApiError | null | undefined;
    onRetryPreviousAttempts: (() => void) | undefined;
    onToggle(event: SyntheticEvent<HTMLDetailsElement>): void;
    innerView: boolean;
    earlierAttemptsOpen: boolean;
    renderAudio: SentenceAudioRenderer | undefined;
}) {
    const { t } = useSentenceCopy();

    return (
        <>
            <details
                key={exerciseId}
                className={styles.referenceDetails}
                onToggle={onToggle}
            >
                <summary className={styles.referenceAction}>
                    {t('Earlier attempts for this sentence')}
                </summary>
                <div className={styles.referenceContent}>
                    {previousAttemptsLoading ? (
                        <LoadingState>{t('Loading history')}</LoadingState>
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
                        <p className={styles.referenceNote}>
                            {t('No earlier attempts yet.')}
                        </p>
                    ) : null}
                    {previousAttempts.map((attempt) => (
                        <AiResultPanel
                            key={attempt.id}
                            attempt={attempt}
                            audio={
                                innerView || !earlierAttemptsOpen
                                    ? null
                                    : renderAudio?.({
                                          kind: 'checked-answer',
                                          id: attempt.id,
                                      })
                            }
                        />
                    ))}
                </div>
            </details>
        </>
    );
}
