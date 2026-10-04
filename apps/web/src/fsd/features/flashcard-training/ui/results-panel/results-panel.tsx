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
        <div className='mx-auto flex w-full max-w-2xl flex-col gap-8'>
            <header>
                <h3 className='text-2xl font-semibold text-text-primary'>
                    {title}
                </h3>
                <p className='mt-1 text-text-secondary'>
                    {t('training.roundCompleteHelp')}
                </p>
            </header>
            <section aria-label={t('training.thisRound')}>
                <h4 className='text-sm font-semibold uppercase tracking-wide text-text-tertiary'>
                    {t('training.thisRound')}
                </h4>
                <dl className='mt-3 grid grid-cols-2 gap-3 md:grid-cols-4'>
                    <Stat
                        label={t('training.reviewed')}
                        value={roundStats.reviewed}
                    />
                    <Stat
                        label={t('training.known')}
                        value={roundStats.known}
                        icon={<Check aria-hidden className='h-4 w-4' />}
                    />
                    <Stat
                        label={t('training.again')}
                        value={roundStats.again}
                        icon={<RotateCcw aria-hidden className='h-4 w-4' />}
                    />
                    <Stat
                        label={t('training.markedKnown')}
                        value={`${percentage}%`}
                        note={t('training.selfAssessment')}
                    />
                </dl>
            </section>
            <section className='rounded-2xl border border-border-default bg-background-surface p-4'>
                <h4 className='text-base font-semibold text-text-primary'>
                    {t('training.thisSession')}
                </h4>
                <p className='mt-1 text-sm text-text-secondary'>{stats}</p>
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
            <div className='flex flex-col gap-3 sm:flex-row sm:flex-wrap'>
                <Button
                    size='large'
                    leadingIcon={<RotateCcw className='h-4 w-4' />}
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
                <p className='-mt-5 text-sm text-text-tertiary'>
                    {t('training.noAgain')}
                </p>
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
        <div className='rounded-xl border border-border-default bg-background-surface px-4 py-3'>
            <dt className='flex items-center gap-1 text-sm text-text-secondary'>
                {icon}
                {label}
            </dt>
            <dd className='mt-1 text-2xl font-semibold tabular-nums text-text-primary'>
                {value}
            </dd>
            {note && <dd className='text-xs text-text-tertiary'>{note}</dd>}
        </div>
    );
}
