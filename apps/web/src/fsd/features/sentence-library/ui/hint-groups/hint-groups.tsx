import React from 'react';
import componentStyles from './hint-groups.module.css';
import {
    ArrowRightIcon,
    BookOpenIcon,
    InfoIcon,
    LightbulbIcon,
} from 'lucide-react';
import { Badge } from '@/fsd/shared/ui';
import { useInterfaceText } from '../../hooks/use-interface-text';
import type { LibraryHint, SavedSentence } from '../../types';

/** Dictionary words and other useful help, as two equal-weight groups. Phrases stay whole. */
export function HintGroups({ sentence }: { sentence: SavedSentence }) {
    const { L } = useInterfaceText();
    return (
        <div className={componentStyles.root}>
            <section
                aria-labelledby={`${sentence.id}-dict`}
                className={componentStyles.group}
            >
                <h3
                    id={`${sentence.id}-dict`}
                    className={componentStyles.heading}
                >
                    <BookOpenIcon
                        aria-hidden
                        className={componentStyles.headingIcon}
                    />
                    {L('dictWords')}
                    <span className={componentStyles.count}>
                        {sentence.dictionaryHints.length}
                    </span>
                </h3>
                <HintList
                    hints={sentence.dictionaryHints}
                    sentence={sentence}
                />
            </section>

            <section
                aria-labelledby={`${sentence.id}-ctx`}
                className={componentStyles.group}
            >
                <h3
                    id={`${sentence.id}-ctx`}
                    className={componentStyles.heading}
                >
                    <LightbulbIcon
                        aria-hidden
                        className={componentStyles.headingIcon}
                    />
                    {L('otherWords')}
                    <span className={componentStyles.count}>
                        {sentence.contextHints.length}
                    </span>
                </h3>
                {sentence.contextHints.length ? (
                    <HintList
                        hints={sentence.contextHints}
                        sentence={sentence}
                    />
                ) : (
                    <p className={componentStyles.warning}>
                        <InfoIcon
                            aria-hidden
                            className={componentStyles.warningIcon}
                        />
                        {L('noExtraHints')}
                    </p>
                )}
            </section>
        </div>
    );
}

function HintList({
    hints,
    sentence,
}: {
    hints: LibraryHint[];
    sentence: SavedSentence;
}) {
    const { L } = useInterfaceText();
    return (
        <ul className={componentStyles.hints}>
            {hints.map((hint) => (
                <li key={hint.id} className={componentStyles.hint}>
                    <div className={componentStyles.hintWords}>
                        <span
                            lang={sentence.sentenceLanguage}
                            dir='auto'
                            className={componentStyles.sourceWord}
                        >
                            {hint.source}
                        </span>
                        <ArrowRightIcon
                            aria-hidden
                            className={componentStyles.directionIcon}
                        />
                        <span className={componentStyles.directionLabel}>
                            →
                        </span>
                        <span
                            lang={sentence.answerLanguage}
                            dir='auto'
                            className={componentStyles.translatedWord}
                        >
                            {hint.target}
                        </span>
                        {hint.kind === 'phrase' ? (
                            <Badge size='sm' tone='neutral'>
                                {L('expression')}
                            </Badge>
                        ) : null}
                    </div>
                    {hint.note ? (
                        <p
                            lang={sentence.sentenceLanguage}
                            className={componentStyles.explanation}
                        >
                            — {hint.note}
                        </p>
                    ) : null}
                </li>
            ))}
        </ul>
    );
}
