import styles from './saved-progress.module.css';
import { Check, Circle, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, InlineAlert, Skeleton } from '@/fsd/shared/ui';
import type { Progress } from '../../types';

export function SavedProgress({
    progress,
    status,
    dictionaryTitle,
    onRetry,
}: {
    progress: Progress | null;
    status: 'idle' | 'loading' | 'error';
    dictionaryTitle: string;
    onRetry(): void;
}) {
    const { t } = useI18n();

    const title = t('training.savedProgress', { name: dictionaryTitle });

    const summary = progress ? t('training.progressLabel', progress) : '';

    const knownStyle = {
        width: `${((progress?.known ?? 0) / Math.max(1, progress?.total ?? 0)) * 100}%`,
    };

    const againStyle = {
        width: `${((progress?.again ?? 0) / Math.max(1, progress?.total ?? 0)) * 100}%`,
    };

    const count = t('training.activeEntries', { count: progress?.total ?? 0 });

    function resolveSavedProgressContent() {
        if (status === 'error') {
            return (
                <InlineAlert
                    tone='error'
                    title={t('training.progressFailed')}
                    actions={
                        <Button
                            variant='secondary'
                            size='compact'
                            onClick={onRetry}
                        >
                            {t('training.retry')}
                        </Button>
                    }
                >
                    {t('training.progressFailedHelp')}
                </InlineAlert>
            );
        }

        if (!progress) {
            return <Skeleton variant='rect' height={64} />;
        }

        return (
            <>
                <div role='img' aria-label={summary} className={styles.track}>
                    <div className={styles.known} style={knownStyle} />
                    <div className={styles.again} style={againStyle} />
                </div>
                <ul className={styles.legend}>
                    <Legend
                        icon={<Check className={styles.knownIcon} />}
                        label={t('training.known')}
                        value={progress.known}
                    />
                    <Legend
                        icon={<RotateCcw className={styles.againIcon} />}
                        label={t('training.again')}
                        value={progress.again}
                    />
                    <Legend
                        icon={<Circle className={styles.unstudiedIcon} />}
                        label={t('training.unstudied')}
                        value={progress.unstudied}
                    />
                </ul>
                <p className={styles.count}>
                    {count}
                    {status === 'loading' && ` · ${t('training.refreshing')}`}
                </p>
            </>
        );
    }

    const resolvedSavedProgressContent = resolveSavedProgressContent();

    return (
        <section aria-label={title} className={styles.progress}>
            <div>
                <h4 className={styles.title}>{title}</h4>
                <p className={styles.description}>
                    {t('training.savedProgressHelp')}
                </p>
            </div>
            {resolvedSavedProgressContent}
        </section>
    );
}

function Legend({
    icon,
    label,
    value,
}: {
    icon: ReactNode;
    label: string;
    value: number;
}) {
    return (
        <li className={styles.legendItem}>
            <span aria-hidden>{icon}</span>
            <span className={styles.legendLabel}>{label}</span>
            <span className={styles.legendValue}>{value}</span>
        </li>
    );
}
