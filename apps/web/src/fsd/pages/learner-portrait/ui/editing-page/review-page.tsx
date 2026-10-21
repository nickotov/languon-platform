'use client';
import { useQuery } from '@tanstack/react-query';
import { portraitApi } from '@/fsd/entities/learner-portrait';
import { useI18n } from '@/fsd/shared/i18n';
import { ButtonLink, LoadingState } from '@/fsd/shared/ui';
import {
    usePortraitManagement,
    type PortraitManagement,
} from '../../hooks/use-portrait-management';
import { portraitCopy } from '../../lib/copy';
import { PortraitPageState } from '../page-state/page-state';
import { ReviewEditor } from './review-editor';
import styles from '../common.module.css';

export function PortraitReviewPage() {
    const management = usePortraitManagement();
    return (
        <PortraitPageState management={management}>
            <PortraitReview key={management.ownerId} management={management} />
        </PortraitPageState>
    );
}

function PortraitReview({ management }: { management: PortraitManagement }) {
    const { locale } = useI18n();
    const state = management.query.data!;
    const interview = management.status.data?.interview;
    const session = useQuery({
        queryKey: [
            'portrait-review-interview',
            management.ownerId,
            interview?.id,
        ],
        queryFn: () =>
            management.requestWithSession((token) =>
                portraitApi.startInterview(token, {
                    expectedVersion: state.version,
                    locale: interview?.locale ?? locale,
                }),
            ),
        enabled: Boolean(interview),
        retry: false,
        gcTime: 0,
        staleTime: Infinity,
    });
    if (!state.draft && !interview)
        return (
            <main className={`${styles.page} ${styles.center}`}>
                <h1 className={styles.title}>
                    {portraitCopy(locale, 'noDraft')}
                </h1>
                <p className={styles.small}>
                    {portraitCopy(locale, 'noDraftBody')}
                </p>
                <div className={styles.actions}>
                    <ButtonLink href='/portrait'>
                        {portraitCopy(locale, 'goPortrait')}
                    </ButtonLink>
                    <ButtonLink href='/portrait/intro' variant='secondary'>
                        {portraitCopy(locale, 'start')}
                    </ButtonLink>
                </div>
            </main>
        );
    if (interview && session.isPending)
        return (
            <main className={styles.page}>
                <LoadingState>{portraitCopy(locale, 'loading')}</LoadingState>
            </main>
        );
    return (
        <ReviewEditor
            management={management}
            proposal={
                session.data?.latestCompletedOperation?.result.proposedItems
            }
            proposalStale={
                session.data?.latestCompletedOperation?.stale ?? false
            }
            sessionError={session.isError}
        />
    );
}
