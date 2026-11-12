'use client';
import styles from '../../styles/sentence-content-common.module.css';
import { dictionaryTargetText } from '../../../lib/sentence-feedback';
import { AiFeedbackCorrections } from '../ai-feedback-corrections';
import { useSentenceCopy } from '../../sentence-copy';
import { useState, type ReactNode } from 'react';
import { CheckCircle2, CircleDashed, Repeat } from 'lucide-react';
import type { SentenceAttempt } from '@languon/contracts';
import { Badge, Button } from '@/fsd/shared/ui';
import { HighlightedAnswer } from '../highlighted-answer/highlighted-answer';
import { languageDirection } from '../../../lib/language-direction';

export function AiResultPanel({
    attempt,
    audio,
}: {
    attempt: SentenceAttempt;
    audio?: ReactNode;
}) {
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

    function toggleTranslation() {
        setExpanded(!expanded);
    }

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
            {audio}
            <AiFeedbackCorrections
                issues={result.issues}
                targetLanguage={attempt.exercise.targetLanguage}
                explanationLanguage={attempt.explanationLanguage}
            />
            <h4 className={styles.feedbackLabel}>{t('Dictionary words')}</h4>
            <ul className={styles.dictionaryWords}>
                {result.targets.map((target) => (
                    <li key={target.entryId} className={styles.dictionaryWord}>
                        <strong
                            className={styles.wordSource}
                            lang={attempt.exercise.targetLanguage}
                        >
                            {dictionaryTargetText(attempt, target.entryId)}
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
                onClick={toggleTranslation}
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
