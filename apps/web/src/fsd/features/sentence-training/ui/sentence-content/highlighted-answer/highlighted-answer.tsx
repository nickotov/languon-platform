'use client';
import styles from '../../styles/sentence-content-common.module.css';
import { segmentAnswer } from '../../../lib/sentence-feedback';
import { useSentenceCopy } from '../../sentence-copy';
import type { SentenceAttempt } from '@languon/contracts';
import { languageDirection } from '../../../lib/language-direction';

/** Backend spans are grapheme-aligned UTF-16 offsets and must match their quote. */
export function HighlightedAnswer({ attempt }: { attempt: SentenceAttempt }) {
    const { t } = useSentenceCopy();
    const chunks = segmentAnswer(attempt.answer, attempt.feedback.issues);

    return (
        <p
            lang={attempt.exercise.targetLanguage}
            dir={languageDirection(attempt.exercise.targetLanguage)}
            className={styles.answerText}
        >
            {chunks.map((chunk, index) =>
                chunk.issue === null ? (
                    <span key={index}>{chunk.text}</span>
                ) : (
                    <mark key={index} className={styles.highlight}>
                        {chunk.text}
                        <sup className={styles.annotation}>
                            {chunk.issue + 1}
                            <span className={styles.visuallyHidden}>
                                {' '}
                                {t('correction')}
                            </span>
                        </sup>
                    </mark>
                ),
            )}
        </p>
    );
}
