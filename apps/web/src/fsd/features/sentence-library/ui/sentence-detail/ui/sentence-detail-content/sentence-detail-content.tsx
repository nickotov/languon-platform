import type { ReactNode } from 'react';
import { ChevronUpIcon, ChevronDownIcon } from 'lucide-react';
import { useInterfaceText } from '../../../../hooks/use-interface-text';
import type { SavedSentence } from '../../../../types';
import {
    DirectionBadge,
    OwnershipMeta,
    StatusBadges,
} from '../../../sentence-badges';
import { HintGroups } from '../../../hint-groups/hint-groups';
import { SentenceStatus } from '../sentence-status/sentence-status';
import styles from '../../../styles/sentence-detail-common.module.css';

export function SentenceDetailContent({
    sentence,
    id,
    expanded,
    onToggle,
    onArchive,
    locked,
    renderAudio,
}: {
    sentence: SavedSentence;
    id: string;
    expanded: boolean;
    onToggle(): void;
    onArchive(): void;
    locked: boolean;
    renderAudio:
        | ((exerciseId: string, field: 'prompt' | 'reference') => ReactNode)
        | undefined;
}) {
    const { L, lang } = useInterfaceText();

    return (
        <div className={styles.content}>
            <section
                aria-label={L('sentenceLabel')}
                className={styles.sentenceSection}
            >
                <p
                    lang={sentence.sentenceLanguage}
                    dir='auto'
                    className={styles.sentence}
                >
                    {sentence.sentence}
                </p>
                {renderAudio?.(id, 'prompt')}
                <p className={styles.help}>
                    {L('langLine', {
                        from: lang(sentence.sentenceLanguage),
                        to: lang(sentence.answerLanguage),
                    })}
                </p>
                <div className={styles.metadata}>
                    <DirectionBadge
                        from={sentence.sentenceLanguage}
                        to={sentence.answerLanguage}
                    />
                    <StatusBadges sentence={sentence} />
                </div>
                <OwnershipMeta sentence={sentence} />
            </section>
            <section className={styles.translationSection}>
                <button
                    type='button'
                    aria-expanded={expanded}
                    aria-controls={`${id}-reference`}
                    onClick={onToggle}
                    className={styles.translationToggle}
                >
                    {L('referenceToggle')}
                    {expanded ? (
                        <ChevronUpIcon aria-hidden className={styles.icon} />
                    ) : (
                        <ChevronDownIcon aria-hidden className={styles.icon} />
                    )}
                </button>
                {expanded ? (
                    <div
                        id={`${id}-reference`}
                        className={styles.translationContent}
                    >
                        <p
                            lang={sentence.answerLanguage}
                            dir='auto'
                            className={styles.translation}
                        >
                            {sentence.reference}
                        </p>
                        {renderAudio?.(id, 'reference')}
                        <p className={styles.secondaryHelp}>
                            {L('referenceNote')}
                        </p>
                    </div>
                ) : null}
            </section>
            <HintGroups sentence={sentence} />
            <SentenceStatus
                sentence={sentence}
                locked={locked}
                onArchive={onArchive}
            />
        </div>
    );
}
