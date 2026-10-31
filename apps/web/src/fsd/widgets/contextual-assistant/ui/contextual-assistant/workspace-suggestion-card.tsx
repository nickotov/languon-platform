import { FilePenLine, MousePointerClick } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { workspaceCopy } from '../../lib/workspace-copy';
import { workspaceProposalLabels } from './workspace-proposal-copy';
import styles from './workspace-proposal.module.css';
import { WorkspaceSuggestionPreview } from './workspace-suggestion-preview/workspace-suggestion-preview';

export function WorkspaceSuggestionCard({
    formattedContent,
    original,
    open,
    canInline,
    onReview,
    onInline,
    triggerRef,
}: {
    formattedContent: ReactNode;
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
    const removed =
        original && original.length > 140
            ? `${original.slice(0, 140)}…`
            : original;
    const reviewAction = canInline ? onInline : onReview;
    return (
        <div
            className={styles.suggestionCard}
            role='region'
            aria-label={copy.proposed}
        >
            <div className={styles.suggestionHeader}>
                <p className={styles.suggestionCaption}>
                    {workspace.suggestion}
                </p>
                <WorkspaceSuggestionPreview content={formattedContent} />
            </div>
            <div className={styles.suggestionExcerpt}>
                {removed && <del>{removed}</del>}
                <div
                    className={styles.suggestionContent}
                    role='document'
                    aria-label={copy.proposed}
                    tabIndex={0}
                >
                    {formattedContent}
                </div>
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
