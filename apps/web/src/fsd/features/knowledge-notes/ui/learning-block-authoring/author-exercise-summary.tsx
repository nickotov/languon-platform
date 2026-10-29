import { exercisePracticeIdentity } from '@/fsd/entities/learning-blocks';
import type { PositionedBlock } from '../../lib/positioned-learning-blocks';
import { useBlockAuthoring } from './block-authoring-context';
import type { BlockAuthoringLabels } from './block-labels';
import styles from './learning-block-node.module.css';

export function AuthorExerciseSummary({
    group,
    expansionId,
    labels,
}: {
    group: PositionedBlock[];
    expansionId: string;
    labels: BlockAuthoringLabels;
}) {
    const authoring = useBlockAuthoring();
    const questions = group.flatMap((item) =>
        item.block.type === 'exercise' ? [item.block] : [],
    );
    const attempted = questions.filter((block) => {
        const options = authoring?.blockViewOptions?.(block);
        if (options?.learnerState?.attempted) return true;
        const local = authoring?.attempted[block.id];
        return (
            local?.attempted &&
            local.identity ===
                exercisePracticeIdentity(block, options?.exerciseRevision)
        );
    }).length;
    const expanded = authoring?.expansions[expansionId]?.open;
    const expandLabel = labels.field(expanded ? 'Collapse all' : 'Expand all');
    const attemptedLabel = labels.view.attempted ?? labels.field('attempted');
    function toggle() {
        authoring?.toggleExpansion(expansionId);
    }
    return (
        <div className={styles.groupSummary}>
            <span>
                {attempted} / {questions.length} {attemptedLabel}
            </span>
            <button type='button' className={styles.expandAll} onClick={toggle}>
                {expandLabel}
            </button>
        </div>
    );
}
