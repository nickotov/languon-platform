'use client';

import { useEffect, useRef, useState } from 'react';
import { Repeat, Sparkles } from 'lucide-react';
import { Badge, Button, InlineAlert, LoadingState } from '@/fsd/shared/ui';
import type { SentenceSessionController } from '../../types';
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
}: {
    controller: SentenceSessionController;
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
    return (
        <section aria-labelledby='sentence-results-title' className='space-y-6'>
            <div>
                <p className='text-xs font-medium text-text-tertiary'>
                    {t(c.replaying ? 'Saved replay' : 'Practice round')}
                </p>
                <h2
                    ref={heading}
                    id='sentence-results-title'
                    tabIndex={-1}
                    className='mt-1 text-2xl font-semibold outline-none'
                >
                    {t(c.replaying ? 'Replay complete' : 'Round complete')}
                </h2>
            </div>
            <dl className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5'>
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
                    <div
                        key={label}
                        className='rounded-xl border border-border-default bg-background-surface p-3'
                    >
                        <dt className='text-xs text-text-secondary'>
                            {t(String(label))}
                        </dt>
                        <dd className='mt-1 text-xl font-semibold tabular-nums'>
                            {value}
                        </dd>
                    </div>
                ))}
            </dl>
            {c.counts.checked ? (
                <div>
                    <h3 className='text-xs font-medium text-text-tertiary'>
                        {t('AI ratings this round')}
                    </h3>
                    <ul className='mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4'>
                        {Object.entries(c.counts.ratings).map(
                            ([rating, count]) => (
                                <li
                                    key={rating}
                                    className='flex justify-between gap-2 rounded-lg border border-border-default p-3 text-sm'
                                >
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
                                    <strong className='tabular-nums'>
                                        {count}
                                    </strong>
                                </li>
                            ),
                        )}
                    </ul>
                </div>
            ) : (
                <p className='text-sm text-text-secondary'>
                    {t(
                        c.counts.skipped === c.counts.presented
                            ? 'Every example was skipped. The round is complete but ungraded.'
                            : 'No AI checks this round. Manual reviews are never graded.',
                    )}
                </p>
            )}
            <p className='text-xs text-text-tertiary'>
                {t(
                    'These counts describe this round, not mastery. AI checks and manual reviews are counted separately.',
                )}
            </p>
            {c.progress ? (
                <p className='text-xs text-text-tertiary'>
                    {t('Across your sessions: {seen} of {total} words seen.')
                        .replace('{seen}', String(c.progress.usedCount))
                        .replace('{total}', String(c.progress.eligibleCount))}
                    {c.progressError
                        ? ` ${t('Showing the last loaded progress.')}`
                        : ''}
                </p>
            ) : null}
            {last ? (
                <div className='rounded-xl border border-border-default bg-background-subtle p-4'>
                    <div className='flex items-center justify-between gap-2'>
                        <h3 className='text-sm font-semibold'>
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
                        <div className='mt-3 space-y-3'>
                            <p
                                lang={last.exercise.sourceLanguage}
                                dir={languageDirection(
                                    last.exercise.sourceLanguage,
                                )}
                                className='whitespace-pre-wrap break-words text-lg'
                            >
                                {last.exercise.sourceText}
                            </p>
                            {last.attempt ? (
                                <AiResultPanel attempt={last.attempt} />
                            ) : null}
                            {last.comparison ? (
                                <SentenceReferenceComparison
                                    comparison={last.comparison}
                                    exercise={last.exercise}
                                />
                            ) : last.reference ? (
                                <ReferencePanel review={last.reference} />
                            ) : null}
                            {last.skipped ? (
                                <div>
                                    <Badge size='sm'>{t('Skipped')}</Badge>
                                    <p className='mt-2 text-sm text-text-secondary'>
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
                                            className='mt-2 whitespace-pre-wrap break-words'
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
                    <ol className='mt-3 space-y-2'>
                        {c.roundItems.map((item, index) => (
                            <li
                                key={`${item.exercise.id}-${index}`}
                                className='rounded-xl border border-border-default p-3'
                            >
                                <div className='flex flex-wrap gap-2 text-xs text-text-secondary'>
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
                                    className='mt-2 break-words text-sm'
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
            <div className='grid gap-3 md:grid-cols-2'>
                <div className='rounded-xl border border-border-default p-4'>
                    <Button
                        className='w-full'
                        leadingIcon={<Repeat aria-hidden className='h-4 w-4' />}
                        loading={c.replayLoading}
                        disabled={c.busy || c.uncertain || !c.roundItems.length}
                        onClick={() => {
                            void c.repeatExact();
                        }}
                    >
                        {t('Repeat these exact examples')}
                    </Button>
                    <p className='mt-2 text-xs text-text-secondary'>
                        {t(
                            'Same examples and order, with fresh answers. Examples and hints are free; AI checks may use credits.',
                        )}
                    </p>
                </div>
                <div className='rounded-xl border border-border-default p-4'>
                    <Button
                        className='w-full'
                        variant='secondary'
                        leadingIcon={
                            <Sparkles aria-hidden className='h-4 w-4' />
                        }
                        disabled={c.busy || c.uncertain}
                        onClick={() => {
                            void c.generateNew();
                        }}
                    >
                        {t('Generate new examples')}
                    </Button>
                    <p className='mt-2 text-xs text-text-secondary'>
                        {t(
                            'Fresh examples for the same words. Requires AI and may use credits. Previous examples are kept.',
                        )}
                    </p>
                </div>
            </div>
        </section>
    );
}
