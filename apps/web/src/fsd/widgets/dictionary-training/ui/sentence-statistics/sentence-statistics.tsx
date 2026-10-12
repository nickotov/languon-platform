'use client';

import { useCallback } from 'react';
import componentStyles from './sentence-statistics.module.css';
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
        <section className={componentStyles.root} aria-label={copy.statistics}>
            <div>
                <h3 className={componentStyles.heading}>{copy.statistics}</h3>
                <p className={componentStyles.help}>{copy.help}</p>
            </div>
            <div className={componentStyles.cards}>
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
        <section className={componentStyles.card} aria-label={label}>
            <h4 className={componentStyles.cardHeading}>{label}</h4>
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
                    <dl className={componentStyles.metrics}>
                        {metrics.map(([name, count]) => (
                            <div key={name}>
                                <dt className={componentStyles.metricLabel}>
                                    {name}
                                </dt>
                                <dd className={componentStyles.metricValue}>
                                    {count}
                                </dd>
                            </div>
                        ))}
                    </dl>
                    <dl className={componentStyles.ratings}>
                        {ratings.map(([name, count]) => (
                            <div key={name}>
                                <dt className={componentStyles.metricLabel}>
                                    {name}
                                </dt>
                                <dd className={componentStyles.ratingValue}>
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
