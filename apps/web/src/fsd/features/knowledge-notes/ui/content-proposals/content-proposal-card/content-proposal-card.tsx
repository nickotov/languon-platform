'use client';
import { useState } from 'react';
import { BookOpen, CheckCircle2 } from 'lucide-react';
import type { KnowledgeContentProposal } from '@languon/contracts';
import {
    learningBlockIcons,
    learningBlockCount,
} from '@/fsd/entities/learning-blocks';
import { Button, InlineAlert, useCompanionLayout } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { useProposalAudio } from '../../../hooks/use-proposal-audio';
import { localizedBlockLabels } from '../../learning-block-authoring/block-locales';
import { contentProposalLabels } from '../../../lib/content-proposal-labels';
import type { KnowledgeContentProposalContext } from '../knowledge-content-proposals';
import styles from '../../styles/content-proposal-card-common.module.css';
import { contentProposalBlocks } from '../../../lib/content-proposal-blocks';
import { ContentProposalPreview } from '../content-proposal-preview/content-proposal-preview';
import { contentProposalExcerpt } from '../../../lib/content-proposal-excerpt';
import { useApplyContentProposal } from '../../../hooks/use-apply-content-proposal';
import { ContentProposalReview } from '../content-proposal-review/content-proposal-review';
import { ContentProposalActions } from '../content-proposal-actions/content-proposal-actions';

export function ContentProposalCard({
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
    const { locale } = useI18n();
    const placement = useCompanionLayout();
    const labels = contentProposalLabels(locale);
    const blockLabels = localizedBlockLabels(locale).view;
    const [dismissed, setDismissed] = useState(false);
    const [review, setReview] = useState(false);
    const media = useProposalAudio(
        proposal,
        context.requestWithSession,
        review,
    );
    const application = useApplyContentProposal({
        proposal,
        context,
        onApplied,
        disabled,
    });
    const { error, appliedIds, isApplied, isStale } = application;
    const blocks = contentProposalBlocks(proposal);
    const first = blocks[0];
    const mixed = proposal.body.document.content?.some(
        (node) => node.type !== 'learningBlock',
    );
    const playback = context.getPlayback?.(proposal);
    const Icon = first && !mixed ? learningBlockIcons[first.type] : BookOpen;
    const typeLabel =
        first && !mixed ? blockLabels.kinds[first.type] : labels.title;
    const count =
        first && !mixed
            ? (learningBlockCount(first) ?? blocks.length)
            : proposal.body.document.content?.length;
    const summary = `${typeLabel} · ${count}`;
    const excerpt = contentProposalExcerpt(proposal);
    function dismiss() {
        setReview(false);
        setDismissed(true);
    }

    function restore() {
        setDismissed(false);
    }

    function openReview() {
        setReview(true);
    }

    function closeReview() {
        setReview(false);
    }

    function askAgain() {
        context.onAskAgain?.(proposal);
    }

    function showInSheet() {
        const ids = appliedIds ?? blocks.map((block) => block.id);
        if (placement) {
            placement.setMobileTab('document');
            placement.setMode('split');
        }

        if (context.onShowBlocks) {
            context.onShowBlocks(ids);

            return;
        }

        window.requestAnimationFrame(() => {
            const element = document.querySelector<HTMLElement>(
                `[data-learning-block-id="${ids[0]}"]`,
            );

            element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element?.focus({ preventScroll: true });
        });
    }

    const targetIdentity = proposal.target
        ? context.getBlockLabel?.(proposal.target.blockId) ||
          `${labels.blockIdentity} ${proposal.target.blockId}`
        : undefined;
    let applyLabel = proposal.target ? labels.update : labels.apply;
    if (error) {
        applyLabel = labels.retry;
    }

    const badge = isApplied ? labels.appliedShort : labels.notInSheet;
    if (dismissed) {
        return (
            <article className={styles.preview} aria-label={labels.title}>
                <p>{labels.dismissed}</p>
                <Button variant='ghost' size='compact' onClick={restore}>
                    {labels.restore}
                </Button>
            </article>
        );
    }

    return (
        <article
            ref={media.ref}
            className={styles.preview}
            aria-label={labels.title}
        >
            <header className={styles.header}>
                <Icon size={16} aria-hidden='true' />
                <p className={styles.summary}>{summary}</p>
                <span className={isApplied ? styles.applied : styles.badge}>
                    {isApplied && <CheckCircle2 size={14} aria-hidden='true' />}
                    {badge}
                </span>
            </header>
            <div className={styles.content}>
                {proposal.target && (
                    <p className={styles.caption}>
                        {labels.updates}:{' '}
                        <strong dir='auto'>{targetIdentity}</strong>
                    </p>
                )}
                {mixed ? (
                    <p className={styles.excerpt}>{excerpt}</p>
                ) : (
                    <ContentProposalPreview
                        proposal={proposal}
                        variant='compact'
                        playback={playback}
                        audioUrls={media.urls}
                    />
                )}
            </div>
            <div aria-live='polite' className={styles.notice}>
                {isStale && (
                    <InlineAlert tone='warning'>{labels.stale}</InlineAlert>
                )}
                {error && (
                    <InlineAlert tone='error'>{labels.error}</InlineAlert>
                )}
                {isApplied && <p role='status'>{labels.applied}</p>}
            </div>
            <ContentProposalActions
                application={application}
                disabled={disabled}
                canAskAgain={Boolean(context.onAskAgain)}
                applyLabel={applyLabel}
                dismiss={dismiss}
                askAgain={askAgain}
                showInSheet={showInSheet}
                openReview={openReview}
            />
            <ContentProposalReview
                proposal={proposal}
                summary={summary}
                application={application}
                disabled={disabled}
                open={review}
                onClose={closeReview}
                onDismiss={dismiss}
                playback={playback}
                audioUrls={media.urls}
            />
        </article>
    );
}
