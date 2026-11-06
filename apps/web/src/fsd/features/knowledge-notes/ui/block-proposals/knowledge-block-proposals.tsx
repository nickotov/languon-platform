'use client';
import type { BlockInsertionBookmark } from '../../lib/block-insertion-bookmark';
import { createContext, useContext, useState, type ReactNode } from 'react';
import type {
    KnowledgeBlockProposal,
    KnowledgeWorkingBranch,
} from '@languon/contracts';
import type { LearningBlockPlayback } from '@/fsd/entities/learning-blocks';
import type { ConversationSessionRequest } from '@/fsd/entities/conversation';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { useBlockProposals } from '../../hooks/use-block-proposals';
import { BlockProposalCard } from './block-proposal-card';
import { blockProposalLabels } from './block-proposal-labels';

export type KnowledgeBlockProposalContext = {
    requestWithSession: ConversationSessionRequest;
    conversationId: string;
    branchId: string;
    branchVersion: number;
    disabled?: boolean | undefined;
    captureInsertion?(): BlockInsertionBookmark | null;
    beforeApply(): Promise<{ branchId: string; version: number }>;
    onApplied(branch: KnowledgeWorkingBranch): void | Promise<void>;
    onApplyingChange?(busy: boolean): void;
    onShowBlocks?(blockIds: string[]): void;
    getBlockLabel?(blockId: string): string | undefined;
    getPlayback?(
        proposal: KnowledgeBlockProposal,
    ): LearningBlockPlayback | undefined;
    onAskAgain?(proposal: KnowledgeBlockProposal): void;
};
type ProposalListContext = {
    proposals: KnowledgeBlockProposal[];
    context: KnowledgeBlockProposalContext;
    applying: boolean;
    refresh(): void;
};
const ProposalList = createContext<ProposalListContext | null>(null);

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

function ProposalCards({
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

export function KnowledgeBlockProposals({
    context,
    actorId,
    completionKey = '',
    reconciliationKey = 0,
    children,
}: {
    context?: KnowledgeBlockProposalContext | undefined;
    actorId: string;
    completionKey?: string | undefined;
    reconciliationKey?: number | undefined;
    children?: ReactNode;
}) {
    const { locale } = useI18n();
    const labels = blockProposalLabels(locale);
    const [applying, setApplying] = useState(false);
    const query = useBlockProposals({
        actorId,
        conversationId: context?.conversationId,
        request: context?.requestWithSession,
        completionKey,
        reconciliationKey,
    });
    const proposals = query.data?.proposals ?? [];
    const error = query.isError;

    function changeApplying(value: boolean) {
        setApplying(value);
        context?.onApplyingChange?.(value);
    }

    function refresh() {
        void query.refresh();
    }

    if (!context) {
        return children;
    }

    const value = {
        proposals,
        context: { ...context, onApplyingChange: changeApplying },
        applying,
        refresh,
    };
    const standalone = children === undefined;
    const fallback = standalone
        ? proposals
        : proposals.filter((proposal) => !proposal.turnId);

    return (
        <ProposalList.Provider value={value}>
            {children}
            {fallback.length > 0 && (
                <section aria-label={labels.title}>
                    <ProposalCards value={value} proposals={fallback} />
                </section>
            )}
            {error && (
                <>
                    <InlineAlert tone='error'>{labels.error}</InlineAlert>
                    <Button type='button' variant='secondary' onClick={refresh}>
                        {labels.refresh}
                    </Button>
                </>
            )}
        </ProposalList.Provider>
    );
}
