import type { ChangeEvent, KeyboardEvent, Ref } from 'react';
import { Crosshair, X } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import type {
    WorkspaceProposalAction,
    WorkspaceProposalPreview,
} from '../../types';
import { WorkspaceProposalModes } from './workspace-proposal-modes';
import { WorkspaceProposalPreviewContent } from './workspace-proposal-preview';
import { workspaceProposalLabels } from './workspace-proposal-copy';
import styles from './workspace-proposal.module.css';

/** Full comparison remains available even when a captured target has changed or vanished. */
export function WorkspaceProposalReview({
    reviewRef,
    action,
    content,
    preview,
    original,
    status,
    pending,
    restoring,
    canShowTarget,
    canInsert,
    canReplace,
    acceptLabel,
    onKeyDown,
    onShowTarget,
    onCancel,
    onChoose,
    onAccept,
}: {
    reviewRef: Ref<HTMLElement>;
    action: WorkspaceProposalAction;
    content: string;
    preview: WorkspaceProposalPreview | null;
    original: string | undefined;
    status: string;
    pending: boolean;
    restoring: boolean;
    canShowTarget: boolean;
    canInsert: boolean;
    canReplace: boolean;
    acceptLabel: string;
    onKeyDown(event: KeyboardEvent<HTMLElement>): void;
    onShowTarget(): void;
    onCancel(): void;
    onChoose(event: ChangeEvent<HTMLInputElement>): void;
    onAccept(): void;
}) {
    const { locale } = useI18n();
    const copy = workspaceProposalLabels[locale];
    const disabled = pending || restoring;
    return (
        <section
            ref={reviewRef}
            className={styles.proposalReview}
            aria-label={copy.heading}
            tabIndex={-1}
            onKeyDown={onKeyDown}
        >
            <header className={styles.header}>
                <span className={styles.accentDot} aria-hidden='true' />
                <div className={styles.heading}>
                    <strong>{copy.heading}</strong>
                    <p>{copy.unchanged}</p>
                </div>
                {canShowTarget && (
                    <button
                        type='button'
                        className={styles.showTarget}
                        onClick={onShowTarget}
                    >
                        <Crosshair size={14} aria-hidden='true' />
                        {copy.showTarget}
                    </button>
                )}
                <button
                    type='button'
                    className={styles.close}
                    onClick={onCancel}
                    disabled={pending}
                    aria-label={copy.closeReview}
                >
                    <X size={16} aria-hidden='true' />
                </button>
            </header>
            <div className={styles.body}>
                <WorkspaceProposalModes
                    action={action}
                    onChange={onChoose}
                    pending={disabled}
                    canInsert={canInsert}
                    canReplace={canReplace}
                    preview={preview}
                    original={original}
                />
                <WorkspaceProposalPreviewContent
                    action={action}
                    content={content}
                    preview={preview}
                    original={original}
                />
                {status && (
                    <p role='status' className={styles.notice}>
                        {status}
                    </p>
                )}
            </div>
            <div className={styles.proposalActions}>
                <p>{copy.undo}</p>
                <button
                    type='button'
                    className={styles.cancel}
                    onClick={onCancel}
                    disabled={pending}
                >
                    {copy.cancel}
                </button>
                <button
                    type='button'
                    onClick={onAccept}
                    className={styles.accept}
                    disabled={disabled}
                >
                    {acceptLabel}
                </button>
            </div>
        </section>
    );
}
