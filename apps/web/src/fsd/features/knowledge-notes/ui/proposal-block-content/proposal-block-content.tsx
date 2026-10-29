import type { ExerciseLearningBlock, LearningBlock } from '@languon/contracts';
import {
    LearningBlockView,
    LearningExerciseSet,
    type LearningBlockLabels,
    type LearningBlockPlayback,
} from '@/fsd/entities/learning-blocks';
import styles from './proposal-block-content.module.css';

type Part =
    | { kind: 'single'; block: LearningBlock }
    | { kind: 'exercises'; blocks: ExerciseLearningBlock[] };
function parts(blocks: LearningBlock[]): Part[] {
    const result: Part[] = [];
    for (const block of blocks) {
        const previous = result.at(-1);
        if (block.type === 'exercise' && block.group) {
            if (
                previous?.kind === 'exercises' &&
                previous.blocks[0]?.group?.id === block.group.id
            )
                previous.blocks.push(block);
            else result.push({ kind: 'exercises', blocks: [block] });
        } else result.push({ kind: 'single', block });
    }
    return result;
}
function partTitle(part: Part, labels: LearningBlockLabels): string {
    if (part.kind === 'single')
        return part.block.title ?? labels.kinds[part.block.type];
    const first = part.blocks[0];
    return first?.group?.title ?? first?.title ?? labels.kinds.exercise;
}
export function ProposalBlockContent({
    blocks,
    variant,
    scope,
    labels,
    playback,
    audioUrls,
}: {
    blocks: LearningBlock[];
    variant: 'compact' | 'review';
    scope: string;
    labels: LearningBlockLabels;
    playback?: LearningBlockPlayback | undefined;
    audioUrls?: Record<string, string> | undefined;
}) {
    const sections = parts(blocks);
    return (
        <>
            {sections.map((part) => {
                const first =
                    part.kind === 'single' ? part.block : part.blocks[0]!;
                const title = partTitle(part, labels);
                const audioUrl =
                    first.type === 'audio' && first.assetId
                        ? audioUrls?.[first.assetId]
                        : undefined;
                const entries =
                    part.kind === 'exercises'
                        ? part.blocks.map((block) => ({ block }))
                        : [];
                return (
                    <section
                        key={first.id}
                        className={styles.section}
                        data-variant={variant}
                    >
                        <h3 className={styles.title}>{title}</h3>
                        {part.kind === 'exercises' ? (
                            <LearningExerciseSet
                                entries={entries}
                                labels={labels}
                                variant={variant}
                                hideHeading
                                scope={scope}
                            />
                        ) : (
                            <LearningBlockView
                                block={part.block}
                                variant={variant}
                                hideHeading
                                scope={scope}
                                labels={labels}
                                playback={playback}
                                audioUrl={audioUrl}
                            />
                        )}
                    </section>
                );
            })}
        </>
    );
}
