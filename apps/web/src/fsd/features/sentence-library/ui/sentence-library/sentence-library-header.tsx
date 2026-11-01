import type { ReactNode } from 'react';
import {
    ArrowRightIcon,
    MessageSquareTextIcon,
    SparklesIcon,
} from 'lucide-react';
import { Button, Card } from '@/fsd/shared/ui';
import { useInterfaceText } from '../../hooks/use-interface-text';
import type { LibraryDictionary } from '../../types';
import componentStyles from './sentence-library.module.css';

export function SentenceLibraryHeader({
    dictionary,
    preparationChip,
    onPractice,
    onPrepare,
}: {
    dictionary: LibraryDictionary;
    preparationChip: ReactNode;
    onPractice(): void;
    onPrepare(): void;
}) {
    const { L, lang } = useInterfaceText();

    return (
        <Card
            variant='outlined'
            padding='none'
            className={componentStyles.header}
        >
            <div className={componentStyles.headerLayout}>
                <div className={componentStyles.headingGroup}>
                    <h1 className={componentStyles.heading}>
                        <MessageSquareTextIcon
                            aria-hidden
                            className={componentStyles.headingIcon}
                        />
                        {L('title')}
                    </h1>
                    <div className={componentStyles.metadata}>
                        <span className={componentStyles.dictionaryName}>
                            {dictionary.name}
                        </span>
                        <span className={componentStyles.languagePair}>
                            <span>{lang(dictionary.sourceLanguage)}</span>
                            <ArrowRightIcon
                                aria-hidden
                                className={componentStyles.languageIcon}
                            />
                            <span>{lang(dictionary.targetLanguage)}</span>
                        </span>
                    </div>
                    <p className={componentStyles.description}>{L('intro')}</p>
                    {preparationChip ? (
                        <div className={componentStyles.ownership}>
                            {preparationChip}
                        </div>
                    ) : null}
                </div>
                <div className={componentStyles.actions}>
                    <Button
                        trailingIcon={
                            <ArrowRightIcon
                                aria-hidden
                                className={componentStyles.backIcon}
                            />
                        }
                        onClick={onPractice}
                    >
                        {L('startPractice')}
                    </Button>
                    <div className={componentStyles.generationControl}>
                        <Button
                            variant='secondary'
                            leadingIcon={
                                <SparklesIcon
                                    aria-hidden
                                    className={componentStyles.icon}
                                />
                            }
                            onClick={onPrepare}
                        >
                            {L('prepareAhead')}
                        </Button>
                        <span className={componentStyles.generationHelp}>
                            {L('prepareAheadHint')}
                        </span>
                    </div>
                </div>
            </div>
        </Card>
    );
}
