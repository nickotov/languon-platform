import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
    ConversationEditorTarget,
    KnowledgeWorkingBranch,
} from '@languon/contracts';
import { knowledgeApi } from '@/fsd/entities/knowledge';
import type { KnowledgeEditorHandle } from '@/fsd/features/knowledge-notes';
import { useAuth } from '@/fsd/features/auth';
import { useRecordResourceOpen } from '@/fsd/features/library-navigation';
import { useI18n } from '@/fsd/shared/i18n';
import { useDirtyNavigation } from '@/fsd/shared/lib/navigation/use-dirty-navigation';
import { hasKnowledgeText } from '../lib/workspace-document';
import { useKnowledgeWorkspace } from './use-knowledge-workspace';

export type ProposalConflict = {
    text: string;
    action: 'insert' | 'append' | 'replace';
    targetId?: string;
    anchor?: ConversationEditorTarget;
    currentDocument?: string;
    format?: 'markdown' | 'plain-text';
};

export function useKnowledgePageActions(noteId: string) {
    const { href } = useI18n();
    const router = useRouter();
    const { requestWithSession } = useAuth();
    const state = useKnowledgeWorkspace(noteId);
    useRecordResourceOpen(
        'knowledge',
        noteId,
        state.query.isSuccess && !!state.workspace,
        requestWithSession,
    );
    const navigation = useDirtyNavigation();
    const editor = useRef<KnowledgeEditorHandle>(null);
    const deleteOperation = useRef(crypto.randomUUID());
    const [valid, setValid] = useState(true);
    const [busy, setBusy] = useState<
        'save' | 'copy' | 'delete' | 'resolve' | null
    >(null);
    const [actionError, setActionError] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [proposalConflict, setProposalConflict] =
        useState<ProposalConflict | null>(null);
    const [retargetProposal, setRetargetProposal] =
        useState<ProposalConflict | null>(null);

    const workspace = state.workspace;
    const draft = state.edit;
    const title = draft?.content.title ?? workspace?.published?.title ?? '';
    const canSave = Boolean(
        valid &&
        title.trim() &&
        draft &&
        hasKnowledgeText(draft.content.body.document),
    );
    const canPublish = canSave && (workspace?.branches.length ?? 0) <= 1;

    useEffect(() => {
        navigation.setDirty(state.hasLocalChanges);
    }, [navigation.setDirty, state.hasLocalChanges]);

    function getSnapshot(targetId?: string | null) {
        if (!editor.current)
            throw new Error('The document editor is still loading');
        return editor.current.getSnapshot(targetId);
    }

    function acceptProposal(
        text: string,
        action: 'insert' | 'append' | 'replace',
        targetId?: string,
        format?: 'markdown' | 'plain-text',
    ) {
        return (
            editor.current?.applyProposal(text, action, targetId, format) ??
            'missing'
        );
    }

    function compareProposal(
        text: string,
        action: 'insert' | 'append' | 'replace',
        targetId?: string,
        anchor?: ConversationEditorTarget,
        format?: 'markdown' | 'plain-text',
    ) {
        setProposalConflict({
            text,
            action,
            ...(format ? { format } : {}),
            ...(targetId ? { targetId } : {}),
            ...(anchor ? { anchor } : {}),
            ...(editor.current
                ? { currentDocument: editor.current.getSnapshot(null).content }
                : {}),
        });
    }

    async function restoreTarget(anchor: ConversationEditorTarget) {
        return (await editor.current?.restoreTarget(anchor)) ?? null;
    }

    async function save() {
        if (!canPublish) return;
        setBusy('save');
        setActionError(false);
        try {
            await state.save();
        } catch {
            setActionError(true);
            await state.reload().catch(() => undefined);
        } finally {
            setBusy(null);
        }
    }

    async function saveCopy() {
        if (!canSave) return;
        setBusy('copy');
        setActionError(false);
        try {
            const note = await state.saveCopy();
            navigation.setDirty(false);
            router.push(href(`/knowledge/${note.id}`));
        } catch {
            setActionError(true);
        } finally {
            setBusy(null);
        }
    }

    async function chooseBranch(branch: KnowledgeWorkingBranch) {
        setActionError(false);
        try {
            await state.flush();
            state.chooseBranch(branch);
        } catch {
            setActionError(true);
        }
    }

    async function resolveBranches() {
        setBusy('resolve');
        setActionError(false);
        try {
            await state.resolveCurrent();
        } catch {
            setActionError(true);
            await state.reload().catch(() => undefined);
        } finally {
            setBusy(null);
        }
    }

    async function remove() {
        if (!workspace) return;
        setBusy('delete');
        setActionError(false);
        try {
            await requestWithSession((token) =>
                knowledgeApi.remove(token, noteId, {
                    operationId: deleteOperation.current,
                    expectedVersion: workspace.published?.version ?? 0,
                }),
            );
            navigation.setDirty(false);
            router.push(href('/knowledge'));
        } catch {
            setActionError(true);
            setBusy(null);
        }
    }

    function openDelete() {
        setDeleting(true);
        setActionError(false);
    }

    function closeDelete() {
        if (!busy) setDeleting(false);
    }

    function openHistory() {
        setHistoryOpen(true);
    }

    function closeHistory() {
        setHistoryOpen(false);
    }

    function closeProposal() {
        setProposalConflict(null);
    }

    function beginRetarget(format?: 'markdown' | 'plain-text') {
        setRetargetProposal(
            proposalConflict
                ? { ...proposalConflict, ...(format ? { format } : {}) }
                : null,
        );
        setProposalConflict(null);
    }

    function cancelRetarget() {
        setRetargetProposal(null);
    }

    function applyRetarget() {
        if (!retargetProposal) return;
        const targetId = editor.current?.getSnapshot().targetId;
        const outcome = editor.current?.applyProposal(
            retargetProposal.text,
            retargetProposal.action,
            targetId,
            retargetProposal.format,
        );
        if (outcome === 'applied') {
            setRetargetProposal(null);
            return;
        }
        setProposalConflict({
            ...retargetProposal,
            ...(targetId ? { targetId } : {}),
        });
        setRetargetProposal(null);
    }

    function retry() {
        void state.query.refetch();
    }

    function refreshAfterSend() {
        void state.reload().catch(() => undefined);
    }

    async function beforeSend() {
        await state.flush();
    }

    return {
        state,
        workspace,
        draft,
        title,
        canSave,
        canPublish,
        navigation,
        editor,
        setValid,
        busy,
        actionError,
        deleting,
        historyOpen,
        proposalConflict,
        retargetProposal,
        getSnapshot,
        acceptProposal,
        compareProposal,
        restoreTarget,
        save,
        saveCopy,
        chooseBranch,
        resolveBranches,
        remove,
        openDelete,
        closeDelete,
        openHistory,
        closeHistory,
        closeProposal,
        beginRetarget,
        cancelRetarget,
        applyRetarget,
        retry,
        refreshAfterSend,
        beforeSend,
    };
}
