'use client';

import { useState, type ReactNode } from 'react';
import {
    BookOpen,
    Captions,
    ChevronsDown,
    ChevronsUp,
    FileText,
    Headphones,
    ListChecks,
    Video,
    X,
} from 'lucide-react';
import { Dialog } from '@/fsd/shared/ui';
import type { BlockKind } from '../../lib/learning-block-form';
import type { BlockAuthoringLabels } from './block-labels';
import styles from './block-editor-panel.module.css';

const icons = {
    vocabulary: BookOpen,
    grammar: FileText,
    'bilingual-text': Captions,
    audio: Headphones,
    video: Video,
    exercise: ListChecks,
};

/** Native modal focus/lifecycle, with the supplied side-panel and bottom-sheet geometry. */
export function BlockEditorPanel({
    kind,
    title,
    subtitle,
    dismissible = true,
    labels,
    onClose,
    footer,
    children,
}: {
    kind: BlockKind;
    title: string;
    subtitle?: string | undefined;
    dismissible?: boolean | undefined;
    labels: BlockAuthoringLabels;
    onClose(): void;
    footer: ReactNode;
    children: ReactNode;
}) {
    const [expanded, setExpanded] = useState(false);
    const Icon = icons[kind];
    const ExpandIcon = expanded ? ChevronsDown : ChevronsUp;
    const className = [styles.panel, expanded ? styles.expanded : '']
        .filter(Boolean)
        .join(' ');
    const expandLabel = labels.field(
        expanded ? 'Collapse editor' : 'Expand editor',
    );
    const editLabels = {
        vocabulary: 'Edit vocabulary block',
        grammar: 'Edit grammar block',
        'bilingual-text': 'Edit bilingual text block',
        audio: 'Edit audio block',
        video: 'Edit video block',
        exercise: 'Edit exercises block',
    };
    const resolvedSubtitle =
        subtitle ??
        `${labels.field(editLabels[kind])} · ${labels.field('Uses author credits')}`;
    function toggleExpanded() {
        setExpanded((value) => !value);
    }
    return (
        <Dialog
            open
            dismissible={dismissible}
            title={title}
            showHeader={false}
            onClose={onClose}
            className={className}
            bodyClassName={styles.body}
            footerClassName={styles.footer}
            footer={footer}
        >
            <div className={styles.handle} aria-hidden />
            <header className={styles.header}>
                <Icon size={16} className={styles.icon} aria-hidden />
                <div className={styles.heading}>
                    <h2 className={styles.title}>{title}</h2>
                    {resolvedSubtitle && (
                        <p className={styles.subtitle}>{resolvedSubtitle}</p>
                    )}
                </div>
                <button
                    type='button'
                    onClick={toggleExpanded}
                    className={styles.expand}
                    aria-label={expandLabel}
                >
                    <ExpandIcon size={16} aria-hidden />
                </button>
                <button
                    type='button'
                    onClick={onClose}
                    className={styles.close}
                    aria-label={labels.cancel}
                    disabled={!dismissible}
                >
                    <X size={16} aria-hidden />
                </button>
            </header>
            <div className={styles.content}>{children}</div>
        </Dialog>
    );
}
