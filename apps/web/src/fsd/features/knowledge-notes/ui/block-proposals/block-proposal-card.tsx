'use client';
import { useState } from 'react';
import type { KnowledgeBlockProposal } from '@languon/contracts';
import { LearningBlockView } from '@/fsd/entities/learning-blocks';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { blockProposalsApi } from '../../api/block-proposals-api';
import { localizedBlockLabels } from '../learning-block-authoring/block-locales';
import { blockProposalLabels } from './block-proposal-labels';
import type { KnowledgeBlockProposalContext } from './knowledge-block-proposals';
import styles from './block-proposal-card.module.css';

export function BlockProposalCard({
    proposal,
    context,
    onApplied,
    disabled,
}: {
    proposal: KnowledgeBlockProposal;
    context: KnowledgeBlockProposalContext;
    onApplied(): void;
    disabled: boolean;
}) {
    const { locale } = useI18n();
    const labels = blockProposalLabels(locale);
    const blockLabels = localizedBlockLabels(locale).view;
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [changed, setChanged] = useState(false);
    const [applied, setApplied] = useState(proposal.appliedAt !== null);
    const stale =
        proposal.branchId !== context.branchId ||
        proposal.baseBranchVersion !== context.branchVersion;
    async function apply() {
        if (busy || disabled || applied || stale) return;
        context.onApplyingChange?.(true);
        setBusy(true);
        setError(false);
        setChanged(false);
        try {
            const branch = await context.beforeApply();
            if (
                branch.branchId !== proposal.branchId ||
                branch.version !== proposal.baseBranchVersion
            ) {
                setChanged(true);
                return;
            }
            const result = await blockProposalsApi.apply(
                context.requestWithSession,
                context.conversationId,
                proposal.id,
                branch.version,
            );
            setApplied(true);
            await context.onApplied(result.branch);
            onApplied();
        } catch {
            setError(true);
        } finally {
            context.onApplyingChange?.(false);
            setBusy(false);
        }
    }
    const isApplied = applied || proposal.appliedAt !== null;
    const isStale = !isApplied && (stale || changed);
    return (
        <article className={styles.preview} aria-label={labels.title}>
            {proposal.blocks.map((block) => (
                <LearningBlockView
                    key={block.id}
                    block={block}
                    labels={blockLabels}
                />
            ))}
            {isApplied ? (
                <p role='status'>{labels.applied}</p>
            ) : (
                <Button
                    type='button'
                    onClick={apply}
                    loading={busy}
                    disabled={isStale || disabled}
                >
                    {labels.apply}
                </Button>
            )}
            {isStale && (
                <InlineAlert tone='warning'>{labels.stale}</InlineAlert>
            )}
            {error && <InlineAlert tone='error'>{labels.error}</InlineAlert>}
        </article>
    );
}
