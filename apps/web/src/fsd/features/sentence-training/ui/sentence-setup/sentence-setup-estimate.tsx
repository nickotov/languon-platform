import type { Configuration, SentenceSetupController } from '../../types';
import { useSentenceCopy } from '../sentence-copy';
import styles from './sentence-setup.module.css';

export function SentenceSetupEstimate({
    prepared,
    mode,
}: {
    prepared: NonNullable<SentenceSetupController['prepared']>;
    mode: Configuration['mode'];
}) {
    const { t } = useSentenceCopy();

    return (
        <div className={styles.estimatePanel}>
            <div className={styles.estimateMetrics}>
                <p>
                    <strong>{prepared.eligibleCount}</strong>{' '}
                    {t('eligible entries')}
                </p>
                <p>
                    <strong>{prepared.skippedCount}</strong> {t('skipped')}
                </p>
                <p>
                    <strong>{prepared.usedCount}</strong>{' '}
                    {t('seen in sentences')}
                </p>
                <p>
                    <strong>{prepared.remainingCount}</strong>{' '}
                    {t('not seen yet')}
                </p>
                <p>
                    <strong>{prepared.savedReviewCount}</strong>{' '}
                    {t('saved sentences')}
                </p>
            </div>
            {prepared.skippedCount ? (
                <details className={styles.costDetails}>
                    <summary className={styles.costAction}>
                        {t('Why entries are skipped')}
                    </summary>
                    <p className={styles.costDescription}>
                        {t(
                            'Entries without a complete source and translation are skipped.',
                        )}
                    </p>
                </details>
            ) : null}
            <p className={styles.costNote}>
                {t(
                    'Exposure counts are not mastery scores. Generating sentences and checking with AI use credits. Showing a saved reference answer is free.',
                )}
            </p>
            {prepared.eligibleCount === 0 ? (
                <p className={styles.estimateNote}>
                    {t(
                        'No eligible entries. Add complete translations to your dictionary first.',
                    )}
                </p>
            ) : null}
            {mode === 'review-only' && prepared.savedReviewCount === 0 ? (
                <p className={styles.estimateNote}>
                    {t(
                        'No saved sentences yet. Choose Saved first or Generate new sentences to create them.',
                    )}
                </p>
            ) : null}
        </div>
    );
}
