import { useRef, useState } from 'react';
import type { KnowledgeContentProposal } from '@languon/contracts';
import { ConversationApiError } from '@/fsd/entities/conversation';
import { contentProposalsApi } from '../api/content-proposals-api';
import { contentProposalBlocks } from '../lib/content-proposal-blocks';
import type { KnowledgeContentProposalContext } from '../ui/content-proposals/knowledge-content-proposals';

export function useApplyContentProposal({
    proposal,
    context,
    onApplied,
    disabled,
}: {
    proposal: KnowledgeContentProposal;
    context: KnowledgeContentProposalContext;
    onApplied(): void;
    disabled: boolean;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [changed, setChanged] = useState(false);
    const [applied, setApplied] = useState(proposal.appliedAt !== null);
    const [appliedIds, setAppliedIds] = useState<string[] | null>(null);
    const lock = useRef(false);
    const wrongBranch = proposal.branchId !== context.branchId;
    const stale = wrongBranch || proposal.targetStale === true;
    const isApplied = applied || proposal.appliedAt !== null;
    const isStale = !isApplied && (stale || changed);
    const canApply = !isApplied && !isStale;
    const canInsertAtCursor =
        Boolean(context.captureInsertion) && !isApplied && !wrongBranch;

    async function accept(mode: 'proposal' | 'add-separately' | 'cursor') {
        if (
            lock.current ||
            busy ||
            disabled ||
            isApplied ||
            wrongBranch ||
            (mode === 'proposal' && isStale)
        ) {
            return;
        }

        const insertion =
            mode === 'cursor' ? context.captureInsertion?.() : null;

        if (mode === 'cursor' && !insertion) {
            setChanged(true);

            return;
        }

        lock.current = true;
        context.onApplyingChange?.(true);
        setBusy(true);
        setError(false);
        setChanged(false);
        try {
            const branch = await context.beforeApply();
            if (branch.branchId !== proposal.branchId) {
                setChanged(true);

                return;
            }

            const insertionPosition = insertion?.resolve();
            if (insertion && insertionPosition === null) {
                setChanged(true);

                return;
            }

            const result = await contentProposalsApi.apply(
                context.requestWithSession,
                context.conversationId,
                proposal.id,
                branch.version,
                mode === 'proposal' ? undefined : 'add-separately',
                insertionPosition ?? undefined,
            );

            setAppliedIds(
                contentProposalBlocks(result.proposal).map((block) => block.id),
            );

            setApplied(true);
            await context.onApplied(result.branch);
            onApplied();
        } catch (failure) {
            if (
                failure instanceof ConversationApiError &&
                failure.status === 409
            ) {
                setChanged(true);
            } else {
                setError(true);
            }
        } finally {
            insertion?.release();
            context.onApplyingChange?.(false);
            setBusy(false);
            lock.current = false;
        }
    }

    function apply() {
        void accept('proposal');
    }

    function addSeparately() {
        void accept('add-separately');
    }

    function addAtCursor() {
        void accept('cursor');
    }

    return {
        busy,
        error,
        appliedIds,
        wrongBranch,
        isApplied,
        isStale,
        canApply,
        canInsertAtCursor,
        apply,
        addAtCursor,
        addSeparately,
    };
}
