'use client';
import { useContext } from 'react';
import { ProposalList } from '../../proposal-list-context';
import { ProposalCards } from '../proposal-cards/proposal-cards';
export function KnowledgeBlockProposalsForTurn({
    turnId,
}: {
    turnId: string | null | undefined;
}) {
    const value = useContext(ProposalList);
    if (!value || !turnId) {
        return null;
    }

    return (
        <ProposalCards
            value={value}
            proposals={value.proposals.filter((item) => item.turnId === turnId)}
        />
    );
}
