import { useState } from 'react';
import type { LearningBlock } from '@languon/contracts';
import { Button } from '@/fsd/shared/ui/button/button';
import type { LearningBlockLabels } from '../../types';
import styles from '../block-layout.module.css';

type Vocabulary = Extract<LearningBlock, { type: 'vocabulary' }>;
function VocabularyEntry({
    entry,
    block,
    labels,
}: {
    entry: Vocabulary['entries'][number];
    block: Vocabulary;
    labels: LearningBlockLabels;
}) {
    const [revealed, setRevealed] = useState(false);
    function handleReveal() {
        setRevealed(!revealed);
    }
    const label = revealed ? labels.hideAnswer : labels.showAnswer;
    return (
        <div className={styles.panel}>
            <strong lang={block.language} dir='auto'>
                {entry.term}
            </strong>
            {entry.pronunciation ? (
                <p className={styles.secondary}>{entry.pronunciation}</p>
            ) : null}
            {entry.example ? (
                <p className={styles.text} lang={block.language} dir='auto'>
                    {entry.example}
                </p>
            ) : null}
            <div>
                <Button
                    type='button'
                    variant='secondary'
                    onClick={handleReveal}
                    aria-expanded={revealed}
                >
                    {label}
                </Button>
            </div>
            {revealed ? (
                <div lang={block.translationLanguage} dir='auto'>
                    <p className={styles.text}>{entry.translation}</p>
                    {entry.definition ? (
                        <p className={styles.text}>{entry.definition}</p>
                    ) : null}
                    {entry.exampleTranslation ? (
                        <p className={styles.secondary}>
                            {entry.exampleTranslation}
                        </p>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
export function VocabularyBlock({
    block,
    labels,
}: {
    block: Vocabulary;
    labels: LearningBlockLabels;
}) {
    return (
        <div className={styles.stack}>
            {block.entries.map((entry) => (
                <VocabularyEntry
                    key={entry.id}
                    entry={entry}
                    block={block}
                    labels={labels}
                />
            ))}
        </div>
    );
}
