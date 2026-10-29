'use client';

import {
    LearningBlockSchema,
    LearningTranscriptSchema,
} from '@languon/contracts';
import type { LearningBlockViewProps } from '../../types';
import { exercisePracticeIdentity } from '../../lib/exercise-practice-identity';
import { useExerciseRevision } from '../../hooks/use-exercise-revision';
import {
    learningBlockCount,
    learningBlockIcons,
} from '../../lib/learning-block-metadata';
import { VocabularyBlock } from '../vocabulary-block/vocabulary-block';
import { BilingualBlock } from '../bilingual-block/bilingual-block';
import { MediaBlock } from '../media-block/media-block';
import { GrammarBlock } from '../grammar-block/grammar-block';
import { ExerciseBlock } from '../exercise-block/exercise-block';
import styles from '../block-layout.module.css';

/** Safe fixed renderers; presentation variants never change content or source authority. */
export function LearningBlockView(props: LearningBlockViewProps) {
    const exerciseRevision = useExerciseRevision(props.exerciseRevision);
    const block = LearningBlockSchema.parse(props.block);
    const hintTranscript = props.hintTranscript
        ? LearningTranscriptSchema.parse(props.hintTranscript)
        : undefined;
    const title =
        props.headingTitle ?? block.title ?? props.labels.kinds[block.type];
    let contentKey = JSON.stringify([
        block,
        props.audioUrl,
        props.hintVideoSource,
    ]);
    if (block.type === 'exercise') {
        contentKey = JSON.stringify([
            exercisePracticeIdentity(block, exerciseRevision),
            props.hintVideoSource,
            hintTranscript,
        ]);
    }
    const count = learningBlockCount(block);
    const metadata =
        props.headingMetadata ??
        `${props.labels.kinds[block.type]}${count !== undefined ? ` · ${count}` : ''}`;
    const Icon = learningBlockIcons[block.type];
    const preview = props.variant === 'compact' || props.variant === 'review';
    const accented = !preview && props.accented !== false;
    const className = [
        styles.root,
        accented ? styles.accented : undefined,
        preview ? styles.preview : undefined,
        props.hideHeading && !props.preserveFrame
            ? styles.withoutHeading
            : undefined,
    ]
        .filter(Boolean)
        .join(' ');
    let content;
    if (block.type === 'vocabulary')
        content = <VocabularyBlock {...props} block={block} />;
    if (block.type === 'bilingual-text')
        content = <BilingualBlock {...props} block={block} />;
    if (block.type === 'grammar')
        content = <GrammarBlock {...props} block={block} />;
    if (block.type === 'video' || block.type === 'audio')
        content = (
            <MediaBlock
                {...props}
                block={block}
                hintTranscript={hintTranscript}
            />
        );
    if (block.type === 'exercise')
        content = (
            <ExerciseBlock
                {...props}
                block={block}
                hintTranscript={hintTranscript}
            />
        );
    return (
        <section
            className={className}
            data-block-family={props.frameFamily ?? block.type}
            data-variant={props.variant}
            aria-label={title}
        >
            {!props.hideHeading ? (
                <div className={styles.heading}>
                    {props.headingLeading}
                    <Icon
                        size={16}
                        className={styles.familyIcon}
                        aria-hidden='true'
                    />
                    <h3 className={styles.title}>{title}</h3>
                    <span className={styles.metadata}>{metadata}</span>
                    <span className={styles.headingSpacer} />
                    {props.headingActions}
                </div>
            ) : null}
            {props.contentLeading}
            <div key={contentKey}>{props.content ?? content}</div>
            {props.actions}
        </section>
    );
}
