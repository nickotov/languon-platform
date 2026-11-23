'use client';

import { useState } from 'react';
import { BookOpen, Plus } from 'lucide-react';
import type { KnowledgeContentProposal } from '@languon/contracts';
import { Button } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { useProposalAudio } from '../../../hooks/use-proposal-audio';
import { useInsertLessonCopy } from '../../../hooks/use-insert-lesson-copy';
import { contentProposalExcerpt } from '../../../lib/content-proposal-excerpt';
import { contentProposalLabels } from '../../../lib/content-proposal-labels';
import type { ProposalListContext } from '../knowledge-content-proposals/proposal-list-context';
import { LessonInsertNotice } from '../lesson-insert-notice/lesson-insert-notice';
import { LessonProposalReview } from '../lesson-proposal-review/lesson-proposal-review';
import styles from '../../styles/content-proposal-card-common.module.css';
import entryStyles from './lesson-proposal-entry.module.css';

export function LessonProposalEntry({
    proposal,
    value,
    onClose,
    grouped = false,
}: {
    proposal: KnowledgeContentProposal;
    value: ProposalListContext;
    onClose?: () => void;
    grouped?: boolean;
}) {
    const { locale } = useI18n();
    const labels = contentProposalLabels(locale);
    const [open, setOpen] = useState(false);
    const application = useInsertLessonCopy({
        proposal,
        context: value.context,
        disabled: value.applying || Boolean(value.context.disabled),
        onApplied: value.refresh,
    });
    const media = useProposalAudio(
        proposal,
        value.context.requestWithSession,
        Boolean(onClose) || open,
    );
    const playback = value.context.getPlayback?.(proposal);
    const allPresent = (proposal.lessonParts ?? []).every((part) =>
        application.isPartPresent(part.taskId),
    );
    const excerpt = contentProposalExcerpt(proposal);
    function openReview() {
        setOpen(true);
    }

    function closeReview() {
        setOpen(false);
    }

    function insertAll() {
        void application.insertLesson(undefined, 'end');
    }

    if (onClose) {
        return (
            <LessonProposalReview
                proposal={proposal}
                application={application}
                audioUrls={media.urls}
                playback={playback}
                onClose={onClose}
            />
        );
    }

    const controls = (
        <>
            <div className={entryStyles.cardActions}>
                <Button
                    size='compact'
                    onClick={insertAll}
                    disabled={
                        !application.canInsertLesson ||
                        application.busy ||
                        allPresent
                    }
                    leadingIcon={<Plus size={14} aria-hidden />}
                >
                    {allPresent ? labels.inDocument : labels.remainingEnd}
                </Button>
                <Button size='compact' variant='secondary' onClick={openReview}>
                    {labels.review}
                </Button>
            </div>
            {!open && <LessonInsertNotice application={application} />}
            {open && (
                <LessonProposalReview
                    proposal={proposal}
                    application={application}
                    audioUrls={media.urls}
                    playback={playback}
                    onClose={closeReview}
                />
            )}
        </>
    );

    if (grouped) {
        return (
            <div role='group' aria-label={labels.title}>
                {controls}
            </div>
        );
    }

    return (
        <article className={styles.preview} aria-label={labels.title}>
            <header className={styles.header}>
                <BookOpen size={16} aria-hidden />
                <p className={styles.summary}>{labels.title}</p>
            </header>
            <div className={styles.content}>
                {excerpt && <p className={styles.excerpt}>{excerpt}</p>}
                {controls}
            </div>
        </article>
    );
}
