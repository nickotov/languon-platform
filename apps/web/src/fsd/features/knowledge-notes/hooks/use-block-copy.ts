import { useCallback, useState } from 'react';
import {
    CopyKnowledgeBlocksRequestSchema,
    type CopyKnowledgeBlocksRequest,
    type CopyKnowledgeBlocksResponseSchema,
} from '@languon/contracts';
import { knowledgeApi } from '@/fsd/entities/knowledge';
import {
    copyKnowledgeBlocks,
    type KnowledgeBlockCopyContext,
} from '../api/block-copy-api';
import type { CopyDestination } from '../types';

type Plan = {
    destinationNoteId: string;
    request: CopyKnowledgeBlocksRequest;
    result: ReturnType<typeof CopyKnowledgeBlocksResponseSchema.parse>;
};
export function useBlockCopy(
    context: KnowledgeBlockCopyContext,
    initialSelection: string[] = [],
    initialDestination?: CopyDestination,
) {
    const [selected, setSelected] = useState<string[]>(initialSelection);
    const [destination, setDestination] = useState<CopyDestination | null>(
        initialDestination ?? null,
    );
    const [plan, setPlan] = useState<Plan | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [copied, setCopied] = useState(false);
    const chooseDestination = useCallback((value: CopyDestination | null) => {
        setDestination(value);
        setPlan(null);
        setCopied(false);
    }, []);
    function chooseBlocks(ids: string[]) {
        setSelected(ids);
        setPlan(null);
        setCopied(false);
    }
    async function preview() {
        if (!destination || selected.length === 0 || busy) return;
        setBusy(true);
        setError(false);
        setCopied(false);
        setPlan(null);
        context.onApplyingChange?.(true);
        try {
            const source = context.beforeCopy
                ? await context.beforeCopy()
                : context.source;
            const workspace = await context.requestWithSession((token) =>
                knowledgeApi.workspace(token, destination.noteId),
            );
            const branch = workspace.branches.find(
                (value) => value.id === destination.branchId,
            );
            if (!branch)
                throw new Error('The destination draft is unavailable.');
            const request = CopyKnowledgeBlocksRequestSchema.parse({
                operationId: crypto.randomUUID(),
                source,
                branchId: branch.id,
                expectedBranchVersion: branch.version,
                preview: true,
                blockIds: selected,
            });
            const result = await copyKnowledgeBlocks(
                context,
                destination.noteId,
                request,
            );
            setPlan({ request, destinationNoteId: destination.noteId, result });
        } catch {
            setError(true);
        } finally {
            context.onApplyingChange?.(false);
            setBusy(false);
        }
    }
    async function apply() {
        if (!plan || busy) return;
        setBusy(true);
        setError(false);
        context.onApplyingChange?.(true);
        try {
            // Flush local source/destination edits, but keep the frozen operation for replay.
            await context.beforeCopy?.();
            await context.beforeApply?.(plan.destinationNoteId);
            const result = await copyKnowledgeBlocks(
                context,
                plan.destinationNoteId,
                { ...plan.request, preview: false },
            );
            if (!result.branch)
                throw new Error('The copied working draft is unavailable.');
            await context.onApplied?.(plan.destinationNoteId, result.branch);
            setCopied(true);
            setPlan(null);
        } catch {
            setError(true);
        } finally {
            context.onApplyingChange?.(false);
            setBusy(false);
        }
    }
    return {
        selected,
        chooseBlocks,
        destination,
        chooseDestination,
        plan,
        preview,
        apply,
        busy,
        error,
        copied,
    };
}
