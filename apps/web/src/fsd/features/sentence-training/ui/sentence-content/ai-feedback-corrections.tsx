import type { SentenceAttempt } from '@languon/contracts';
import { Badge } from '@/fsd/shared/ui';
import { useSentenceCopy } from '../sentence-copy';
import styles from './sentence-content.module.css';

export function AiFeedbackCorrections({
    issues,
    targetLanguage,
    explanationLanguage,
}: {
    issues: SentenceAttempt['feedback']['issues'];
    targetLanguage: string;
    explanationLanguage: string;
}) {
    const { t } = useSentenceCopy();

    return (
        <>
            {issues.length ? (
                <>
                    <h4 className={styles.feedbackLabel}>{t('Corrections')}</h4>
                    <ol className={styles.mistakes}>
                        {issues.map((issue, index) => (
                            <li key={issue.id} className={styles.mistake}>
                                <span className={styles.mistakeNumber}>
                                    {index + 1}
                                </span>
                                <div className={styles.mistakeBody}>
                                    <Badge size='sm'>{t(issue.kind)}</Badge>
                                    {issue.span ? (
                                        <p
                                            className={styles.mistakeExcerpt}
                                            lang={targetLanguage}
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
                                        lang={explanationLanguage}
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
        </>
    );
}
