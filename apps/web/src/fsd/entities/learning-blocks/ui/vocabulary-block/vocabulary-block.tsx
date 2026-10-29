import { ChevronDown } from 'lucide-react';
import type { LearningBlock } from '@languon/contracts';
import { IconButton } from '@/fsd/shared/ui/icon-button/icon-button';
import type {
    LearningBlockLabels,
    LearningBlockPlayback,
    LearningBlockVariant,
} from '../../types';
import { useBlockExpansion } from '../../hooks/use-block-expansion';
import { BlockPlayButton } from '../block-play-button/block-play-button';
import styles from './vocabulary-block.module.css';

type Vocabulary = Extract<LearningBlock, { type: 'vocabulary' }>;
interface VocabularyProps {
    block: Vocabulary;
    labels: LearningBlockLabels;
    variant?: LearningBlockVariant | undefined;
    scope?: string | undefined;
    playback?: LearningBlockPlayback | undefined;
    expandAll?: { open: boolean; at: number } | undefined;
}

function VocabularyEntry({
    entry,
    block,
    labels,
    variant,
    scope,
    playback,
    expandAll,
}: VocabularyProps & { entry: Vocabulary['entries'][number] }) {
    const disclosure = useBlockExpansion(expandAll);
    const compact = variant === 'compact';
    const review = variant === 'review';
    const expanded = compact || review || disclosure.open;
    const detailsId = `${scope ?? block.id}-${entry.id}-details`;
    const termRequest = {
        id: `${scope ?? block.id}:${entry.id}`,
        blockId: block.id,
        text: entry.term,
        language: block.language,
    };
    const exampleRequest = {
        id: `${scope ?? block.id}:${entry.id}:example`,
        blockId: block.id,
        text: entry.example ?? '',
        language: block.language,
    };
    const collapseLabel = labels.collapse ?? labels.hideAnswer;
    const expandLabel = labels.expand ?? labels.showAnswer;
    const disclosureLabel = disclosure.open ? collapseLabel : expandLabel;
    const chevronClass = disclosure.open ? styles.chevronOpen : styles.chevron;
    const rowClass = compact ? styles.compactRow : styles.row;
    return (
        <li className={rowClass}>
            <div className={styles.termRow}>
                <BlockPlayButton
                    request={termRequest}
                    playback={playback}
                    labels={labels}
                />
                <span className={styles.term} lang={block.language} dir='auto'>
                    {entry.term}
                </span>
                {!compact && entry.pronunciation ? (
                    <span className={styles.ipa}>{entry.pronunciation}</span>
                ) : null}
                {compact || review ? (
                    <span
                        className={styles.pairedTranslation}
                        lang={block.translationLanguage}
                        dir='auto'
                    >
                        {entry.translation}
                    </span>
                ) : (
                    <IconButton
                        variant='ghost'
                        size='small'
                        label={disclosureLabel}
                        aria-expanded={disclosure.open}
                        aria-controls={detailsId}
                        onClick={disclosure.toggle}
                        icon={
                            <ChevronDown size={16} className={chevronClass} />
                        }
                    />
                )}
            </div>
            {!compact && expanded ? (
                <div id={detailsId} className={styles.details}>
                    {!review ? (
                        <p
                            className={styles.translation}
                            lang={block.translationLanguage}
                            dir='auto'
                        >
                            {entry.translation}
                        </p>
                    ) : null}
                    {entry.definition ? (
                        <p className={styles.definition} dir='auto'>
                            {entry.definition}
                        </p>
                    ) : null}
                    {entry.example ? (
                        <div className={styles.exampleRow}>
                            <div className={styles.example}>
                                <p lang={block.language} dir='auto'>
                                    {entry.example}
                                </p>
                                {entry.exampleTranslation ? (
                                    <p
                                        className={styles.secondary}
                                        lang={block.translationLanguage}
                                        dir='auto'
                                    >
                                        {entry.exampleTranslation}
                                    </p>
                                ) : null}
                            </div>
                            <BlockPlayButton
                                request={exampleRequest}
                                playback={playback}
                                labels={labels}
                            />
                        </div>
                    ) : null}
                </div>
            ) : null}
        </li>
    );
}

export function VocabularyBlock(props: VocabularyProps) {
    const compact = props.variant === 'compact';
    const entries = compact
        ? props.block.entries.slice(0, 6)
        : props.block.entries;
    const more = props.block.entries.length - entries.length;
    const columns = !compact && entries.length >= 11;
    return (
        <div className={styles.container}>
            <ul className={styles.list} data-columns={columns || undefined}>
                {entries.map((entry) => (
                    <VocabularyEntry key={entry.id} {...props} entry={entry} />
                ))}
            </ul>
            {more ? <p className={styles.more}>+ {more}</p> : null}
        </div>
    );
}
