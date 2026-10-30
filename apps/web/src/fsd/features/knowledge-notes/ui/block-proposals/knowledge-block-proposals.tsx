'use client';
import type { BlockInsertionBookmark } from '../../lib/block-insertion-bookmark';
import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from 'react';
import type {
    KnowledgeBlockProposal,
    KnowledgeWorkingBranch,
} from '@languon/contracts';
import type { LearningBlockPlayback } from '@/fsd/entities/learning-blocks';
import type { ConversationSessionRequest } from '@/fsd/entities/conversation';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { blockProposalsApi } from '../../api/block-proposals-api';
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
    if (!value || !turnId) return null;
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
    refreshKey,
    active = false,
    children,
}: {
    context?: KnowledgeBlockProposalContext | undefined;
    refreshKey?: string | number | undefined;
    active?: boolean | undefined;
    children?: ReactNode;
}) {
    const { locale } = useI18n();
    const labels = blockProposalLabels(locale);
    const [proposals, setProposals] = useState<KnowledgeBlockProposal[]>([]);
    const [error, setError] = useState(false);
    const [applying, setApplying] = useState(false);
    const [revision, setRevision] = useState(0);
    const requestWithSession = context?.requestWithSession;
    const conversationId = context?.conversationId;
    useEffect(() => {
        setProposals([]);
    }, [conversationId]);
    useEffect(() => {
        if (!requestWithSession || !conversationId) return;
        const controller = new AbortController();
        let loading = false;
        async function load() {
            if (loading) return;
            loading = true;
            try {
                const result = await blockProposalsApi.list(
                    requestWithSession!,
                    conversationId!,
                    controller.signal,
                );
                if (!controller.signal.aborted) {
                    setProposals(result.proposals);
                    setError(false);
                }
            } catch {
                if (!controller.signal.aborted) setError(true);
            } finally {
                loading = false;
            }
        }
        void load();
        const timer = active
            ? window.setInterval(() => void load(), 2_000)
            : undefined;
        return () => {
            controller.abort();
            if (timer !== undefined) window.clearInterval(timer);
        };
    }, [requestWithSession, conversationId, refreshKey, active, revision]);
    function changeApplying(value: boolean) {
        setApplying(value);
        context?.onApplyingChange?.(value);
    }
    function refresh() {
        setRevision((value) => value + 1);
    }
    if (!context) return children;
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
