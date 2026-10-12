import styles from './results-panel.module.css';
import { Check, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import type { SessionState } from '../../hooks/use-practice-session';
import { SavedProgress } from '../saved-progress/saved-progress';

export function ResultsPanel({
    state,
    signedIn,
    dictionaryTitle,
    onRetryProgress,
    onPractiseAgain,
    onStartOver,
    onFinish,
    undo,
}: {
    state: SessionState;
    signedIn: boolean;
    dictionaryTitle: string;
    onRetryProgress(): void;
    onPractiseAgain(): void;
    onStartOver(): void;
    onFinish(): void;
    undo: ReactNode;
}) {
    const { t } = useI18n();

    const { roundStats } = state;

    const percentage = roundStats.reviewed
        ? Math.round((roundStats.known / roundStats.reviewed) * 100)
        : 0;

    const values = Object.values(state.outcomes);

    const known = values.filter((rating) => rating === 'known').length;

    const again = values.filter((rating) => rating === 'again').length;

    const title = t('training.roundComplete', { round: state.round });

    const stats = t('training.sessionStats', {
        entries: values.length,
        known,
        again,
        reviews: state.reviewEvents,
        rounds: state.roundsCompleted,
    });

    const againLabel = t('training.againCount', { count: again });

    const disabled = Boolean(state.pending || state.conflict);

    const againDisabled = disabled || again === 0;

    return (
        <div className={styles.results}>
            <header>
                <h3 className={styles.title}>{title}</h3>
                <p className={styles.summary}>
                    {t('training.roundCompleteHelp')}
                </p>
            </header>
            <section aria-label={t('training.thisRound')}>
                <h4 className={styles.sectionLabel}>
                    {t('training.thisRound')}
                </h4>
                <dl className={styles.metrics}>
                    <Stat
                        label={t('training.reviewed')}
                        value={roundStats.reviewed}
                    />
                    <Stat
                        label={t('training.known')}
                        value={roundStats.known}
                        icon={<Check aria-hidden className={styles.icon} />}
                    />
                    <Stat
                        label={t('training.again')}
                        value={roundStats.again}
                        icon={<RotateCcw aria-hidden className={styles.icon} />}
                    />
                    <Stat
                        label={t('training.markedKnown')}
                        value={`${percentage}%`}
                        note={t('training.selfAssessment')}
                    />
                </dl>
            </section>
            <section className={styles.progress}>
                <h4 className={styles.progressTitle}>
                    {t('training.thisSession')}
                </h4>
                <p className={styles.progressSummary}>{stats}</p>
            </section>
            {signedIn ? (
                <SavedProgress
                    progress={state.progress}
                    status={state.progressStatus}
                    dictionaryTitle={dictionaryTitle}
                    onRetry={onRetryProgress}
                />
            ) : (
                <InlineAlert title={t('training.sessionOnly')}>
                    {t('training.sessionOnlyHelp')}
                </InlineAlert>
            )}
            {undo}
            <div className={styles.actions}>
                <Button
                    size='large'
                    leadingIcon={<RotateCcw className={styles.icon} />}
                    onClick={onPractiseAgain}
                    disabled={againDisabled}
                >
                    {againLabel}
                </Button>
                <Button
                    size='large'
                    variant='secondary'
                    onClick={onStartOver}
                    disabled={disabled}
                >
                    {t('training.startOver')}
                </Button>
                <Button
                    size='large'
                    variant='secondary'
                    onClick={onFinish}
                    disabled={disabled}
                >
                    {t('training.finish')}
                </Button>
            </div>
            {again === 0 && (
                <p className={styles.note}>{t('training.noAgain')}</p>
            )}
        </div>
    );
}

function Stat({
    label,
    value,
    icon,
    note,
}: {
    label: string;
    value: ReactNode;
    icon?: ReactNode;
    note?: string;
}) {
    return (
        <div className={styles.metric}>
            <dt className={styles.metricLabel}>
                {icon}
                {label}
            </dt>
            <dd className={styles.metricValue}>{value}</dd>
            {note && <dd className={styles.metricNote}>{note}</dd>}
        </div>
    );
}
