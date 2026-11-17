import { useState } from 'react';
import { X } from 'lucide-react';
import type { KnowledgeContentProposal } from '@languon/contracts';
import type { LearningBlockPlayback } from '@/fsd/entities/learning-blocks';
import { Button, Dialog, DialogActions, InlineAlert } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import type { useApplyContentProposal } from '../../../hooks/use-apply-content-proposal';
import { localizedBlockLabels } from '../../learning-block-authoring/block-locales';
import { ProposalBlockContent } from '../../proposal-block-content/proposal-block-content';
import { ContentProposalPreview } from '../content-proposal-preview/content-proposal-preview';
import { contentProposalLabels } from '../../../lib/content-proposal-labels';
import styles from './content-proposal-review.module.css';

export function ContentProposalReview({
    proposal,
    summary,
    application,
    disabled,
    open,
    onClose,
    onDismiss,
    playback,
    audioUrls,
}: {
    proposal: KnowledgeContentProposal;
    summary: string;
    application: ReturnType<typeof useApplyContentProposal>;
    disabled: boolean;
    open: boolean;
    onClose(): void;
    onDismiss(): void;
    playback?: LearningBlockPlayback | undefined;
    audioUrls?: Record<string, string> | undefined;
}) {
    const { locale } = useI18n();
    const labels = contentProposalLabels(locale);
    const blockLabels = localizedBlockLabels(locale).view;
    const [fullHeight, setFullHeight] = useState(false);
    const {
        busy,
        error,
        isApplied,
        isStale,
        canApply,
        canInsertAtCursor,
        apply,
        addAtCursor,
    } = application;
    const panelClass = fullHeight
        ? `${styles.review} ${styles.fullHeight}`
        : styles.review;
    let applyLabel = proposal.target ? labels.update : labels.apply;
    if (error) {
        applyLabel = labels.retry;
    }

    function toggleHeight() {
        setFullHeight((value) => !value);
    }

    return (
        <Dialog
            open={open}
            onClose={onClose}
            title={labels.reviewTitle}
            description={summary}
            className={panelClass}
            bodyClassName={styles.reviewBody}
            headerClassName={styles.reviewHeader}
            footerClassName={styles.reviewFooter}
            footer={
                <div className={styles.panelActions}>
                    <p>
                        {isApplied ? labels.applied : labels.publicationNotice}
                    </p>
                    <DialogActions className={styles.panelActionButtons}>
                        <Button
                            type='button'
                            size='compact'
                            variant='ghost'
                            className={styles.heightButton}
                            onClick={toggleHeight}
                        >
                            {fullHeight ? labels.collapse : labels.expand}
                        </Button>
                        <Button
                            type='button'
                            size='compact'
                            variant='ghost'
                            onClick={onClose}
                            desktopIconOnly
                            leadingIcon={<X size={14} aria-hidden='true' />}
                        >
                            {labels.close}
                        </Button>
                        {canInsertAtCursor && (
                            <Button
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
                                size='compact'
                                variant='ghost'
                                onClick={onDismiss}
                                disabled={disabled || busy}
                            >
                                {labels.dismiss}
                            </Button>
                        )}
                        {canApply && (
                            <Button
                                type='button'
                                size='compact'
                                loading={busy}
                                onClick={apply}
                                disabled={disabled}
                            >
                                {applyLabel}
                            </Button>
                        )}
                    </DialogActions>
                </div>
            }
        >
            <p className={styles.reviewNote}>{labels.reviewNote}</p>
            <ContentProposalPreview
                proposal={proposal}
                variant='review'
                playback={playback}
                audioUrls={audioUrls}
            />
            {(proposal.dependencies?.length ?? 0) > 0 && (
                <section>
                    <h3>{labels.sourceBasis}</h3>
                    <p>{labels.sourceBasisNote}</p>
                    <ProposalBlockContent
                        blocks={proposal.dependencies!}
                        variant='review'
                        scope={`source-${proposal.id}`}
                        labels={blockLabels}
                        audioUrls={audioUrls}
                    />
                </section>
            )}
            {isStale && (
                <InlineAlert tone='warning'>{labels.stale}</InlineAlert>
            )}
            {error && <InlineAlert tone='error'>{labels.error}</InlineAlert>}
        </Dialog>
    );
}
