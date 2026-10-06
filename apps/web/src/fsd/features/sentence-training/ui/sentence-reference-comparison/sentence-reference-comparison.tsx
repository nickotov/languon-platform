'use client';

import { useState } from 'react';
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
}: {
    comparison: ReferenceComparison;
    exercise: Pick<SentenceExercise, 'targetLanguage'>;
    onRecompare?: () => void;
    disabled?: boolean;
}) {
    const { t } = useSentenceCopy();
    const [open, setOpen] = useState(true);
    return (
        <section
            aria-label={t('Free comparison')}
            className='rounded-xl border border-dashed border-border-strong bg-background-subtle p-4'
        >
            <div className='flex flex-wrap items-center justify-between gap-2'>
                <div>
                    <h3 className='text-sm font-semibold'>
                        {t('Free comparison')}
                    </h3>
                    <p className='mt-1 text-xs text-text-secondary'>
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
            <p role='status' className='mt-3 text-sm font-medium'>
                {t(
                    comparison.kind === 'match'
                        ? 'Matches the saved example after normalization.'
                        : comparison.kind === 'different'
                          ? 'Different from this example. Another translation may still be valid.'
                          : 'Reference read without an answer.',
                )}
            </p>
            <p className='mt-1 text-xs text-text-secondary'>
                {t(
                    'Comparison ignores case, spacing, punctuation and apostrophe style. Accents and word order matter.',
                )}
            </p>
            {comparison.ignored.length ? (
                <details className='mt-2 text-xs text-text-secondary'>
                    <summary className='cursor-pointer'>
                        {t('Ignored differences:')}
                    </summary>
                    <ul className='mt-2 flex flex-wrap gap-2'>
                        {comparison.ignored.map((difference) => (
                            <li
                                key={difference}
                                className='rounded border border-border-default px-2 py-1'
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
                <dl className='mt-4 grid gap-3 md:grid-cols-2'>
                    <div className='min-w-0 rounded-lg border border-border-default bg-background-surface p-3'>
                        <dt className='text-xs text-text-secondary'>
                            {t('Your answer')}
                        </dt>
                        <dd
                            lang={exercise.targetLanguage}
                            dir={languageDirection(exercise.targetLanguage)}
                            className='mt-2 whitespace-pre-wrap break-words'
                        >
                            {comparison.answer || t('No answer entered.')}
                        </dd>
                    </div>
                    <div className='min-w-0 rounded-lg border border-border-default bg-background-surface p-3'>
                        <dt className='text-xs text-text-secondary'>
                            {t('Reference translation — one valid answer')}
                        </dt>
                        <dd
                            lang={exercise.targetLanguage}
                            dir={languageDirection(exercise.targetLanguage)}
                            className='mt-2 whitespace-pre-wrap break-words'
                        >
                            {comparison.reference}
                        </dd>
                    </div>
                </dl>
            ) : null}
            {onRecompare ? (
                <Button
                    className='mt-3'
                    variant='secondary'
                    size='compact'
                    onClick={onRecompare}
                    disabled={disabled}
                >
                    {t('Compare current answer again')}
                </Button>
            ) : null}
            <p className='mt-3 text-xs text-text-tertiary'>
                {t(
                    'Works without AI or credits. A match is a text comparison, not a language-quality grade.',
                )}
            </p>
        </section>
    );
}
