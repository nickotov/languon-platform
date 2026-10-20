import { FilePenLine, MousePointerClick } from 'lucide-react';
import type { Ref } from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { workspaceCopy } from '../../lib/workspace-copy';
import { workspaceProposalLabels } from './workspace-proposal-copy';
import styles from './workspace-proposal.module.css';

export function WorkspaceSuggestionCard({
    content,
    original,
    open,
    canInline,
    onReview,
    onInline,
    triggerRef,
}: {
    content: string;
    original?: string | undefined;
    open: boolean;
    canInline: boolean;
    onReview(): void;
    onInline(): void;
    triggerRef: Ref<HTMLButtonElement>;
}) {
    const { locale } = useI18n();
    const copy = workspaceProposalLabels[locale];
    const workspace = workspaceCopy(locale);
    const excerpt =
        content.length > 180 ? `${content.slice(0, 180)}…` : content;
    const removed =
        original && original.length > 140
            ? `${original.slice(0, 140)}…`
            : original;
    const reviewAction = canInline ? onInline : onReview;
    return (
        <div className={styles.suggestionCard}>
            <p className={styles.suggestionCaption}>{workspace.suggestion}</p>
            <div className={styles.suggestionExcerpt}>
                {removed && <del>{removed}</del>}
                {removed ? <ins>{excerpt}</ins> : <p>{excerpt}</p>}
            </div>
            <div className={styles.suggestionFooter}>
                <button
                    type='button'
                    ref={triggerRef}
                    className={styles.reviewButton}
                    onClick={reviewAction}
                    aria-pressed={open}
                >
                    {canInline ? (
                        <MousePointerClick size={16} aria-hidden='true' />
                    ) : (
                        <FilePenLine size={16} aria-hidden='true' />
                    )}
                    {canInline ? copy.showInline : copy.review}
                </button>
            </div>
        </div>
    );
}
