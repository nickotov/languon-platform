'use client';
import { createContext } from 'react';
import type { KnowledgeBlockProposal } from '@languon/contracts';
import type { KnowledgeBlockProposalContext } from './types';
export type ProposalListContext = {
    proposals: KnowledgeBlockProposal[];
    context: KnowledgeBlockProposalContext;
    applying: boolean;
    refresh(): void;
};
export const ProposalList = createContext<ProposalListContext | null>(null);
