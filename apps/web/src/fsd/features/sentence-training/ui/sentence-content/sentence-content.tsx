'use client';
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
            className='mt-1 whitespace-pre-wrap break-words rounded-lg border border-border-default bg-background-subtle p-3 text-base leading-relaxed'
        >
            {chunks.map((chunk, index) =>
                chunk.issue === null ? (
                    <span key={index}>{chunk.text}</span>
                ) : (
                    <mark
                        key={index}
                        className='rounded-sm bg-warning-subtle text-text-primary underline decoration-warning-default decoration-wavy underline-offset-4'
                    >
                        {chunk.text}
                        <sup className='ms-0.5 text-xs font-semibold'>
                            {chunk.issue + 1}
                            <span className='sr-only'> {t('correction')}</span>
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
    return (
        <section
            aria-label={t('AI feedback')}
            className='rounded-xl border border-border-default bg-background-surface p-4'
        >
            <div className='flex flex-wrap items-center gap-3'>
                <span
                    className={`inline-flex items-center gap-2 rounded-xl border-2 px-3 py-1.5 text-xl font-semibold tabular-nums ${result.percentage >= 80 ? 'border-success-default text-success-default' : result.rating === 'not-bad' ? 'border-warning-default text-warning-default' : 'border-border-strong text-text-secondary'}`}
                >
                    {result.percentage >= 80 ? (
                        <CheckCircle2 aria-hidden className='h-5 w-5' />
                    ) : result.rating === 'not-bad' ? (
                        <CircleDashed aria-hidden className='h-5 w-5' />
                    ) : (
                        <Repeat aria-hidden className='h-5 w-5' />
                    )}
                    {result.percentage}%
                </span>
                <div>
                    <h3 className='font-semibold'>{label}</h3>
                    <p className='text-xs text-text-tertiary'>
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
                className='mt-3 text-sm leading-relaxed text-text-primary'
                lang={attempt.explanationLanguage}
                dir={languageDirection(attempt.explanationLanguage)}
            >
                {result.explanation}
            </p>
            <h4 className='mt-4 text-xs uppercase tracking-wide text-text-tertiary'>
                {t('Your answer')}
            </h4>
            <HighlightedAnswer attempt={attempt} />
            {result.issues.length ? (
                <>
                    <h4 className='mt-4 text-xs uppercase tracking-wide text-text-tertiary'>
                        {t('Corrections')}
                    </h4>
                    <ol className='mt-2 space-y-2'>
                        {result.issues.map((issue, index) => (
                            <li
                                key={issue.id}
                                className='flex gap-2 rounded-lg border border-border-default p-2.5 text-sm'
                            >
                                <span className='inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-background-subtle text-xs font-semibold text-text-primary'>
                                    {index + 1}
                                </span>
                                <div className='min-w-0 break-words'>
                                    <Badge size='sm'>{t(issue.kind)}</Badge>
                                    {issue.span ? (
                                        <p
                                            className='mt-1'
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
                                        <p className='mt-1 text-xs text-text-tertiary'>
                                            {t('Applies to the whole answer')}
                                        </p>
                                    )}
                                    <p
                                        className='mt-1 text-text-secondary'
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
                <p className='mt-4 text-sm text-text-secondary'>
                    {t('No corrections needed.')}
                </p>
            )}
            <h4 className='mt-4 text-xs uppercase tracking-wide text-text-tertiary'>
                {t('Dictionary words')}
            </h4>
            <ul className='mt-2 flex flex-wrap gap-2'>
                {result.targets.map((target) => (
                    <li
                        key={target.entryId}
                        className='rounded-lg border border-border-default px-2 py-1 text-sm'
                    >
                        <strong
                            className='me-2'
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
                            className='ms-2'
                            lang={attempt.explanationLanguage}
                        >
                            {target.explanation}
                        </span>
                    </li>
                ))}
            </ul>
            <Button
                className='mt-4'
                variant='secondary'
                size='compact'
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
            >
                {t('Suggested translation')} {expanded ? '↑' : '↓'}
            </Button>
            {expanded ? (
                <p
                    className='mt-3 text-base'
                    lang={attempt.exercise.targetLanguage}
                    dir={languageDirection(attempt.exercise.targetLanguage)}
                >
                    {result.improvedTranslation}
                </p>
            ) : null}
            <p className='mt-4 text-xs text-text-tertiary'>
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
            className='rounded-xl border border-dashed border-border-strong bg-background-subtle p-4'
        >
            <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='flex items-center gap-2'>
                    <h3 className='text-sm font-semibold'>
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
                        className='mt-3 break-words text-lg leading-relaxed'
                        lang={review.exercise.targetLanguage}
                        dir={languageDirection(review.exercise.targetLanguage)}
                    >
                        {review.referenceTranslation}
                    </p>
                    <p className='mt-2 text-sm text-text-secondary'>
                        {t(
                            'One valid translation. Your answer may also be correct.',
                        )}
                    </p>
                </>
            ) : null}
            <p className='mt-3 text-xs text-text-tertiary'>
                {t(
                    'Recorded as manually reviewed. This sentence counts as completed for Saved first. AI statistics are unchanged. Hiding this panel does not remove the review.',
                )}
            </p>
        </section>
    );
}
