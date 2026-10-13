'use client';
import styles from './sentence-reference-comparison.module.css';

import { useState, type ReactNode } from 'react';
import type { SentenceExercise } from '@languon/contracts';
import { Button } from '@/fsd/shared/ui';
import type { ReferenceComparison } from '../../types';
import { languageDirection } from '../sentence-content/sentence-content';
import { useSentenceCopy } from '../sentence-copy';

export function SentenceReferenceComparison({
    comparison,
    exercise,
    onRecompare,
    disabled = false,
    audio,
}: {
    comparison: ReferenceComparison;
    exercise: Pick<SentenceExercise, 'targetLanguage'>;
    onRecompare?: () => void;
    disabled?: boolean;
    audio?: ReactNode;
}) {
    const { t } = useSentenceCopy();
    const [open, setOpen] = useState(true);
    return (
        <section
            aria-label={t('Free comparison')}
            className={styles.comparison}
        >
            <div className={styles.header}>
                <div>
                    <h3 className={styles.title}>{t('Free comparison')}</h3>
                    <p className={styles.subtitle}>
                        {t('Manually reviewed')} · {t('No AI score')}
                    </p>
                </div>
                <Button
                    variant='ghost'
                    size='compact'
                    aria-expanded={open}
                    onClick={() => setOpen((value) => !value)}
                >
                    {t(open ? 'Hide reference' : 'Show reference')}
                </Button>
            </div>
            <p role='status' className={styles.status}>
                {t(
                    comparison.kind === 'match'
                        ? 'Matches the saved example after normalization.'
                        : comparison.kind === 'different'
                          ? 'Different from this example. Another translation may still be valid.'
                          : 'Reference read without an answer.',
                )}
            </p>
            <p className={styles.subtitle}>
                {t(
                    'Comparison ignores case, spacing, punctuation and apostrophe style. Accents and word order matter.',
                )}
            </p>
            {comparison.ignored.length ? (
                <details className={styles.normalization}>
                    <summary className={styles.normalizationAction}>
                        {t('Ignored differences:')}
                    </summary>
                    <ul className={styles.normalizationList}>
                        {comparison.ignored.map((difference) => (
                            <li
                                key={difference}
                                className={styles.normalizationItem}
                            >
                                {t(
                                    {
                                        unicode: 'Unicode form',
                                        apostrophes: 'Apostrophe style',
                                        case: 'Case',
                                        punctuation: 'Punctuation',
                                        spaces: 'Spacing',
                                    }[difference],
                                )}
                            </li>
                        ))}
                    </ul>
                </details>
            ) : null}
            {open ? (
                <dl className={styles.answers}>
                    <div className={styles.answer}>
                        <dt className={styles.answerLabel}>
                            {t('Your answer')}
                        </dt>
                        <dd
                            lang={exercise.targetLanguage}
                            dir={languageDirection(exercise.targetLanguage)}
                            className={styles.answerValue}
                        >
                            {comparison.answer || t('No answer entered.')}
                        </dd>
                    </div>
                    <div className={styles.answer}>
                        <dt className={styles.answerLabel}>
                            {t('Reference translation — one valid answer')}
                        </dt>
                        <dd
                            lang={exercise.targetLanguage}
                            dir={languageDirection(exercise.targetLanguage)}
                            className={styles.answerValue}
                        >
                            {comparison.reference}
                            {audio}
                        </dd>
                    </div>
                </dl>
            ) : null}
            {onRecompare ? (
                <Button
                    className={styles.reviewAction}
                    variant='secondary'
                    size='compact'
                    onClick={onRecompare}
                    disabled={disabled}
                >
                    {t('Compare current answer again')}
                </Button>
            ) : null}
            <p className={styles.statusNote}>
                {t(
                    'Works without AI or credits. A match is a text comparison, not a language-quality grade.',
                )}
            </p>
        </section>
    );
}
