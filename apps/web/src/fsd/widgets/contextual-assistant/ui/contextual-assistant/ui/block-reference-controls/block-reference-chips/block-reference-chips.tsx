import { Layers, X } from 'lucide-react';
import {
    knowledgeLearningBlockLabels,
    type KnowledgeBlockReference,
} from '@/fsd/features/knowledge-notes';
import { useI18n } from '@/fsd/shared/i18n';
import { Tooltip } from '@/fsd/shared/ui';
import { blockReferenceCopy } from '../../../../../lib/block-reference-copy';
import styles from '../../../../styles/contextual-assistant-block-reference-controls-common.module.css';

export function BlockReferenceChips({
    selected,
    available,
    onRemove,
}: {
    selected: KnowledgeBlockReference[];
    available: KnowledgeBlockReference[];
    onRemove(id: string): void;
}) {
    return (
        <div className={styles.chips}>
            {selected.map((item) => (
                <ReferenceChip
                    key={item.id}
                    item={item}
                    missing={
                        !available.some((current) => current.id === item.id)
                    }
                    onRemove={onRemove}
                />
            ))}
        </div>
    );
}

function ReferenceChip({
    item,
    missing,
    onRemove,
}: {
    item: KnowledgeBlockReference;
    missing: boolean;
    onRemove(id: string): void;
}) {
    const { locale } = useI18n();
    const copy = blockReferenceCopy(locale);
    const kind = knowledgeLearningBlockLabels(locale).view.kinds[item.type];
    const label = item.title || kind;
    const removeLabel = `${copy.remove}: ${label}`;
    function remove() {
        onRemove(item.id);
    }

    return (
        <span className={styles.chip} data-missing={missing}>
            <Layers size={14} aria-hidden />
            <span dir='auto'>{label}</span>
            {missing && <span>{copy.missing}</span>}
            <Tooltip
                content={removeLabel}
                desktopOnly
                triggerClassName={styles.removeTooltipTrigger}
            >
                <button type='button' onClick={remove} aria-label={removeLabel}>
                    <X size={14} aria-hidden />
                </button>
            </Tooltip>
        </span>
    );
}
