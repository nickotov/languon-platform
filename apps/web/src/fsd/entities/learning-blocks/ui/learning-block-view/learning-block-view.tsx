'use client';

import {
    LearningBlockSchema,
    LearningTranscriptSchema,
} from '@languon/contracts';
import type { LearningBlockViewProps } from '../../types';
import { VocabularyBlock } from '../vocabulary-block/vocabulary-block';
import { BilingualBlock } from '../bilingual-block/bilingual-block';
import { MediaBlock } from '../media-block/media-block';
import { GrammarBlock } from '../grammar-block/grammar-block';
import { ExerciseBlock } from '../exercise-block/exercise-block';
import styles from '../block-layout.module.css';

/** Safe fixed renderers, never HTML or untrusted DOM attributes. */
export function LearningBlockView(props: LearningBlockViewProps) {
    const block = LearningBlockSchema.parse(props.block);
    const hintTranscript = props.hintTranscript
        ? LearningTranscriptSchema.parse(props.hintTranscript)
        : undefined;
    const contentKey = JSON.stringify([
        block,
        props.audioUrl,
        props.hintVideoSource,
    ]);
    const title = block.title ?? props.labels.kinds[block.type];
    let content;
    if (block.type === 'vocabulary')
        content = <VocabularyBlock block={block} labels={props.labels} />;
    if (block.type === 'bilingual-text')
        content = <BilingualBlock block={block} labels={props.labels} />;
    if (block.type === 'grammar')
        content = <GrammarBlock block={block} labels={props.labels} />;
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
        <section className={styles.root} aria-label={title}>
            <h3 className={styles.title}>{title}</h3>
            <div key={contentKey}>{content}</div>
            {props.actions}
        </section>
    );
}
