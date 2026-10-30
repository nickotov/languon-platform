'use client';
import { useState } from 'react';
import { CheckCircle2, Maximize2, RotateCcw } from 'lucide-react';
import type { KnowledgeBlockProposal } from '@languon/contracts';
import { ConversationApiError } from '@/fsd/entities/conversation';
import {
    learningBlockIcons,
    learningBlockCount,
} from '@/fsd/entities/learning-blocks';
import { ProposalBlockContent } from '../proposal-block-content/proposal-block-content';
import {
    Button,
    Dialog,
    InlineAlert,
    useCompanionLayout,
} from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { useProposalAudio } from '../../hooks/use-proposal-audio';
import { blockProposalsApi } from '../../api/block-proposals-api';
import { localizedBlockLabels } from '../learning-block-authoring/block-locales';
import { blockProposalLabels } from './block-proposal-labels';
import type { KnowledgeBlockProposalContext } from './knowledge-block-proposals';
import styles from './block-proposal-card.module.css';

export function BlockProposalCard({
    proposal,
    context,
    onApplied,
    disabled,
}: {
    proposal: KnowledgeBlockProposal;
    context: KnowledgeBlockProposalContext;
    onApplied(): void;
    disabled: boolean;
}) {
    const { locale } = useI18n();
    const placement = useCompanionLayout();
    const labels = blockProposalLabels(locale);
    const blockLabels = localizedBlockLabels(locale).view;
    const [dismissed, setDismissed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [changed, setChanged] = useState(false);
    const [applied, setApplied] = useState(proposal.appliedAt !== null);
    const [review, setReview] = useState(false);
    const [appliedIds, setAppliedIds] = useState<string[] | null>(null);
    const [fullHeight, setFullHeight] = useState(false);
    const media = useProposalAudio(
        proposal,
        context.requestWithSession,
        review,
    );
    const wrongBranch = proposal.branchId !== context.branchId;
    const stale = wrongBranch || proposal.targetStale === true;
    const isApplied = applied || proposal.appliedAt !== null;
    const isStale = !isApplied && (stale || changed);
    const canApply = !isApplied && !isStale;
    const first = proposal.blocks[0]!;
    const playback = context.getPlayback?.(proposal);
    const Icon = learningBlockIcons[first.type];
    const typeLabel = blockLabels.kinds[first.type];
    const count = learningBlockCount(first) ?? proposal.blocks.length;
    const summary = `${typeLabel} · ${count}`;
    async function accept(mode: 'proposal' | 'add-separately' | 'cursor') {
        if (
            busy ||
            disabled ||
            isApplied ||
            wrongBranch ||
            (mode === 'proposal' && isStale)
        )
            return;
        const insertion =
            mode === 'cursor' ? context.captureInsertion?.() : null;
        if (mode === 'cursor' && !insertion) {
            setChanged(true);
            return;
        }
        context.onApplyingChange?.(true);
        setBusy(true);
        setError(false);
        setChanged(false);
        try {
            const branch = await context.beforeApply();
            if (branch.branchId !== proposal.branchId) {
                setChanged(true);
                return;
            }
            const insertionPosition = insertion?.resolve();
            if (insertion && insertionPosition === null) {
                setChanged(true);
                return;
            }
            const result = await blockProposalsApi.apply(
                context.requestWithSession,
                context.conversationId,
                proposal.id,
                branch.version,
                mode === 'proposal' ? undefined : 'add-separately',
                insertionPosition ?? undefined,
            );
            setAppliedIds(result.proposal.blocks.map((block) => block.id));
            setApplied(true);
            await context.onApplied(result.branch);
            onApplied();
        } catch (failure) {
            if (
                failure instanceof ConversationApiError &&
                failure.status === 409
            )
                setChanged(true);
            else setError(true);
        } finally {
            insertion?.release();
            context.onApplyingChange?.(false);
            setBusy(false);
        }
    }
    function apply() {
        void accept('proposal');
    }
    function addSeparately() {
        void accept('add-separately');
    }
    function addAtCursor() {
        void accept('cursor');
    }
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
    function toggleHeight() {
        setFullHeight((value) => !value);
    }
    function askAgain() {
        context.onAskAgain?.(proposal);
    }
    function showInSheet() {
        const ids = appliedIds ?? proposal.blocks.map((block) => block.id);
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
    const applyLabel = error
        ? labels.retry
        : proposal.target
          ? labels.update
          : labels.apply;
    const badge = isApplied ? labels.appliedShort : labels.notInSheet;
    const panelClass = fullHeight
        ? `${styles.review} ${styles.fullHeight}`
        : styles.review;
    if (dismissed)
        return (
            <article className={styles.preview} aria-label={labels.title}>
                <p>{labels.dismissed}</p>
                <Button variant='ghost' size='compact' onClick={restore}>
                    {labels.restore}
                </Button>
            </article>
        );
    const canInsertAtCursor =
        Boolean(context.captureInsertion) && !isApplied && !wrongBranch;
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
                <ProposalBlockContent
                    blocks={proposal.blocks}
                    variant='compact'
                    scope={`proposal-${proposal.id}`}
                    labels={blockLabels}
                    playback={playback}
                    audioUrls={media.urls}
                />
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
                {isStale && context.onAskAgain && (
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
            <Dialog
                open={review}
                onClose={closeReview}
                title={labels.reviewTitle}
                description={summary}
                className={panelClass}
                bodyClassName={styles.reviewBody}
                headerClassName={styles.reviewHeader}
                footerClassName={styles.reviewFooter}
                footer={
                    <div className={styles.panelActions}>
                        <p>
                            {isApplied
                                ? labels.applied
                                : labels.publicationNotice}
                        </p>
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
                            onClick={closeReview}
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
                                onClick={dismiss}
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
                    </div>
                }
            >
                <p className={styles.reviewNote}>{labels.reviewNote}</p>
                <ProposalBlockContent
                    blocks={proposal.blocks}
                    variant='review'
                    scope={`review-${proposal.id}`}
                    labels={blockLabels}
                    playback={playback}
                    audioUrls={media.urls}
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
                            audioUrls={media.urls}
                        />
                    </section>
                )}
                {isStale && (
                    <InlineAlert tone='warning'>{labels.stale}</InlineAlert>
                )}
                {error && (
                    <InlineAlert tone='error'>{labels.error}</InlineAlert>
                )}
            </Dialog>
        </article>
    );
}
