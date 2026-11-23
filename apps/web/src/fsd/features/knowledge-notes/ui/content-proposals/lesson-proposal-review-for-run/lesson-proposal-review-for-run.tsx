'use client';

import { useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, PanelPage, InlineAlert, LoadingState } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { contentProposalsApi } from '../../../api/content-proposals-api';
import { contentProposalLabels } from '../../../lib/content-proposal-labels';
import { ProposalList } from '../knowledge-content-proposals/proposal-list-context';
import { LessonProposalEntry } from '../lesson-proposal-entry/lesson-proposal-entry';

export function LessonProposalReviewForRun({
    proposalId,
    onClose,
}: {
    proposalId: string;
    onClose(): void;
}) {
    const value = useContext(ProposalList);
    const context = value?.context;
    const { locale } = useI18n();
    const labels = contentProposalLabels(locale);
    const listed = value?.proposals.find(
        (item) => item.id === proposalId && item.isCompletedLesson,
    );
    // A completed run can outlive the most recent page of proposal history.
    const lookup = useQuery({
        queryKey: [
            'lesson-proposal',
            value?.actorId,
            context?.conversationId,
            proposalId,
        ],
        queryFn: ({ signal }) =>
            contentProposalsApi.list(
                context!.requestWithSession,
                context!.conversationId,
                signal,
                proposalId,
            ),
        enabled: Boolean(
            context && !value?.loading && !value?.accessDenied && !listed,
        ),
        retry: false,
        gcTime: 0,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
    const exact =
        !lookup.isError &&
        lookup.data?.proposals.find(
            (item) => item.id === proposalId && item.isCompletedLesson,
        );
    const proposal = !value?.accessDenied && (listed || exact);
    const loading = Boolean(
        value && !value.accessDenied && (value.loading || lookup.isPending),
    );

    function retry() {
        if (value?.accessDenied) {
            value.refresh();

            return;
        }

        void lookup.refetch();
    }

    if (proposal && value) {
        return (
            <LessonProposalEntry
                proposal={proposal}
                value={value}
                onClose={onClose}
            />
        );
    }

    return (
        <PanelPage
            title={labels.reviewTitle}
            backLabel={labels.backToChat}
            onBack={onClose}
        >
            {loading ? (
                <LoadingState>{labels.loading}</LoadingState>
            ) : (
                <InlineAlert tone='error'>
                    {labels.error}
                    {value && (
                        <Button variant='ghost' size='compact' onClick={retry}>
                            {labels.refresh}
                        </Button>
                    )}
                </InlineAlert>
            )}
        </PanelPage>
    );
}
