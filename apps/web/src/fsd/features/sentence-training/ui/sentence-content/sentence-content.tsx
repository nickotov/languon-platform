'use client';
import { useSentenceCopy } from '../sentence-copy';

import { useEffect, useId, useRef, useState } from 'react';
import type {
    SentenceAttempt,
    SentenceExercise,
    SentenceManualReview,
} from '@languon/contracts';
import { Badge, Button } from '@/fsd/shared/ui';

export function languageDirection(language: string) {
    return /^(ar|he|fa|ur)(-|$)/i.test(language) ? 'rtl' : 'ltr';
}

export function SentenceWithHints({
    exercise,
    revealedHintIds,
    onReveal,
}: {
    exercise: SentenceExercise;
    revealedHintIds: string[];
    onReveal(id: string): void;
}) {
    const { t } = useSentenceCopy();
    return (
        <div>
            <p
                lang={exercise.sourceLanguage}
                dir={languageDirection(exercise.sourceLanguage)}
                className='whitespace-pre-wrap break-words text-2xl font-medium leading-relaxed text-text-primary md:text-[1.75rem]'
            >
                {exercise.segments.map((segment) => {
                    const hint = exercise.hints.find(
                        (item) => item.id === segment.target?.hintId,
                    );
                    if (!hint)
                        return <span key={segment.id}>{segment.text}</span>;
                    return (
                        <HintWord
                            key={segment.id}
                            text={segment.text}
                            hint={hint.text}
                            language={exercise.targetLanguage}
                            revealed={revealedHintIds.includes(hint.id)}
                            onReveal={() => onReveal(hint.id)}
                        />
                    );
                })}
            </p>
            <div className='mt-4 flex flex-wrap gap-2 text-sm text-text-secondary'>
                <span>
                    {revealedHintIds.length
                        ? t('Hints shown:')
                        : `${exercise.hints.length} ${t('words have hints — select an underlined word.')}`}
                </span>
                {exercise.hints
                    .filter((hint) => revealedHintIds.includes(hint.id))
                    .map((hint) => (
                        <Badge key={hint.id} size='sm'>
                            <span lang={exercise.targetLanguage}>
                                {hint.text}
                            </span>
                        </Badge>
                    ))}
            </div>
        </div>
    );
}

function HintWord({
    text,
    hint,
    language,
    revealed,
    onReveal,
}: {
    text: string;
    hint: string;
    language: string;
    revealed: boolean;
    onReveal(): void;
}) {
    const { t, languageName } = useSentenceCopy();
    const [open, setOpen] = useState(false);
    const [shift, setShift] = useState({ x: 0, y: 0 });
    const root = useRef<HTMLSpanElement>(null);
    const panel = useRef<HTMLSpanElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const id = useId();
    useEffect(() => {
        if (!open) return;
        const pointer = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        };
        const position = () => {
            const rect = panel.current?.getBoundingClientRect();
            if (rect)
                setShift((previous) => ({
                    x:
                        previous.x +
                        Math.max(0, 12 - rect.left) -
                        Math.max(0, rect.right - window.innerWidth + 12),
                    y:
                        previous.y +
                        Math.max(0, 12 - rect.top) -
                        Math.max(0, rect.bottom - window.innerHeight + 12),
                }));
        };
        position();
        document.addEventListener('pointerdown', pointer);
        window.addEventListener('resize', position);
        window.addEventListener('scroll', position, true);
        return () => {
            document.removeEventListener('pointerdown', pointer);
            window.removeEventListener('resize', position);
            window.removeEventListener('scroll', position, true);
        };
    }, [open]);
    return (
        <span
            ref={root}
            className='relative inline'
            onKeyDown={(event) => {
                if (event.key === 'Escape' && open) {
                    event.preventDefault();
                    event.stopPropagation();
                    setOpen(false);
                    trigger.current?.focus();
                }
            }}
        >
            <button
                ref={trigger}
                type='button'
                aria-label={`${text}: ${t('show hint')}`}
                aria-expanded={open}
                aria-controls={open ? id : undefined}
                onClick={() => {
                    setShift({ x: 0, y: 0 });
                    if (!open) onReveal();
                    setOpen(!open);
                }}
                className={`rounded-sm underline decoration-primary-default decoration-2 underline-offset-[6px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-focus ${revealed ? 'bg-primary-subtle decoration-solid' : 'decoration-dotted'}`}
            >
                {text}
            </button>
            {open ? (
                <span
                    ref={panel}
                    id={id}
                    role='dialog'
                    aria-label={`${t('Hint')}: ${text}`}
                    style={{
                        transform: `translate(${shift.x}px, ${shift.y}px)`,
                    }}
                    className='absolute start-0 top-full z-30 mt-2 block w-64 max-w-[calc(100vw-24px)] rounded-xl border border-border-default bg-background-elevated p-3 text-start shadow-lg'
                >
                    <span className='block text-xs font-normal text-text-secondary'>
                        {t('Hint')} · {languageName(language)}
                    </span>
                    <span
                        className='mt-1 block text-base font-semibold'
                        lang={language}
                        dir={languageDirection(language)}
                    >
                        {hint}
                    </span>
                    <span className='mt-1 block text-xs font-normal text-text-secondary'>
                        {t(
                            'Use the matching dictionary word. Change its form when needed.',
                        )}
                    </span>
                </span>
            ) : null}
        </span>
    );
}

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
                    className={`rounded-xl border-2 px-3 py-1.5 text-xl font-semibold ${result.percentage >= 80 ? 'border-success-default text-success-default' : 'border-warning-default text-warning-default'}`}
                >
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
                className='mt-3 text-sm'
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
                                <span className='shrink-0 font-semibold'>
                                    {index + 1}
                                </span>
                                <div>
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
