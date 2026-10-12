import styles from './prepare-summary.module.css';
import { CheckCircle2, CornerDownRight, MinusCircle } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { InlineAlert, Skeleton } from '@/fsd/shared/ui';
import type { useFlashcardSetup } from '../../hooks/use-flashcard-setup';
import { RetryButton } from '../retry-button/retry-button';

type Prepare = ReturnType<typeof useFlashcardSetup>['prepare'];

export function PrepareSummary({
    prepare,
    onRetry,
    blocked,
}: {
    prepare: Prepare;
    onRetry(): void;
    blocked?: string | undefined;
}) {
    const { t } = useI18n();

    if (blocked) return <p className={styles.blocked}>{blocked}</p>;

    if (prepare.status === 'error')
        return (
            <InlineAlert
                tone='error'
                title={t('training.error')}
                actions={
                    <RetryButton onRetry={onRetry} error={prepare.error} />
                }
            >
                {t('training.errorHelp')}
            </InlineAlert>
        );

    if (prepare.status !== 'ready' || !prepare.result)
        return (
            <div
                aria-label={t('training.checkEligible')}
                className={styles.skeletons}
            >
                <Skeleton height={72} variant='rect' />
                <Skeleton height={72} variant='rect' />
                <Skeleton height={72} variant='rect' />
            </div>
        );

    const result = prepare.result;

    const stats = [
        {
            label: t('training.eligible'),
            value: result.eligibleCount,
            icon: CheckCircle2,
            note: t('training.cardsReady'),
        },
        {
            label: t('training.skipped'),
            value: result.skippedCount,
            icon: MinusCircle,
            note: t('training.emptySide'),
        },
        {
            label: t('training.withFallback'),
            value: result.fallbackCount,
            icon: CornerDownRight,
            note: t('training.entryCount'),
        },
    ];

    return (
        <div className={styles.summary}>
            <dl aria-live='polite' className={styles.metrics}>
                {stats.map(({ label, value, icon: Icon, note }) => (
                    <div key={label} className={styles.metric}>
                        <dt className={styles.metricLabel}>
                            <Icon className={styles.icon} aria-hidden />
                            <span>{label}</span>
                        </dt>
                        <dd className={styles.metricValue}>{value}</dd>
                        <dd className={styles.metricNote}>{note}</dd>
                    </div>
                ))}
            </dl>
            {result.eligibleCount === 0 && (
                <InlineAlert tone='warning' title={t('training.noEligible')}>
                    {t('training.noEligibleHelp')}
                </InlineAlert>
            )}
        </div>
    );
}
