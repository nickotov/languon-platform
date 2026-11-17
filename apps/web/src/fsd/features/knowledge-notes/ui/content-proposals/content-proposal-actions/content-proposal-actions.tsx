import { Maximize2, RotateCcw } from 'lucide-react';
import { Button } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import type { useApplyContentProposal } from '../../../hooks/use-apply-content-proposal';
import { contentProposalLabels } from '../../../lib/content-proposal-labels';
import styles from './content-proposal-actions.module.css';

export function ContentProposalActions({
    application,
    disabled,
    canAskAgain,
    applyLabel,
    dismiss,
    askAgain,
    showInSheet,
    openReview,
}: {
    application: ReturnType<typeof useApplyContentProposal>;
    disabled: boolean;
    canAskAgain: boolean;
    applyLabel: string;
    dismiss(): void;
    askAgain(): void;
    showInSheet(): void;
    openReview(): void;
}) {
    const { locale } = useI18n();
    const labels = contentProposalLabels(locale);
    const {
        busy,
        error,
        wrongBranch,
        isApplied,
        isStale,
        canApply,
        canInsertAtCursor,
        apply,
        addAtCursor,
        addSeparately,
    } = application;

    return (
        <footer className={styles.footer}>
            {canApply && (
                <Button
                    type='button'
                    size='compact'
                    onClick={apply}
                    disabled={disabled}
                    loading={busy}
                    leadingIcon={
                        error ? (
                            <RotateCcw size={14} aria-hidden='true' />
                        ) : undefined
                    }
                >
                    {applyLabel}
                </Button>
            )}
            {canInsertAtCursor && (
                <Button
                    type='button'
                    size='compact'
                    variant='secondary'
                    onClick={addAtCursor}
                    disabled={disabled || busy}
                >
                    {labels.addAtCursor}
                </Button>
            )}
            {!isApplied && (
                <Button
                    type='button'
                    size='compact'
                    variant='ghost'
                    onClick={dismiss}
                    disabled={disabled || busy}
                >
                    {labels.dismiss}
                </Button>
            )}
            {isStale && !wrongBranch && (
                <Button
                    type='button'
                    size='compact'
                    variant='secondary'
                    onClick={addSeparately}
                    loading={busy}
                    disabled={disabled}
                >
                    {labels.addSeparately}
                </Button>
            )}
            {isStale && canAskAgain && (
                <Button
                    type='button'
                    size='compact'
                    variant='ghost'
                    onClick={askAgain}
                    disabled={disabled}
                >
                    {labels.askAgain}
                </Button>
            )}
            {isApplied && (
                <Button
                    type='button'
                    size='compact'
                    variant='secondary'
                    onClick={showInSheet}
                >
                    {labels.showInSheet}
                </Button>
            )}
            <Button
                type='button'
                size='compact'
                variant='ghost'
                className={styles.reviewButton}
                onClick={openReview}
                leadingIcon={<Maximize2 size={14} aria-hidden='true' />}
            >
                {labels.review}
            </Button>
        </footer>
    );
}
