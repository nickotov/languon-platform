import type { LearningBlock } from '@languon/contracts';
import { GrammarCallout } from '@/fsd/shared/ui/grammar-callout/grammar-callout';
import type { LearningBlockLabels } from '../../types';
import styles from '../block-layout.module.css';

type Grammar = Extract<LearningBlock, { type: 'grammar' }>;
export function GrammarBlock({
    block,
    labels,
}: {
    block: Grammar;
    labels: LearningBlockLabels;
}) {
    return (
        <div className={styles.stack} lang={block.language} dir='auto'>
            {block.rule ? (
                <GrammarCallout eyebrow={labels.rule}>
                    <p className={styles.text}>{block.rule}</p>
                </GrammarCallout>
            ) : null}
            {block.pattern ? (
                <GrammarCallout eyebrow={labels.pattern} variant='tip'>
                    <p className={styles.text}>{block.pattern}</p>
                </GrammarCallout>
            ) : null}
            {block.examples ? (
                <GrammarCallout eyebrow={labels.examples} variant='example'>
                    <div className={styles.stack}>
                        {block.examples.map((example, index) => (
                            <div key={index}>
                                <p className={styles.text}>{example.text}</p>
                                {example.translation ? (
                                    <p className={styles.secondary}>
                                        {example.translation}
                                    </p>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </GrammarCallout>
            ) : null}
            {block.commonMistakes ? (
                <GrammarCallout
                    eyebrow={labels.commonMistakes}
                    variant='warning'
                >
                    <div className={styles.stack}>
                        {block.commonMistakes.map((mistake, index) => (
                            <div key={index}>
                                <p className={styles.text}>
                                    <strong>{labels.incorrect}: </strong>
                                    {mistake.incorrect}
                                </p>
                                <p className={styles.text}>
                                    <strong>{labels.correct}: </strong>
                                    {mistake.correct}
                                </p>
                                {mistake.explanation ? (
                                    <p className={styles.secondary}>
                                        {mistake.explanation}
                                    </p>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </GrammarCallout>
            ) : null}
        </div>
    );
}
