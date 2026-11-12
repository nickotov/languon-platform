'use client';
import type { KnowledgeBlockProposal } from '@languon/contracts';
import { BlockProposalCard } from '../../../block-proposal-card';
import type { ProposalListContext } from '../../proposal-list-context';
export function ProposalCards({
    value,
    proposals,
}: {
    value: ProposalListContext;
    proposals: KnowledgeBlockProposal[];
}) {
    return (
        <>
            {proposals.map((proposal) => (
                <BlockProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    context={value.context}
                    disabled={value.applying || Boolean(value.context.disabled)}
                    onApplied={value.refresh}
                />
            ))}
        </>
    );
}
