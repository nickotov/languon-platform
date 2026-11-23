'use client';

import { useMemo } from 'react';
import { Check, ListEnd, TextCursorInput } from 'lucide-react';
import type { KnowledgeContentProposal } from '@languon/contracts';
import { Button, PanelPage, useCompanionLayout } from '@/fsd/shared/ui';
import type { LearningBlockPlayback } from '@/fsd/entities/learning-blocks';
import { useI18n } from '@/fsd/shared/i18n';
import { contentProposalLabels } from '../../../lib/content-proposal-labels';
import type { useInsertLessonCopy } from '../../../hooks/use-insert-lesson-copy';
import { LessonDocumentBlocks } from '../lesson-document-blocks/lesson-document-blocks';
import {
    LessonInsertNotice,
    type LessonInsertFeedback,
} from '../lesson-insert-notice/lesson-insert-notice';
import styles from './lesson-proposal-review.module.css';

type Application = LessonInsertFeedback &
    Pick<
        ReturnType<typeof useInsertLessonCopy>,
        | 'canInsertLesson'
        | 'canInsertLessonAtCursor'
        | 'insertLesson'
        | 'isPartPresent'
    >;

function buildSections(proposal: KnowledgeContentProposal) {
    const nodes = proposal.body.document.content ?? [];
    const sourceBlocks = nodes.flatMap((node) => node.attrs?.block ?? []);
    const dependencies = [...sourceBlocks, ...(proposal.dependencies ?? [])];

    const sections = (proposal.lessonParts ?? []).map((part) => {
        const content = nodes.slice(
            part.startIndex,
            part.startIndex + part.nodeCount,
        );
        const ownIds = new Set(content.map((node) => node.attrs?.block?.id));

        const includesSource = content.some(({ attrs }) => {
            const block = attrs?.block;

            return (
                block?.type === 'exercise' &&
                (block.source ||
                    block.group?.parentBlockId ||
                    block.semantics?.sources.some(
                        (source) =>
                            source.kind !== 'text-selection' &&
                            source.origin.kind === 'block',
                    ))
            );
        });

        return {
            ...part,
            includesSource,
            body: {
                ...proposal.body,
                document: { ...proposal.body.document, content },
            },
            dependencies: dependencies.filter((block) => !ownIds.has(block.id)),
        };
    });

    const dependenciesBody = {
        ...proposal.body,
        document: {
            ...proposal.body.document,
            content: (proposal.dependencies ?? []).map((block) => ({
                type: 'learningBlock' as const,
                attrs: { block },
            })),
        },
    };

    return { sections, sourceBlocks, dependenciesBody };
}

export function LessonProposalReview({
    proposal,
    application,
    onClose,
    playback,
    audioUrls,
}: {
    proposal: KnowledgeContentProposal;
    application: Application;
    audioUrls?: Record<string, string> | undefined;
    playback?: LearningBlockPlayback | undefined;
    onClose(): void;
}) {
    const { locale } = useI18n();
    const labels = contentProposalLabels(locale);
    const layout = useCompanionLayout();
    const obscured =
        layout?.workspace &&
        !layout.detached &&
        (layout.mobile || layout.overlay || layout.mode === 'chat');
    const { sections, sourceBlocks, dependenciesBody } = useMemo(
        () => buildSections(proposal),
        [proposal],
    );
    const allPresent = sections.every((part) =>
        application.isPartPresent(part.taskId),
    );
    const kindLabels = {
        prose: labels.reading,
        exercises: labels.exercises,
        grammar: labels.grammar,
        vocabulary: labels.vocabulary,
        'bilingual-text': labels.bilingualText,
    };

    function choosePosition() {
        if (!layout) {
            return;
        }

        if (layout.mobile) {
            layout.setMobileTab('document');
        } else {
            layout.setMode(layout.overlay ? 'focus' : 'split');
        }

        requestAnimationFrame(() => {
            document
                .getElementById(layout.contentId)
                ?.querySelector<HTMLElement>(
                    '[contenteditable="true"][role="textbox"], .tiptap[contenteditable="true"]',
                )
                ?.focus({ preventScroll: true });
        });
    }

    function placementActions(taskId?: string) {
        const disabled =
            application.busy ||
            !application.canInsertLesson ||
            (taskId ? application.isPartPresent(taskId) : allPresent);

        return (
            <div className={styles.actions}>
                <Button
                    size='compact'
                    variant='secondary'
                    leadingIcon={<TextCursorInput size={14} aria-hidden />}
                    disabled={disabled || !application.canInsertLessonAtCursor}
                    onClick={() =>
                        void application.insertLesson(taskId, 'cursor')
                    }
                >
                    {taskId ? labels.insertHere : labels.remainingHere}
                </Button>
                <Button
                    size='compact'
                    variant='secondary'
                    leadingIcon={<ListEnd size={14} aria-hidden />}
                    disabled={disabled}
                    onClick={() => void application.insertLesson(taskId, 'end')}
                >
                    {taskId ? labels.insertAtEnd : labels.remainingEnd}
                </Button>
            </div>
        );
    }

    return (
        <PanelPage
            title={labels.reviewTitle}
            backLabel={labels.backToChat}
            onBack={onClose}
            footer={
                <>
                    <LessonInsertNotice application={application} />
                    {placementActions()}
                </>
            }
        >
            {obscured && (
                <Button variant='ghost' size='compact' onClick={choosePosition}>
                    {labels.choosePosition}
                </Button>
            )}
            {sections.map((part) => (
                <section
                    className={styles.part}
                    key={part.taskId}
                    data-lesson-part={part.taskId}
                    aria-label={kindLabels[part.kind]}
                >
                    <header className={styles.partHeader}>
                        <h3>{kindLabels[part.kind]}</h3>
                        {application.isPartPresent(part.taskId) && (
                            <span className={styles.present}>
                                <Check size={14} aria-hidden />
                                {labels.inDocument}
                            </span>
                        )}
                    </header>
                    <LessonDocumentBlocks
                        body={part.body}
                        dependencies={part.dependencies}
                        audioUrls={audioUrls}
                        playback={playback}
                    />
                    {part.includesSource && (
                        <p className={styles.sourceNote}>
                            {labels.includedSources}
                        </p>
                    )}
                    {placementActions(part.taskId)}
                </section>
            ))}
            {proposal.dependencies?.length ? (
                <details className={styles.basis}>
                    <summary>{labels.sourceBasis}</summary>
                    <LessonDocumentBlocks
                        body={dependenciesBody}
                        dependencies={sourceBlocks}
                        audioUrls={audioUrls}
                        playback={playback}
                    />
                </details>
            ) : null}
        </PanelPage>
    );
}
