'use client';

import {
    BookOpen,
    FileText,
    Headphones,
    Languages,
    ListChecks,
    Plus,
    Video,
} from 'lucide-react';
import { Menu } from '@/fsd/shared/ui';
import type { BlockKind } from '../../lib/learning-block-form';
import type { BlockAuthoringLabels } from './block-labels';
import styles from './learning-block-authoring.module.css';

const blockIcons = {
    'bilingual-text': FileText,
    vocabulary: Languages,
    grammar: BookOpen,
    exercise: ListChecks,
    audio: Headphones,
    video: Video,
};

export function BlockInsertMenu({
    labels,
    disabled,
    onChoose,
}: {
    labels: BlockAuthoringLabels;
    disabled: boolean;
    onChoose(kind: BlockKind): void;
}) {
    const items = (Object.keys(blockIcons) as BlockKind[]).map((kind) => {
        const Icon = blockIcons[kind];
        function choose() {
            onChoose(kind);
        }
        return {
            label: labels.view.kinds[kind],
            disabled,
            icon: <Icon size={16} aria-hidden='true' />,
            onSelect: choose,
        };
    });
    const trigger = (
        <>
            <Plus size={16} aria-hidden='true' />
            {labels.add}
        </>
    );
    return (
        <Menu
            label={labels.add}
            trigger={trigger}
            items={items}
            triggerClassName={styles.insertTrigger}
            showChevron
        />
    );
}
