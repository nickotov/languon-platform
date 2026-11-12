import { Layers } from 'lucide-react';
import {
    knowledgeLearningBlockLabels,
    type KnowledgeBlockReference,
} from '@/fsd/features/knowledge-notes';
import { useI18n } from '@/fsd/shared/i18n';
import { blockReferenceCopy } from '../../../../../lib/block-reference-copy';
import styles from '../../../../styles/contextual-assistant-block-reference-controls-common.module.css';

/** History resolves only against the already authorized current-note catalog. */
export function MessageBlockReferences({
    ids,
    available,
}: {
    ids: string[];
    available: KnowledgeBlockReference[];
}) {
    const { locale } = useI18n();
    const copy = blockReferenceCopy(locale);
    const kinds = knowledgeLearningBlockLabels(locale).view.kinds;

    return (
        <div className={styles.chips}>
            {ids.map((id) => {
                const item = available.find((item) => item.id === id);
                const label = item
                    ? item.title || kinds[item.type]
                    : copy.missing;

                return (
                    <span className={styles.chip} key={id}>
                        <Layers size={14} aria-hidden />
                        <span dir='auto'>{label}</span>
                    </span>
                );
            })}
        </div>
    );
}
