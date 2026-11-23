'use client';
import { createContext, useContext } from 'react';
import type { KnowledgeContentProposal } from '@languon/contracts';
import type { KnowledgeContentProposalContext } from './types';
export type ProposalListContext = {
    proposals: KnowledgeContentProposal[];
    actorId: string;
    accessDenied: boolean;
    loading?: boolean;
    context: KnowledgeContentProposalContext;
    applying: boolean;
    refresh(): void;
};
export const ProposalList = createContext<ProposalListContext | null>(null);

export function useListedContentProposals() {
    return useContext(ProposalList)?.proposals ?? [];
}
