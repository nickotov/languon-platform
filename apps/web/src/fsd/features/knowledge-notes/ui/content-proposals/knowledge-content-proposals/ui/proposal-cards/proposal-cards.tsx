'use client';
import type { KnowledgeContentProposal } from '@languon/contracts';
import { LessonProposalEntry } from '../../../lesson-proposal-entry/lesson-proposal-entry';
import { ContentProposalCard } from '../../../content-proposal-card/content-proposal-card';
import type { ProposalListContext } from '../../proposal-list-context';
export function ProposalCards({
    value,
    proposals,
}: {
    value: ProposalListContext;
    proposals: KnowledgeContentProposal[];
}) {
    return (
        <>
            {proposals.map((proposal) =>
                proposal.isCompletedLesson ? (
                    <LessonProposalEntry
                        key={proposal.id}
                        proposal={proposal}
                        value={value}
                    />
                ) : (
                    <ContentProposalCard
                        key={proposal.id}
                        proposal={proposal}
                        context={value.context}
                        disabled={
                            value.applying || Boolean(value.context.disabled)
                        }
                        onApplied={value.refresh}
                    />
                ),
            )}
        </>
    );
}
