'use client';
import styles from '../../styles/sentence-content-common.module.css';
import { useSentenceCopy } from '../../sentence-copy';
import { useState, type ReactNode } from 'react';
import type { SentenceManualReview } from '@languon/contracts';
import { Badge, Button } from '@/fsd/shared/ui';
import { languageDirection } from '../../../lib/language-direction';

export function ReferencePanel({
    review,
    audio,
}: {
    review: SentenceManualReview;
    audio?: ReactNode;
}) {
    const { t } = useSentenceCopy();
    const [open, setOpen] = useState(true);

    function toggleReference() {
        setOpen(!open);
    }

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
                    onClick={toggleReference}
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
                    {audio}
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
