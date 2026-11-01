import type { ReactNode } from 'react';
import { Scale } from 'lucide-react';
import type { SentenceExercise } from '@languon/contracts';
import type { SentenceSessionController } from '../../types';
import { ReferencePanel } from '../sentence-content/sentence-content';
import { SentenceErrorNotice } from '../sentence-errors/sentence-errors';
import { SentenceReferenceComparison } from '../sentence-reference-comparison/sentence-reference-comparison';
import { useSentenceCopy } from '../sentence-copy';
import styles from './sentence-practice-session.module.css';

export function SentencePracticeReference({
    c,
    exercise,
    innerView,
    referenceAudio,
}: {
    c: Pick<
        SentenceSessionController,
        | 'reference'
        | 'referenceError'
        | 'comparison'
        | 'referenceLoading'
        | 'busy'
        | 'uncertain'
        | 'draft'
        | 'revealReference'
        | 'recompare'
    >;
    exercise: SentenceExercise;
    innerView: boolean;
    referenceAudio: ReactNode;
}) {
    const { t } = useSentenceCopy();
    function revealReference() {
        void c.revealReference();
    }

    function recompare() {
        void c.recompare();
    }

    return (
        <>
            {!c.reference ? (
                <section className={styles.comparisonNotice}>
                    <div className={styles.comparisonHeader}>
                        <div className={styles.comparisonDescription}>
                            <h3 className={styles.comparisonTitle}>
                                <Scale aria-hidden className={styles.icon2} />
                                {t('Two ways to check')}
                            </h3>
                            <p className={styles.comparisonHint}>
                                {t(
                                    'Check with AI evaluates meaning, grammar and required words — may need credits.',
                                )}{' '}
                                {t('The free reference action needs no AI.')}
                            </p>
                            <p
                                id='practice-compare-note'
                                className={styles.comparisonHint}
                            >
                                {t(
                                    c.draft.trim()
                                        ? 'Comparison ignores case, spacing, punctuation and apostrophe style. Accents and word order matter.'
                                        : 'Reveals one saved translation. No comparison is made without an answer.',
                                )}{' '}
                                {t(
                                    'Revealing records a manual review — no grade, no credits.',
                                )}
                            </p>
                        </div>
                        {c.referenceLoading ? (
                            <p role='status' className={styles.comparisonNote}>
                                {t('Revealing…')}
                            </p>
                        ) : null}
                    </div>
                </section>
            ) : null}
            {c.referenceError ? (
                <SentenceErrorNotice
                    error={c.referenceError}
                    onRetry={revealReference}
                />
            ) : null}
            {c.comparison ? (
                <SentenceReferenceComparison
                    comparison={c.comparison}
                    audio={innerView ? null : referenceAudio}
                    exercise={exercise}
                    onRecompare={recompare}
                    disabled={
                        c.busy ||
                        c.uncertain ||
                        c.referenceLoading ||
                        !c.draft.trim()
                    }
                />
            ) : c.reference ? (
                <ReferencePanel
                    key={c.reference.id}
                    review={c.reference}
                    audio={innerView ? null : referenceAudio}
                />
            ) : null}
        </>
    );
}
