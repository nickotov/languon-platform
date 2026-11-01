import type { ReactNode } from 'react';
import { Badge, Button } from '@/fsd/shared/ui';
import type { SentenceSessionController } from '../../types';
import {
    AiResultPanel,
    ReferencePanel,
    languageDirection,
} from '../sentence-content/sentence-content';
import { SentenceReferenceComparison } from '../sentence-reference-comparison/sentence-reference-comparison';
import { useSentenceCopy } from '../sentence-copy';
import styles from './sentence-session-results.module.css';

export function LastSentenceReview({
    last,
    details,
    onToggleDetails,
    promptAudio,
    referenceAudio,
    answerAudio,
}: {
    last: SentenceSessionController['roundItems'][number];
    details: boolean;
    onToggleDetails(): void;
    promptAudio: ReactNode;
    referenceAudio: ReactNode;
    answerAudio: ReactNode;
}) {
    const { t } = useSentenceCopy();
    let reference: ReactNode = null;
    if (last.comparison) {
        reference = (
            <SentenceReferenceComparison
                audio={referenceAudio}
                comparison={last.comparison}
                exercise={last.exercise}
            />
        );
    } else if (last.reference) {
        reference = (
            <ReferencePanel review={last.reference} audio={referenceAudio} />
        );
    }

    return (
        <div className={styles.reviewPanel}>
            <div className={styles.reviewHeader}>
                <h3 className={styles.summaryTitle}>{t('Last example')}</h3>
                <Button
                    size='compact'
                    variant='ghost'
                    aria-expanded={details}
                    onClick={onToggleDetails}
                >
                    {t(details ? 'Hide details' : 'Show details')}
                </Button>
            </div>
            {details ? (
                <div className={styles.reviewContent}>
                    <p
                        lang={last.exercise.sourceLanguage}
                        dir={languageDirection(last.exercise.sourceLanguage)}
                        className={styles.reviewSentence}
                    >
                        {last.exercise.sourceText}
                    </p>
                    {promptAudio}
                    {last.attempt ? (
                        <AiResultPanel
                            attempt={last.attempt}
                            audio={answerAudio}
                        />
                    ) : null}
                    {reference}
                    {last.skipped ? (
                        <div>
                            <Badge size='sm'>{t('Skipped')}</Badge>
                            <p className={styles.reviewNote}>
                                {t('Skipped — no AI check or manual review.')}
                            </p>
                            {last.answer ? (
                                <p
                                    lang={last.exercise.targetLanguage}
                                    dir={languageDirection(
                                        last.exercise.targetLanguage,
                                    )}
                                    className={styles.reviewAnswer}
                                >
                                    {last.answer}
                                </p>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
