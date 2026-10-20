import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, Columns3, X } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import type { WorkspaceAssistantProps } from '../../types';
import { workspaceProposalLabels } from './workspace-proposal-copy';
import styles from './workspace-proposal.module.css';

/** Uses the editor's mapped target geometry; acceptance still uses the original guarded target. */
export function WorkspaceInlineProposal({
    workspace,
    targetId,
    original,
    formattedContent,
    pending,
    onAccept,
    onClose,
    onFullReview,
    fallback,
}: {
    workspace: WorkspaceAssistantProps;
    targetId?: string | undefined;
    original: string;
    formattedContent: ReactNode;
    pending: boolean;
    onAccept(): void;
    onClose(): void;
    onFullReview(): void;
    fallback: ReactNode;
}) {
    const { locale } = useI18n();
    const copy = workspaceProposalLabels[locale];
    const ref = useRef<HTMLElement>(null);
    const root = workspace.inlineProposalRootId
        ? document.getElementById(workspace.inlineProposalRootId)
        : null;
    const position = workspace.getProposalPosition?.(targetId);
    const available = Boolean(root && position);
    useEffect(() => {
        if (!available) onFullReview();
    }, [available, onFullReview]);
    useEffect(() => {
        ref.current?.focus({ preventScroll: true });
        ref.current?.scrollIntoView({ block: 'nearest' });
    }, [available]);
    function key(event: KeyboardEvent<HTMLElement>) {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
    }
    if (!root || !position) {
        const reviewRoot = workspace.proposalRootId
            ? document.getElementById(workspace.proposalRootId)
            : null;
        return reviewRoot ? createPortal(fallback, reviewRoot) : fallback;
    }
    return createPortal(
        <section
            ref={ref}
            tabIndex={-1}
            style={position}
            className={styles.inlineProposal}
            aria-label={copy.heading}
            onKeyDown={key}
        >
            <p className={styles.inlineCaption}>
                {copy.inlineFrom} · {copy.replace}
            </p>
            <div className={styles.inlineDiff}>
                <span className={styles.screenReaderOnly}>
                    {copy.whenAsked}: {original}. {copy.proposed}:{' '}
                </span>
                {formattedContent}
            </div>
            <div className={styles.inlineActions}>
                <button
                    type='button'
                    className={styles.inlineAccept}
                    onClick={onAccept}
                    disabled={pending}
                >
                    <Check size={16} aria-hidden='true' />
                    {copy.inlineAccept}
                </button>
                <button type='button' onClick={onFullReview} disabled={pending}>
                    <Columns3 size={16} aria-hidden='true' />
                    {copy.inlineCompare}
                </button>
                <button type='button' onClick={onClose} disabled={pending}>
                    <X size={16} aria-hidden='true' />
                    {copy.inlineReject}
                </button>
            </div>
        </section>,
        root,
    );
}
