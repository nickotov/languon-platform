import type { ExerciseLearningBlock, LearningBlock } from '@languon/contracts';
import {
    LearningBlockView,
    LearningExerciseSet,
    type LearningBlockLabels,
    type LearningBlockPlayback,
} from '@/fsd/entities/learning-blocks';
import styles from './proposal-block-content.module.css';

type ProposalSection =
    | { kind: 'single'; block: LearningBlock }
    | { kind: 'exercises'; blocks: ExerciseLearningBlock[] };

function buildProposalSections(blocks: LearningBlock[]): ProposalSection[] {
    const sections: ProposalSection[] = [];

    for (const block of blocks) {
        const previousSection = sections.at(-1);

        if (block.type === 'exercise' && block.group) {
            // Only adjacent questions share a section; merging across another
            // block would change the learner's authored content order.
            const continuesPreviousExerciseGroup =
                previousSection?.kind === 'exercises' &&
                previousSection.blocks[0]?.group?.id === block.group.id;

            if (continuesPreviousExerciseGroup) {
                previousSection.blocks.push(block);
            } else {
                sections.push({ kind: 'exercises', blocks: [block] });
            }
        } else {
            sections.push({ kind: 'single', block });
        }
    }

    return sections;
}

function proposalSectionTitle(
    section: ProposalSection,
    labels: LearningBlockLabels,
): string {
    if (section.kind === 'single') {
        return section.block.title ?? labels.kinds[section.block.type];
    }

    const firstExercise = section.blocks[0];

    return (
        firstExercise?.group?.title ??
        firstExercise?.title ??
        labels.kinds.exercise
    );
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
    const sections = buildProposalSections(blocks);

    return (
        <>
            {sections.map((section) => {
                const firstBlock =
                    section.kind === 'single'
                        ? section.block
                        : section.blocks[0]!;
                const title = proposalSectionTitle(section, labels);
                const audioUrl =
                    firstBlock.type === 'audio' && firstBlock.assetId
                        ? audioUrls?.[firstBlock.assetId]
                        : undefined;
                const exerciseEntries =
                    section.kind === 'exercises'
                        ? section.blocks.map((block) => ({ block }))
                        : [];

                return (
                    <section
                        key={firstBlock.id}
                        className={styles.section}
                        data-variant={variant}
                    >
                        <h3 className={styles.title}>{title}</h3>
                        {section.kind === 'exercises' ? (
                            <LearningExerciseSet
                                entries={exerciseEntries}
                                labels={labels}
                                variant={variant}
                                hideHeading
                                scope={scope}
                            />
                        ) : (
                            <LearningBlockView
                                block={section.block}
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
