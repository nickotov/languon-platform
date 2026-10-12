'use client';
import styles from './sentence-content.module.css';
import { useSentenceCopy } from '../sentence-copy';

import { useState } from 'react';
import { CheckCircle2, CircleDashed, Repeat } from 'lucide-react';
import type { SentenceAttempt, SentenceManualReview } from '@languon/contracts';
import { Badge, Button } from '@/fsd/shared/ui';

export function languageDirection(language: string) {
    return /^(ar|he|fa|ur)(-|$)/i.test(language) ? 'rtl' : 'ltr';
}

export { SentenceWithHints } from '../sentence-hints/sentence-hints';

export function segmentAnswer(
    answer: string,
    issues: SentenceAttempt['feedback']['issues'],
) {
    const valid = issues
        .map((issue, index) => ({ index, span: issue.span }))
        .filter(
            (item) =>
                item.span &&
                answer.slice(item.span.start, item.span.end) ===
                    item.span.quote,
        );
    const chunks: { text: string; issue: number | null }[] = [];
    answer.split('').forEach((point, index) => {
        const issue =
            valid.find(
                (item) =>
                    item.span &&
                    index >= item.span.start &&
                    index < item.span.end,
            )?.index ?? null;
        const last = chunks.at(-1);
        if (last && last.issue === issue) last.text += point;
        else chunks.push({ text: point, issue });
    });
    return chunks;
}

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

