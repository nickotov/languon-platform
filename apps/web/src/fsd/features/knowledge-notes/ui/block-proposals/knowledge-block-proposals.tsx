'use client';
import { useEffect, useState } from 'react';
import type {
    KnowledgeBlockProposal,
    KnowledgeWorkingBranch,
} from '@languon/contracts';
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
    beforeApply(): Promise<{ branchId: string; version: number }>;
    onApplied(branch: KnowledgeWorkingBranch): void | Promise<void>;
    onApplyingChange?(busy: boolean): void;
};
export function KnowledgeBlockProposals({
    context,
    refreshKey,
    active = false,
}: {
    context: KnowledgeBlockProposalContext;
    refreshKey?: string | number | undefined;
    active?: boolean | undefined;
}) {
    const { locale } = useI18n();
    const labels = blockProposalLabels(locale);
    const [proposals, setProposals] = useState<KnowledgeBlockProposal[]>([]);
    const [error, setError] = useState(false);
    const [applying, setApplying] = useState(false);
    const [revision, setRevision] = useState(0);
    const { requestWithSession, conversationId } = context;
    useEffect(() => {
        const controller = new AbortController();
        let loading = false;
        async function load() {
            if (loading) return;
            loading = true;
            try {
                const result = await blockProposalsApi.list(
                    requestWithSession,
                    conversationId,
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
        context.onApplyingChange?.(value);
    }
    const cardContext = { ...context, onApplyingChange: changeApplying };
    function refresh() {
        setRevision((value) => value + 1);
    }
    return (
        <section aria-label={labels.title}>
            {proposals.map((proposal) => (
                <BlockProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    context={cardContext}
                    disabled={applying || Boolean(context.disabled)}
                    onApplied={refresh}
                />
            ))}
            {error && (
                <>
                    <InlineAlert tone='error'>{labels.error}</InlineAlert>
                    <Button type='button' variant='secondary' onClick={refresh}>
                        {labels.refresh}
                    </Button>
                </>
            )}
        </section>
    );
}
