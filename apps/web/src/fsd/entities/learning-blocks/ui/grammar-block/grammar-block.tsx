import { ArrowRight, Check, X } from 'lucide-react';
import type { LearningBlock } from '@languon/contracts';
import type {
    LearningBlockLabels,
    LearningBlockPlayback,
    LearningBlockVariant,
} from '../../types';
import { BlockPlayButton } from '../block-play-button/block-play-button';
import styles from './grammar-block.module.css';

type Grammar = Extract<LearningBlock, { type: 'grammar' }>;
export function GrammarBlock({
    block,
    labels,
    variant,
    scope,
    playback,
}: {
    block: Grammar;
    labels: LearningBlockLabels;
    variant?: LearningBlockVariant | undefined;
    scope?: string | undefined;
    playback?: LearningBlockPlayback | undefined;
}) {
    const compact = variant === 'compact';
    const examples = compact ? block.examples?.slice(0, 1) : block.examples;
    const rule = compact ? block.rule?.split(/(?<=[.!?])\s/u)[0] : block.rule;
    const className = compact ? styles.compact : styles.root;
    return (
        <div className={className} lang={block.language} dir='auto'>
            {rule ? <p className={styles.rule}>{rule}</p> : null}
            {block.pattern ? (
                <div>
                    {!compact ? (
                        <p className={styles.label}>{labels.pattern}</p>
                    ) : null}
                    <p className={styles.pattern}>{block.pattern}</p>
                </div>
            ) : null}
            {examples?.length ? (
                <div>
                    {!compact ? (
                        <p className={styles.label}>{labels.examples}</p>
                    ) : null}
                    <ul className={styles.examples}>
                        {examples.map((example, index) => {
                            const request = {
                                id: `${scope ?? block.id}:example:${index}`,
                                blockId: block.id,
                                text: example.text,
                                language: block.language,
                            };
                            return (
                                <li key={index} className={styles.exampleRow}>
                                    <div className={styles.example}>
                                        <p>{example.text}</p>
                                        {example.translation ? (
                                            <p className={styles.translation}>
                                                {example.translation}
                                            </p>
                                        ) : null}
                                    </div>
                                    {!compact ? (
                                        <BlockPlayButton
                                            request={request}
                                            playback={playback}
                                            labels={labels}
                                        />
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ) : null}
            {!compact && block.commonMistakes?.length ? (
                <div>
                    <p className={styles.label}>{labels.commonMistakes}</p>
                    <ul className={styles.mistakes}>
                        {block.commonMistakes.map((mistake, index) => (
                            <li key={index} className={styles.mistake}>
                                <p className={styles.correction}>
                                    <span className={styles.incorrect}>
                                        <X
                                            size={14}
                                            aria-label={labels.incorrect}
                                        />
                                        <del>{mistake.incorrect}</del>
                                    </span>
                                    <ArrowRight size={14} aria-hidden='true' />
                                    <span className={styles.correct}>
                                        <Check
                                            size={14}
                                            aria-label={labels.correct}
                                        />
                                        {mistake.correct}
                                    </span>
                                </p>
                                {mistake.explanation ? (
                                    <p className={styles.explanation}>
                                        {mistake.explanation}
                                    </p>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </div>
    );
}