export function AiResultPanel({ attempt }: { attempt: SentenceAttempt }) {
    const { t, languageName } = useSentenceCopy();
    const [expanded, setExpanded] = useState(false);
    const result = attempt.feedback;
    const label = {
        perfect: t('Perfect'),
        good: t('Good'),
        'not-bad': t('Not bad'),
        'practise-again-later': t('Practise again later'),
    }[result.rating];
    let scoreTone = styles.scoreNeutral;
    let ScoreIcon = Repeat;
    if (result.percentage >= 80) {
        scoreTone = styles.scoreSuccess;
        ScoreIcon = CheckCircle2;
    } else if (result.rating === 'not-bad') {
        scoreTone = styles.scoreWarning;
        ScoreIcon = CircleDashed;
    }
    const scoreClassName = `${styles.score} ${scoreTone}`;
    return (
        <section aria-label={t('AI feedback')} className={styles.feedbackPanel}>
            <div className={styles.feedbackHeader}>
                <span className={scoreClassName}>
                    <ScoreIcon aria-hidden className={styles.icon} />
                    {result.percentage}%
                </span>
                <div>
                    <h3 className={styles.ratingTitle}>{label}</h3>
                    <p className={styles.scoreNote}>
                        {t('AI checks')} ·{' '}
                        {languageName(attempt.explanationLanguage)}
                    </p>
                </div>
                {attempt.assisted ? (
                    <Badge size='sm'>
                        {t(
                            attempt.referenceRevealed
                                ? 'Reference-assisted'
                                : 'Hint-assisted',
                        )}
                    </Badge>
                ) : null}
            </div>
            <p
                className={styles.feedbackSummary}
                lang={attempt.explanationLanguage}
                dir={languageDirection(attempt.explanationLanguage)}
            >
                {result.explanation}
            </p>
            <h4 className={styles.feedbackLabel}>{t('Your answer')}</h4>
            <HighlightedAnswer attempt={attempt} />
            {result.issues.length ? (
                <>
                    <h4 className={styles.feedbackLabel}>{t('Corrections')}</h4>
                    <ol className={styles.mistakes}>
                        {result.issues.map((issue, index) => (
                            <li key={issue.id} className={styles.mistake}>
                                <span className={styles.mistakeNumber}>
                                    {index + 1}
                                </span>
                                <div className={styles.mistakeBody}>
                                    <Badge size='sm'>{t(issue.kind)}</Badge>
                                    {issue.span ? (
                                        <p
                                            className={styles.mistakeExcerpt}
                                            lang={
                                                attempt.exercise.targetLanguage
                                            }
                                        >
                                            <s>{issue.span.quote}</s>
                                            {issue.correction !== null ? (
                                                <>
                                                    {' '}
                                                    →{' '}
                                                    <strong>
                                                        {issue.correction}
                                                    </strong>
                                                </>
                                            ) : null}
                                        </p>
                                    ) : (
                                        <p className={styles.mistakeReason}>
                                            {t('Applies to the whole answer')}
                                        </p>
                                    )}
                                    <p
                                        className={styles.mistakeExplanation}
                                        lang={attempt.explanationLanguage}
                                    >
                                        {issue.explanation}
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </>
            ) : (
                <p className={styles.noMistakes}>
                    {t('No corrections needed.')}
                </p>
            )}
            <h4 className={styles.feedbackLabel}>{t('Dictionary words')}</h4>
            <ul className={styles.dictionaryWords}>
                {result.targets.map((target) => (
                    <li key={target.entryId} className={styles.dictionaryWord}>
                        <strong
                            className={styles.wordSource}
                            lang={attempt.exercise.targetLanguage}
                        >
                            {
                                attempt.exercise.hints.find(
                                    (hint) =>
                                        hint.id ===
                                        attempt.exercise.segments.find(
                                            (segment) =>
                                                segment.target?.entryId ===
                                                target.entryId,
                                        )?.target?.hintId,
                                )?.text
                            }
                        </strong>
                        <Badge
                            size='sm'
                            tone={
                                target.status === 'used' ? 'success' : 'warning'
                            }
                        >
                            {target.status === 'used'
                                ? t('Used')
                                : t('Missing')}
                        </Badge>
                        <span
                            className={styles.wordArrow}
                            lang={attempt.explanationLanguage}
                        >
                            {target.explanation}
                        </span>
                    </li>
                ))}
            </ul>
            <Button
                className={styles.referenceAction}
                variant='secondary'
                size='compact'
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
            >
                {t('Suggested translation')} {expanded ? '↑' : '↓'}
            </Button>
            {expanded ? (
                <p
                    className={styles.feedbackNotice}
                    lang={attempt.exercise.targetLanguage}
                    dir={languageDirection(attempt.exercise.targetLanguage)}
                >
                    {result.improvedTranslation}
                </p>
            ) : null}
            <p className={styles.feedbackDisclosure}>
                {t('Hints and reference use do not reduce your AI score.')}
            </p>
        </section>
    );
}

export function ReferencePanel({ review }: { review: SentenceManualReview }) {
    const { t } = useSentenceCopy();
    const [open, setOpen] = useState(true);
    return (
        <section
            aria-label={t('Reference translation')}
            className={styles.referencePanel}
        >
            <div className={styles.referenceHeader}>
                <div className={styles.referenceHeading}>
                    <h3 className={styles.referenceTitle}>
                        {t('Reference translation')}
                    </h3>
                    <Badge size='sm'>{t('Manually reviewed')}</Badge>
                </div>
                <Button
                    variant='secondary'
                    size='compact'
                    aria-expanded={open}
                    onClick={() => setOpen(!open)}
                >
                    {open ? t('Hide') : t('Show again')}
                </Button>
            </div>
            {open ? (
                <>
                    <p
                        className={styles.referenceAnswer}
                        lang={review.exercise.targetLanguage}
                        dir={languageDirection(review.exercise.targetLanguage)}
                    >
                        {review.referenceTranslation}
                    </p>
                    <p className={styles.referenceInstructions}>
                        {t(
                            'One valid translation. Your answer may also be correct.',
                        )}
                    </p>
                </>
            ) : null}
            <p className={styles.referenceDisclaimer}>
                {t(
                    'Recorded as manually reviewed. This sentence counts as completed for Saved first. AI statistics are unchanged. Hiding this panel does not remove the review.',
                )}
            </p>
        </section>
    );
}
