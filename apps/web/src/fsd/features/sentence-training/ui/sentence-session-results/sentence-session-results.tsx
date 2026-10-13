'use client';
import styles from './sentence-session-results.module.css';

import { useEffect, useRef, useState } from 'react';
import { Repeat, Sparkles } from 'lucide-react';
import { Badge, Button, InlineAlert, LoadingState } from '@/fsd/shared/ui';
import type {
    SentenceSessionController,
    SentenceAudioRenderer,
} from '../../types';
import {
    AiResultPanel,
    languageDirection,
    ReferencePanel,
} from '../sentence-content/sentence-content';
import { SentenceJobStatus } from '../sentence-job-status/sentence-job-status';
import { SentenceReferenceComparison } from '../sentence-reference-comparison/sentence-reference-comparison';
import { SentenceErrorNotice } from '../sentence-errors/sentence-errors';
import { useSentenceCopy } from '../sentence-copy';

export function SentenceSessionResults({
    controller: c,
    renderAudio,
}: {
    controller: SentenceSessionController;
    renderAudio?: SentenceAudioRenderer | undefined;
}) {
    const { t } = useSentenceCopy();
    const heading = useRef<HTMLHeadingElement>(null);
    const [all, setAll] = useState(false);
    const [details, setDetails] = useState(true);
    useEffect(() => {
        heading.current?.focus();
    }, []);
    function cancelRequest() {
        void c.cancel();
    }
    const last = c.roundItems.at(-1);
    const promptAudio =
        last && c.sessionId
            ? renderAudio?.({
                  kind: 'prompt',
                  id: last.exercise.id,
                  sessionId: c.sessionId,
              })
            : null;
    const referenceAudio =
        last && c.sessionId
            ? renderAudio?.({
                  kind: 'reference',
                  id: last.exercise.id,
                  sessionId: c.sessionId,
              })
            : null;
    const answerAudio = last?.attempt
        ? renderAudio?.({ kind: 'checked-answer', id: last.attempt.id })
        : null;
    return (
        <section
            aria-labelledby='sentence-results-title'
            className={styles.results}
        >
            <div>
                <p className={styles.summaryNote}>
                    {t(c.replaying ? 'Saved replay' : 'Practice round')}
                </p>
                <h2
                    ref={heading}
                    id='sentence-results-title'
                    tabIndex={-1}
                    className={styles.title}
                >
                    {t(c.replaying ? 'Replay complete' : 'Round complete')}
                </h2>
            </div>
            <dl className={styles.metrics}>
                {[
                    ['Examples presented', c.counts.presented],
                    [
                        'Selected words seen',
                        `${c.roundEntryCount} / ${c.roundEligibleCount ?? c.roundEntryCount}`,
                    ],
                    ['AI checked', c.counts.checked],
                    ['Manually reviewed', c.counts.manuallyReviewed],
                    ['Skipped', c.counts.skipped],
                ].map(([label, value]) => (
                    <div key={label} className={styles.metric}>
                        <dt className={styles.metricLabel}>
                            {t(String(label))}
                        </dt>
                        <dd className={styles.metricValue}>{value}</dd>
                    </div>
                ))}
            </dl>
            {c.counts.checked ? (
                <div>
                    <h3 className={styles.summaryNote}>
                        {t('AI ratings this round')}
                    </h3>
                    <ul className={styles.ratingList}>
                        {Object.entries(c.counts.ratings).map(
                            ([rating, count]) => (
                                <li key={rating} className={styles.ratingItem}>
                                    <span>
                                        {t(
                                            {
                                                perfect: 'Perfect',
                                                good: 'Good',
                                                notBad: 'Not bad',
                                                practiseAgainLater:
                                                    'Practise again later',
                                            }[
                                                rating as keyof typeof c.counts.ratings
                                            ],
                                        )}
                                    </span>
                                    <strong className={styles.ratingCount}>
                                        {count}
                                    </strong>
                                </li>
                            ),
                        )}
                    </ul>
                </div>
            ) : (
                <p className={styles.privacyNote}>
                    {t(
                        c.counts.skipped === c.counts.presented
                            ? 'Every example was skipped. The round is complete but ungraded.'
                            : 'No AI checks this round. Manual reviews are never graded.',
                    )}
                </p>
            )}
            <p className={styles.historyNote}>
                {t(
                    'These counts describe this round, not mastery. AI checks and manual reviews are counted separately.',
                )}
            </p>
            {c.progress ? (
                <p className={styles.historyNote}>
                    {t('Across your sessions: {seen} of {total} words seen.')
                        .replace('{seen}', String(c.progress.usedCount))
                        .replace('{total}', String(c.progress.eligibleCount))}
                    {c.progressError
                        ? ` ${t('Showing the last loaded progress.')}`
                        : ''}
                </p>
            ) : null}
            {last ? (
                <div className={styles.reviewPanel}>
                    <div className={styles.reviewHeader}>
                        <h3 className={styles.summaryTitle}>
                            {t('Last example')}
                        </h3>
                        <Button
                            size='compact'
                            variant='ghost'
                            aria-expanded={details}
                            onClick={() => setDetails((value) => !value)}
                        >
                            {t(details ? 'Hide details' : 'Show details')}
                        </Button>
                    </div>
                    {details ? (
                        <div className={styles.reviewContent}>
                            <p
                                lang={last.exercise.sourceLanguage}
                                dir={languageDirection(
                                    last.exercise.sourceLanguage,
                                )}
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
                            {last.comparison ? (
                                <SentenceReferenceComparison
                                    audio={referenceAudio}
                                    comparison={last.comparison}
                                    exercise={last.exercise}
                                />
                            ) : last.reference ? (
                                <ReferencePanel
                                    review={last.reference}
                                    audio={referenceAudio}
                                />
                            ) : null}
                            {last.skipped ? (
                                <div>
                                    <Badge size='sm'>{t('Skipped')}</Badge>
                                    <p className={styles.reviewNote}>
                                        {t(
                                            'Skipped — no AI check or manual review.',
                                        )}
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
            ) : null}
            <div>
                <Button
                    variant='secondary'
                    size='compact'
                    aria-expanded={all}
                    onClick={() => setAll((value) => !value)}
                >
                    {t('This round’s examples')} ({c.roundItems.length})
                </Button>
                {all ? (
                    <ol className={styles.answerList}>
                        {c.roundItems.map((item, index) => (
                            <li
                                key={`${item.exercise.id}-${index}`}
                                className={styles.answerItem}
                            >
                                <div className={styles.answerMetadata}>
                                    <span>{index + 1}</span>
                                    {item.attempt ? (
                                        <span>
                                            {t('AI checked')} ·{' '}
                                            {item.attempt.feedback.percentage}%
                                        </span>
                                    ) : null}
                                    {item.reference ? (
                                        <span>{t('Manually reviewed')}</span>
                                    ) : null}
                                    {item.skipped ? (
                                        <span>{t('Skipped')}</span>
                                    ) : null}
                                </div>
                                <p
                                    lang={item.exercise.sourceLanguage}
                                    dir={languageDirection(
                                        item.exercise.sourceLanguage,
                                    )}
                                    className={styles.answerText}
                                >
                                    {item.exercise.sourceText}
                                </p>
                            </li>
                        ))}
                    </ol>
                ) : null}
            </div>
            {c.replayLoading ? (
                <LoadingState>{t('Loading sentence')}</LoadingState>
            ) : null}
            <SentenceJobStatus job={c.job} onCancel={cancelRequest} />
            {c.uncertain ? (
                <InlineAlert tone='warning'>
                    {t(
                        'The task may still be running. Recover its result before submitting again.',
                    )}
                </InlineAlert>
            ) : null}
            {c.replayError ? (
                <SentenceErrorNotice error={c.replayError} />
            ) : null}
            {c.error ? (
                <SentenceErrorNotice
                    error={c.error}
                    onRetry={
                        c.canRetry
                            ? () => {
                                  void c.retry();
                              }
                            : undefined
                    }
                />
            ) : null}
            <div className={styles.nextActions}>
                <div className={styles.nextAction}>
                    <Button
                        className={styles.nextButton}
                        leadingIcon={
                            <Repeat aria-hidden className={styles.icon} />
                        }
                        loading={c.replayLoading}
                        disabled={c.busy || c.uncertain || !c.roundItems.length}
                        onClick={() => {
                            void c.repeatExact();
                        }}
                    >
                        {t('Repeat these exact examples')}
                    </Button>
                    <p className={styles.nextNote}>
                        {t(
                            'Same examples and order, with fresh answers. Examples and hints are free; AI checks may use credits.',
                        )}
                    </p>
                </div>
                <div className={styles.nextAction}>
                    <Button
                        className={styles.nextButton}
                        variant='secondary'
                        leadingIcon={
                            <Sparkles aria-hidden className={styles.icon} />
                        }
                        disabled={c.busy || c.uncertain}
                        onClick={() => {
                            void c.generateNew();
                        }}
                    >
                        {t('Generate new examples')}
                    </Button>
                    <p className={styles.nextNote}>
                        {t(
                            'Fresh examples for the same words. Requires AI and may use credits. Previous examples are kept.',
                        )}
                    </p>
                </div>
            </div>
        </section>
    );
}
