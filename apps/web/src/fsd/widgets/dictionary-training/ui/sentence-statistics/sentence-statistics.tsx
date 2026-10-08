'use client';

import { useCallback } from 'react';
import type { SentenceDirection } from '@languon/contracts';
import type { SentenceApi } from '@/fsd/features/sentence-training';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, InlineAlert, LoadingState } from '@/fsd/shared/ui';
import { useSavedStatistics } from '../../hooks/use-saved-statistics';
import { historyCopy } from '../practice-history/copy';

export function SentenceStatistics({
    api,
    sourceLanguage,
    targetLanguage,
}: {
    api: SentenceApi;
    sourceLanguage: string;
    targetLanguage: string;
}) {
    const { locale } = useI18n();
    const copy = historyCopy[locale];
    return (
        <section className='space-y-4' aria-label={copy.statistics}>
            <div>
                <h3 className='font-semibold'>{copy.statistics}</h3>
                <p className='mt-1 text-sm text-text-secondary'>{copy.help}</p>
            </div>
            <div className='grid gap-4'>
                <DirectionStatistics
                    api={api}
                    direction='source-to-target'
                    label={`${sourceLanguage} → ${targetLanguage}`}
                />
                <DirectionStatistics
                    api={api}
                    direction='target-to-source'
                    label={`${targetLanguage} → ${sourceLanguage}`}
                />
            </div>
        </section>
    );
}

function DirectionStatistics({
    api,
    direction,
    label,
}: {
    api: SentenceApi;
    direction: SentenceDirection;
    label: string;
}) {
    const { locale } = useI18n();
    const copy = historyCopy[locale];
    // Stable reader prevents refetching on unrelated history renders.
    const read = useCallback(() => api.progress(direction), [api, direction]);
    const progress = useSavedStatistics(read);
    const value = progress.result;
    const metrics = value
        ? [
              [copy.eligible, value.eligibleCount],
              [copy.used, value.usedCount],
              [copy.remaining, value.remainingCount],
              [copy.checks, value.completedCheckCount],
              [copy.manual, value.manualReviewCount],
              [copy.assisted, value.assistedCheckCount],
          ]
        : [];
    const ratings = value
        ? [
              [copy.perfect, value.ratings.perfect],
              [copy.good, value.ratings.good],
              [copy.notBad, value.ratings.notBad],
              [copy.again, value.ratings.practiseAgainLater],
          ]
        : [];

    return (
        <section
            className='rounded-xl border border-border-default bg-background-surface p-4'
            aria-label={label}
        >
            <h4 className='mb-3 text-sm font-semibold'>{label}</h4>
            {progress.status === 'loading' ? (
                <LoadingState>{copy.loading}</LoadingState>
            ) : null}
            {progress.status === 'error' ? (
                <InlineAlert
                    tone='error'
                    title={copy.error}
                    actions={
                        <Button
                            size='compact'
                            variant='secondary'
                            onClick={progress.retry}
                        >
                            {copy.retry}
                        </Button>
                    }
                />
            ) : null}
            {value ? (
                <>
                    <dl className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
                        {metrics.map(([name, count]) => (
                            <div key={name}>
                                <dt className='text-xs text-text-secondary'>
                                    {name}
                                </dt>
                                <dd className='mt-1 text-lg font-semibold tabular-nums'>
                                    {count}
                                </dd>
                            </div>
                        ))}
                    </dl>
                    <dl className='mt-4 grid grid-cols-2 gap-3 border-t border-border-default pt-3 sm:grid-cols-4'>
                        {ratings.map(([name, count]) => (
                            <div key={name}>
                                <dt className='text-xs text-text-secondary'>
                                    {name}
                                </dt>
                                <dd className='mt-1 font-semibold tabular-nums'>
                                    {count}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </>
            ) : null}
        </section>
    );
}
