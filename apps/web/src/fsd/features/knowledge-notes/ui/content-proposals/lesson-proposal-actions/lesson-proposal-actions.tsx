'use client';
import { useContext } from 'react';
import type { KnowledgeContentProposal } from '@languon/contracts';
import { ProposalList } from '../knowledge-content-proposals/proposal-list-context';
import { LessonProposalEntry } from '../lesson-proposal-entry/lesson-proposal-entry';

export function LessonProposalActions({
    proposal,
}: {
    proposal: KnowledgeContentProposal;
}) {
    const value = useContext(ProposalList);

    return (
        value && (
            <LessonProposalEntry grouped proposal={proposal} value={value} />
        )
    );
}
