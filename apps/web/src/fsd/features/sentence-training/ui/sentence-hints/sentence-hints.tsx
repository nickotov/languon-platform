'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { SentenceExercise } from '@languon/contracts';
import { Bookmark, Lightbulb, X } from 'lucide-react';
import { Button } from '@/fsd/shared/ui';
import { useSentenceCopy } from '../sentence-copy';

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
    const [open, setOpen] = useState<{ index: number; hover: boolean } | null>(
        null,
    );
    const openRef = useRef(open);
    openRef.current = open;
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const root = useRef<HTMLDivElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const triggers = useRef<Map<number, HTMLSpanElement>>(new Map());
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const popoverId = useId();
    const hintFor = (index: number) => {
        const segment = exercise.segments[index];
        return exercise.hints.find(
            (hint) =>
                hint.id ===
                (segment?.target?.hintId ?? segment?.contextualHintId),
        );
    };
    const hint = open ? hintFor(open.index) : undefined;
    const segment = open ? exercise.segments[open.index] : undefined;
    const required = exercise.hints.filter(
        (item) => item.kind !== 'contextual',
    );
    const contextual = exercise.hints.filter(
        (item) => item.kind === 'contextual',
    );
    const opened = exercise.hints.filter((item) =>
        revealedHintIds.includes(item.id),
    );
    const close = (restore = false) => {
        if (restore && open) triggers.current.get(open.index)?.focus();
        setOpen(null);
    };
    const activate = (index: number, hover = false) => {
        const selected = hintFor(index);
        if (!selected || (hover && openRef.current && !openRef.current.hover))
            return;
        onReveal(selected.id);
        setOpen((previous) =>
            hover && previous && !previous.hover ? previous : { index, hover },
        );
    };
    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );
    useLayoutEffect(() => {
        if (!open) return;
        const measure = () => {
            const trigger = triggers.current.get(open.index);
            if (!trigger || !root.current) return;
            const rects = trigger.getClientRects();
            const rect =
                rects[rects.length - 1] ?? trigger.getBoundingClientRect();
            const box = root.current.getBoundingClientRect();
            const width = Math.min(288, box.width);
            const height = panel.current?.getBoundingClientRect().height ?? 180;
            const viewport = window.visualViewport;
            const bottom =
                (viewport?.offsetTop ?? 0) +
                (viewport?.height ?? window.innerHeight);
            setPosition({
                left: Math.max(
                    0,
                    Math.min(rect.left - box.left, box.width - width),
                ),
                top: Math.max(
                    0,
                    rect.bottom + height + 8 > bottom
                        ? rect.top - box.top - height - 8
                        : rect.bottom - box.top + 8,
                ),
            });
        };
        measure();
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        window.visualViewport?.addEventListener('resize', measure);
        return () => {
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
            window.visualViewport?.removeEventListener('resize', measure);
        };
    }, [open]);
    useEffect(() => {
        if (!open) return;
        const outside = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node)) setOpen(null);
        };
        document.addEventListener('pointerdown', outside);
        return () => document.removeEventListener('pointerdown', outside);
    }, [open]);

    return (
        <div ref={root} className='relative'>
            <p
                lang={exercise.sourceLanguage}
                dir={
                    /^(ar|he|fa|ur)(-|$)/i.test(exercise.sourceLanguage)
                        ? 'rtl'
                        : 'ltr'
                }
                className='whitespace-pre-wrap break-words text-2xl leading-[1.9] text-text-primary sm:text-[1.75rem]'
            >
                {exercise.segments.map((item, index) => {
                    const itemHint = hintFor(index);
                    if (!itemHint)
                        return <span key={item.id}>{item.text}</span>;
                    const dictionary = itemHint.kind !== 'contextual';
                    return (
                        <span
                            key={item.id}
                            ref={(node) => {
                                if (node) triggers.current.set(index, node);
                                else triggers.current.delete(index);
                            }}
                            role='button'
                            tabIndex={0}
                            aria-label={`${item.text}: ${t('show hint')} · ${t(dictionary ? 'Required word' : 'Extra help')}`}
                            aria-haspopup='dialog'
                            aria-expanded={open?.index === index}
                            aria-controls={
                                open?.index === index ? popoverId : undefined
                            }
                            onClick={() =>
                                open?.index === index && !open.hover
                                    ? close()
                                    : activate(index)
                            }
                            onKeyDown={(event) => {
                                if (
                                    event.key === 'Enter' ||
                                    event.key === ' '
                                ) {
                                    event.preventDefault();
                                    activate(index);
                                }
                                if (event.key === 'Escape' && open) {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    close(true);
                                }
                            }}
                            onMouseEnter={() => {
                                if (timer.current) clearTimeout(timer.current);
                                timer.current = setTimeout(
                                    () => activate(index, true),
                                    350,
                                );
                            }}
                            onMouseLeave={() => {
                                if (timer.current) clearTimeout(timer.current);
                                setOpen((previous) =>
                                    previous?.hover ? null : previous,
                                );
                            }}
                            className={`cursor-pointer rounded-sm underline underline-offset-[6px] outline-none [box-decoration-break:clone] focus-visible:ring-2 focus-visible:ring-border-focus ${dictionary ? 'font-semibold decoration-primary-default decoration-2' : 'decoration-text-tertiary decoration-dashed'} ${revealedHintIds.includes(itemHint.id) ? (dictionary ? 'bg-primary-subtle' : 'bg-background-subtle') : ''} ${open?.index === index ? 'ring-2 ring-border-focus' : ''}`}
                        >
                            {item.text}
                        </span>
                    );
                })}
            </p>
            {open && hint && segment ? (
                <div
                    id={popoverId}
                    ref={panel}
                    role='dialog'
                    aria-label={`${t('Hint')}: ${segment.text}`}
                    style={{ ...position, width: 'min(18rem, 100%)' }}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                            event.preventDefault();
                            event.stopPropagation();
                            close(true);
                        }
                    }}
                    className='absolute z-30 rounded-xl border border-border-strong bg-background-elevated p-3 shadow-lg'
                >
                    <div className='flex items-center justify-between gap-2 text-xs font-semibold'>
                        <span
                            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] uppercase tracking-wide ${hint.kind === 'contextual' ? 'border-dashed border-border-strong text-text-secondary' : 'border-primary-default text-primary-default'}`}
                        >
                            {hint.kind === 'contextual' ? (
                                <Lightbulb
                                    aria-hidden
                                    className='h-3.5 w-3.5'
                                />
                            ) : (
                                <Bookmark aria-hidden className='h-3.5 w-3.5' />
                            )}
                            {t(
                                hint.kind === 'contextual'
                                    ? 'Extra help'
                                    : 'Required word',
                            )}
                        </span>
                        <Button
                            variant='ghost'
                            size='compact'
                            aria-label={t('Close hint')}
                            onClick={() => close(true)}
                        >
                            <X aria-hidden className='h-4 w-4' />
                        </Button>
                    </div>
                    <p className='mt-2 break-words'>
                        <span lang={exercise.sourceLanguage}>
                            {segment.text}
                        </span>
                        <span aria-hidden> → </span>
                        <strong
                            lang={exercise.targetLanguage}
                            dir={
                                /^(ar|he|fa|ur)(-|$)/i.test(
                                    exercise.targetLanguage,
                                )
                                    ? 'rtl'
                                    : 'ltr'
                            }
                        >
                            {hint.text}
                        </strong>
                    </p>
                    <p className='mt-2 text-xs text-text-secondary'>
                        {t(
                            hint.kind === 'contextual'
                                ? 'Support only — not required and not added to your dictionary.'
                                : 'Use this dictionary word. Inflected forms are fine.',
                        )}
                    </p>
                    <p className='mt-1 text-xs text-text-tertiary'>
                        {t('Hints are free and never lower your score.')}
                    </p>
                </div>
            ) : null}
            <ul
                aria-label={t('Hint legend')}
                className='mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-border-default pt-3 text-xs text-text-secondary'
            >
                <li className='inline-flex items-center gap-1.5'>
                    <Bookmark
                        aria-hidden
                        className='h-3.5 w-3.5 text-primary-default'
                    />
                    <span className='font-semibold text-text-primary underline decoration-primary-default decoration-2 underline-offset-4'>
                        {t('Required word')}
                    </span>{' '}
                    · {required.length}
                </li>
                {contextual.length ? (
                    <li className='inline-flex items-center gap-1.5'>
                        <Lightbulb aria-hidden className='h-3.5 w-3.5' />
                        <span className='text-text-primary underline decoration-text-tertiary decoration-dashed underline-offset-4'>
                            {t('Extra help')}
                        </span>{' '}
                        · {contextual.length}
                    </li>
                ) : (
                    <li>
                        {t('This saved example has dictionary hints only.')}
                    </li>
                )}
                <li>
                    {t('Select, tap or Tab to a marked word to see its hint.')}
                </li>
            </ul>
            {opened.length ? (
                <p className='mt-2 text-xs text-text-secondary'>
                    {t('Hints shown:')}{' '}
                    <span lang={exercise.targetLanguage}>
                        {opened.map((item) => item.text).join(', ')}
                    </span>
                </p>
            ) : null}
        </div>
    );
}
