import {
    useEffect,
    useRef,
    useState,
    type KeyboardEvent,
    type ChangeEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { ConversationEditorTarget } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import type {
    WorkspaceAssistantProps,
    WorkspaceProposalAction,
} from '../../types';
import { workspaceProposalLabels } from './workspace-proposal-copy';
import styles from './workspace-proposal.module.css';
import { WorkspaceSuggestionCard } from './workspace-suggestion-card';
import { WorkspaceInlineProposal } from './workspace-inline-proposal';
import { WorkspaceProposalReview } from './workspace-proposal-review';

export function WorkspaceProposal({
    content,
    targetId,
    anchor,
    turnId,
    onAccept,
    rootId,
    onReview,
    workspace,
    proposalId,
    reviewingProposalId,
    onReviewingProposal,
}: {
    content: string;
    targetId?: string | undefined;
    anchor?: ConversationEditorTarget | undefined;
    turnId: string | null;
    rootId?: string | undefined;
    onReview?: (() => void) | undefined;
    workspace?: WorkspaceAssistantProps | undefined;
    proposalId?: string | undefined;
    reviewingProposalId?: string | null | undefined;
    onReviewingProposal?: ((id: string | null) => void) | undefined;
    onAccept(
        content: string,
        action: WorkspaceProposalAction,
        turnId: string | null,
        anchor?: ConversationEditorTarget,
        trackedTargetId?: string,
    ): Promise<'applied' | 'changed' | 'missing' | undefined>;
}) {
    const { locale } = useI18n();
    const copy = workspaceProposalLabels[locale];
    const [localOpen, setLocalOpen] = useState(false);
    const [inline, setInline] = useState(false);
    const open = onReviewingProposal
        ? reviewingProposalId === proposalId
        : localOpen;
    function setOpen(value: boolean) {
        if (onReviewingProposal && proposalId)
            onReviewingProposal(value ? proposalId : null);
        else setLocalOpen(value);
    }
    const [action, setAction] = useState<WorkspaceProposalAction>('append');
    const [status, setStatus] = useState('');
    const [pending, setPending] = useState(false);
    const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
    const [restoredTargetId, setRestoredTargetId] = useState<string>();
    const [restoring, setRestoring] = useState(false);
    const restoration = useRef(0);
    const previewTargetId = targetId ?? restoredTargetId;
    const preview = open
        ? (workspace?.getProposalPreview?.(previewTargetId, anchor) ?? null)
        : null;
    function showTarget() {
        workspace?.onShowTarget?.(previewTargetId);
    }
    const canShowTarget = Boolean(workspace?.onShowTarget && previewTargetId);
    const reviewRef = useRef<HTMLElement>(null);
    const reviewButtonRef = useRef<HTMLButtonElement>(null);
    useEffect(
        () => () => {
            restoration.current += 1;
        },
        [],
    );
    useEffect(() => {
        setPortalRoot(rootId ? document.getElementById(rootId) : null);
    }, [rootId]);
    useEffect(() => {
        if (!open) {
            restoration.current += 1;
            setRestoring(false);
            return;
        }
        reviewRef.current?.scrollIntoView({ block: 'nearest' });
        reviewRef.current?.focus({ preventScroll: true });
    }, [open, inline, preview?.changed]);
    function review() {
        setInline(false);
        beginReview();
    }
    function reviewInline() {
        setInline(true);
        beginReview();
    }
    function beginReview() {
        const target = workspace?.getProposalPreview?.(previewTargetId, anchor);
        if (target?.original || anchor?.originalText) setAction('replace');
        else if (targetId || anchor) setAction('insert');
        else setAction('append');
        setOpen(true);
        setStatus('');
        if (portalRoot) onReview?.();
        if (!previewTargetId && anchor && workspace?.restoreTarget) {
            const request = ++restoration.current;
            setRestoring(true);
            void workspace
                .restoreTarget(anchor)
                .then((id) => {
                    if (restoration.current === request)
                        setRestoredTargetId(id ?? undefined);
                })
                .catch(() => {
                    // The original passage remains visible; acceptance retains the comparison path.
                })
                .finally(() => {
                    if (restoration.current === request) setRestoring(false);
                });
        }
    }
    function fullReview() {
        setInline(false);
    }
    function cancel() {
        restoration.current += 1;
        setRestoring(false);
        setOpen(false);
        const button = reviewButtonRef.current;
        if (button && !button.closest('[inert]'))
            button.focus({ preventScroll: true });
    }
    function choose(event: ChangeEvent<HTMLInputElement>) {
        setAction(event.target.value as WorkspaceProposalAction);
        setStatus('');
    }
    function handleAccept() {
        void accept();
    }
    function keyDown(event: KeyboardEvent<HTMLElement>) {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            cancel();
        }
    }
    async function accept() {
        if (pending || restoring) return;
        if (
            (action !== 'append' && !targetId && !anchor) ||
            (action === 'replace' && anchor && anchor.from === anchor.to)
        ) {
            setStatus(copy.noTarget);
            return;
        }
        setPending(true);
        try {
            const result = await onAccept(
                content,
                action,
                turnId,
                anchor,
                previewTargetId,
            );
            if (result === 'applied') {
                setStatus(copy.applied);
                setOpen(false);
            } else if (result === 'changed' || result === 'missing') {
                setStatus(copy.conflict);
            }
        } catch {
            setStatus(copy.conflict);
        } finally {
            setPending(false);
        }
    }
    let acceptLabel = copy.acceptAppend;
    if (action === 'insert') acceptLabel = copy.acceptInsert;
    if (action === 'replace')
        acceptLabel = preview?.changed
            ? copy.acceptChanged
            : copy.acceptReplace;
    const canInsert = Boolean(previewTargetId || anchor);
    const canReplace = Boolean(preview?.original || anchor?.originalText);
    const reviewContent = open ? (
        <WorkspaceProposalReview
            reviewRef={reviewRef}
            action={action}
            content={content}
            preview={preview}
            original={anchor?.originalText}
            status={status}
            pending={pending}
            restoring={restoring}
            canShowTarget={canShowTarget}
            canInsert={canInsert}
            canReplace={canReplace}
            acceptLabel={acceptLabel}
            onKeyDown={keyDown}
            onShowTarget={showTarget}
            onCancel={cancel}
            onChoose={choose}
            onAccept={handleAccept}
        />
    ) : null;
    let displayedReview = portalRoot
        ? createPortal(reviewContent, portalRoot)
        : reviewContent;
    if (
        open &&
        inline &&
        workspace &&
        preview &&
        !preview.changed &&
        !restoring &&
        previewTargetId
    ) {
        displayedReview = (
            <WorkspaceInlineProposal
                workspace={workspace}
                targetId={previewTargetId}
                original={preview.original}
                content={content}
                pending={pending || restoring}
                onAccept={handleAccept}
                onClose={cancel}
                onFullReview={fullReview}
                fallback={reviewContent}
            />
        );
    }

    const canInline = Boolean(
        workspace?.inlineProposalRootId &&
        (previewTargetId || anchor) &&
        anchor?.originalText,
    );
    return (
        <div className={styles.proposal}>
            <WorkspaceSuggestionCard
                content={content}
                original={anchor?.originalText}
                open={open}
                onReview={review}
                onInline={reviewInline}
                canInline={canInline}
                triggerRef={reviewButtonRef}
            />
            {displayedReview}
            {status && !open && (
                <p role='status' className={styles.notice}>
                    {status}
                </p>
            )}
        </div>
    );
}
