import type { LearningBlock } from '@languon/contracts';
import type { LearningBlockLabels } from '../../types';
import styles from './bilingual-block.module.css';

type Bilingual = Extract<LearningBlock, { type: 'bilingual-text' }>;
export function BilingualPreview({
    block,
    labels,
    compact,
}: {
    block: Pick<Bilingual, 'language' | 'segments' | 'translations'>;
    labels: LearningBlockLabels;
    compact: boolean;
}) {
    const rows = compact ? block.segments.slice(0, 2) : block.segments;
    const previewTranslations = compact
        ? block.translations.slice(0, 1)
        : block.translations;
    const hasTranslations = block.translations.length > 0;
    const more = block.segments.length - rows.length;
    return (
        <div className={styles.root}>
            {hasTranslations ? (
                <p className={styles.prepared}>
                    {labels.preparedTranslations ?? labels.translationLanguage}:{' '}
                    {previewTranslations
                        .map((item) => item.language)
                        .join(', ')}
                </p>
            ) : null}
            <ol className={styles.previewList}>
                {rows.map((segment) => (
                    <li key={segment.id} className={styles.previewRow}>
                        <p lang={block.language} dir='auto'>
                            {segment.text}
                        </p>
                        {previewTranslations.map((item) => (
                            <p
                                key={item.language}
                                className={styles.translation}
                                lang={item.language}
                                dir='auto'
                            >
                                {!compact ? (
                                    <span className={styles.languageTag}>
                                        {item.language}{' '}
                                    </span>
                                ) : null}
                                {
                                    item.segments.find(
                                        (s) => s.sourceSegmentId === segment.id,
                                    )?.text
                                }
                            </p>
                        ))}
                    </li>
                ))}
            </ol>
            {more ? <p className={styles.prepared}>+ {more}</p> : null}
        </div>
    );
}
