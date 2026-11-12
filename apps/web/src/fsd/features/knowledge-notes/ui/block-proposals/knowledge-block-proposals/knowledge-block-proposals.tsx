'use client';
import { useState, type ReactNode } from 'react';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { useBlockProposals } from '../../../hooks/use-block-proposals';
import { blockProposalLabels } from '../block-proposal-labels';
import type { KnowledgeBlockProposalContext } from './types';
import { ProposalList } from './proposal-list-context';
import { ProposalCards } from './ui/proposal-cards/proposal-cards';
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
