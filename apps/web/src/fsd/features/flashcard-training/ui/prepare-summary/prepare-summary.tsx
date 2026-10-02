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
    if (blocked)
        return <p className='text-sm text-text-secondary'>{blocked}</p>;
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
                className='grid grid-cols-3 gap-3'
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
        <div className='flex flex-col gap-3'>
            <dl aria-live='polite' className='grid grid-cols-3 gap-2 sm:gap-3'>
                {stats.map(({ label, value, icon: Icon, note }) => (
                    <div
                        key={label}
                        className='min-w-0 rounded-xl border border-border-default bg-background-subtle px-3 py-3'
                    >
                        <dt className='flex items-center gap-1 text-xs font-medium text-text-secondary'>
                            <Icon className='h-4 w-4 shrink-0' aria-hidden />
                            <span>{label}</span>
                        </dt>
                        <dd className='mt-1 text-2xl font-semibold tabular-nums text-text-primary'>
                            {value}
                        </dd>
                        <dd className='text-xs text-text-tertiary'>{note}</dd>
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
