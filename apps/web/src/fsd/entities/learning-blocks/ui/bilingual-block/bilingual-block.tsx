import { useState, type ChangeEvent } from 'react';
import type { LearningBlock } from '@languon/contracts';
import { Button } from '@/fsd/shared/ui/button/button';
import type { LearningBlockLabels } from '../../types';
import styles from '../block-layout.module.css';

type Bilingual = Extract<LearningBlock, { type: 'bilingual-text' }>;
export function BilingualBlock({
    block,
    labels,
}: {
    block: Pick<Bilingual, 'language' | 'segments' | 'translations'>;
    labels: LearningBlockLabels;
}) {
    const [bilingual, setBilingual] = useState(false);
    const [language, setLanguage] = useState(
        block.translations[0]?.language ?? '',
    );
    const translation = block.translations.find(
        (item) => item.language === language,
    );
    const translations = new Map(
        translation?.segments.map((item) => [item.sourceSegmentId, item.text]),
    );
    function handleOriginal() {
        setBilingual(false);
    }
    function handleBilingual() {
        setBilingual(true);
    }
    function handleLanguage(event: ChangeEvent<HTMLSelectElement>) {
        setLanguage(event.target.value);
    }
    const hasTranslations = block.translations.length > 0;
    const showTranslation = bilingual && translation !== undefined;
    return (
        <div className={styles.stack}>
            <div className={styles.actions}>
                <Button
                    type='button'
                    variant='secondary'
                    aria-pressed={!bilingual}
                    onClick={handleOriginal}
                >
                    {labels.original}
                </Button>
                <Button
                    type='button'
                    variant='secondary'
                    aria-pressed={bilingual}
                    disabled={!hasTranslations}
                    onClick={handleBilingual}
                >
                    {labels.bilingual}
                </Button>
                {hasTranslations ? (
                    <label>
                        {labels.translationLanguage}{' '}
                        <select
                            className={styles.field}
                            value={language}
                            onChange={handleLanguage}
                        >
                            {block.translations.map((item) => (
                                <option
                                    key={item.language}
                                    value={item.language}
                                >
                                    {item.language}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : null}
            </div>
            {block.segments.map((segment) => (
                <div
                    className={showTranslation ? styles.pair : styles.stack}
                    key={segment.id}
                >
                    <p className={styles.text} lang={block.language} dir='auto'>
                        {segment.text}
                    </p>
                    {showTranslation ? (
                        <p
                            className={styles.secondary}
                            lang={language}
                            dir='auto'
                        >
                            {translations.get(segment.id)}
                        </p>
                    ) : null}
                </div>
            ))}
        </div>
    );
}
