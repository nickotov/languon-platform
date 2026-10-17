import { ArrowRight, Sparkles } from 'lucide-react';
import type { ReadingSelection } from '../../types';
import { useReadingCopy } from '../../hooks/use-reading-copy';
import styles from './collect-panel.module.css';

export function SelectionContext({
    selection,
    from,
    to,
}: {
    selection: ReadingSelection;
    from: string;
    to: string;
}) {
    const t = useReadingCopy();
    const offset = selection.selection.startOffset - selection.sentenceStart;
    const language = selection.selection.side === 'source' ? from : to;
    const before = selection.sentence.slice(Math.max(0, offset - 70), offset);
    const after = selection.sentence.slice(
        offset + selection.text.length,
        offset + selection.text.length + 70,
    );

    return (
        <div className={styles.context}>
            <div className={styles.contextHeader}>
                <strong>
                    {t('texts.collect.card', { from, to })}
                    <ArrowRight size={12} aria-hidden />
                </strong>
                <span>
                    <Sparkles size={12} aria-hidden />
                    {t('texts.collect.context')}
                </span>
            </div>
            <p lang={language}>
                {before}
                <mark>{selection.text}</mark>
                {after}
            </p>
        </div>
    );
}
