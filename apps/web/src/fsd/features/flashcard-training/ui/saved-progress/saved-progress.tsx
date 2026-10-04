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
                <div
                    role='img'
                    aria-label={summary}
                    className='flex h-3 w-full overflow-hidden rounded-full bg-background-subtle'
                >
                    <div className='bg-success-default' style={knownStyle} />
                    <div className='bg-warning-default' style={againStyle} />
                </div>
                <ul className='grid grid-cols-1 gap-2 text-sm sm:grid-cols-3'>
                    <Legend
                        icon={
                            <Check className='h-4 w-4 text-success-default' />
                        }
                        label={t('training.known')}
                        value={progress.known}
                    />
                    <Legend
                        icon={
                            <RotateCcw className='h-4 w-4 text-warning-default' />
                        }
                        label={t('training.again')}
                        value={progress.again}
                    />
                    <Legend
                        icon={<Circle className='h-4 w-4 text-text-tertiary' />}
                        label={t('training.unstudied')}
                        value={progress.unstudied}
                    />
                </ul>
                <p className='text-xs text-text-tertiary'>
                    {count}
                    {status === 'loading' && ` · ${t('training.refreshing')}`}
                </p>
            </>
        );
    }

    const resolvedSavedProgressContent = resolveSavedProgressContent();

    return (
        <section aria-label={title} className='flex flex-col gap-3'>
            <div>
                <h4 className='text-base font-semibold text-text-primary'>
                    {title}
                </h4>
                <p className='text-sm text-text-secondary'>
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
        <li className='flex items-center gap-2 rounded-lg border border-border-default px-3 py-2'>
            <span aria-hidden>{icon}</span>
            <span className='text-text-secondary'>{label}</span>
            <span className='ml-auto font-semibold tabular-nums text-text-primary'>
                {value}
            </span>
        </li>
    );
}
