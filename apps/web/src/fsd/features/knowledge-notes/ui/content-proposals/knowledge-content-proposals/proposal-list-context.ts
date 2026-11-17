'use client';
import { createContext } from 'react';
import type { KnowledgeContentProposal } from '@languon/contracts';
import type { KnowledgeContentProposalContext } from './types';
export type ProposalListContext = {
    proposals: KnowledgeContentProposal[];
    context: KnowledgeContentProposalContext;
    applying: boolean;
    refresh(): void;
};
export const ProposalList = createContext<ProposalListContext | null>(null);
