import type { LearningBlock } from '@languon/contracts';
import { BookMarked, ChevronDown } from 'lucide-react';
import type { MenuItem } from '@/fsd/shared/ui';
import type { BlockAuthoringLabels } from './block-labels';

/** Type-specific entries extend the shared block menu without adding another toolbar. */
export function blockAuthoringMenuActions({
    block,
    labels,
    external,
    canSave,
    expanded,
    onSave,
    onToggle,
}: {
    block: LearningBlock;
    labels: BlockAuthoringLabels;
    external: MenuItem[];
    canSave: boolean;
    expanded: boolean;
    onSave(): void;
    onToggle(): void;
}): MenuItem[] {
    const actions = [...external];
    if (block.type === 'vocabulary' || block.type === 'bilingual-text')
        actions.push({
            label: labels.field(
                block.type === 'vocabulary'
                    ? 'Save to dictionary'
                    : 'Save to Texts',
            ),
            icon: <BookMarked size={16} aria-hidden />,
            disabled: !canSave,
            separatorBefore: true,
            onSelect: onSave,
        });
    if (block.type === 'vocabulary')
        actions.push({
            label: labels.field(
                expanded ? 'Hide all translations' : 'Show all translations',
            ),
            icon: <ChevronDown size={16} aria-hidden />,
            onSelect: onToggle,
            separatorBefore: true,
        });
    return actions;
}
