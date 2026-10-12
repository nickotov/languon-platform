'use client';
import styles from './sentence-hints.module.css';

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
        <div ref={root} className={styles.hintRoot}>
            <p
                lang={exercise.sourceLanguage}
                dir={
                    /^(ar|he|fa|ur)(-|$)/i.test(exercise.sourceLanguage)
                        ? 'rtl'
                        : 'ltr'
                }
                className={styles.sentence}
            >
                {exercise.segments.map((item, index) => {
                    const itemHint = hintFor(index);
                    if (!itemHint)
                        return <span key={item.id}>{item.text}</span>;
                    const dictionary = itemHint.kind !== 'contextual';
                    const wordClasses = [styles.hintWord];
                    wordClasses.push(
                        dictionary
                            ? styles.dictionaryWord
                            : styles.contextualWord,
                    );
                    if (revealedHintIds.includes(itemHint.id)) {
                        wordClasses.push(
                            dictionary
                                ? styles.dictionaryRevealed
                                : styles.contextualRevealed,
                        );
                    }
                    if (open?.index === index)
                        wordClasses.push(styles.wordOpen);
                    const wordClassName = wordClasses.join(' ');
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
                            className={wordClassName}
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
                    style={position}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                            event.preventDefault();
                            event.stopPropagation();
                            close(true);
                        }
                    }}
                    className={styles.hintPopover}
                >
                    <div className={styles.popoverHeader}>
                        <span
                            className={`${styles.hintKind} ${hint.kind === 'contextual' ? styles.contextualKind : styles.dictionaryKind}`}
                        >
                            {hint.kind === 'contextual' ? (
                                <Lightbulb
                                    aria-hidden
                                    className={styles.icon}
                                />
                            ) : (
                                <Bookmark aria-hidden className={styles.icon} />
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
                            <X aria-hidden className={styles.icon2} />
                        </Button>
                    </div>
                    <p className={styles.hintTranslation}>
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
                    <p className={styles.hintNote}>
                        {t(
                            hint.kind === 'contextual'
                                ? 'Support only — not required and not added to your dictionary.'
                                : 'Use this dictionary word. Inflected forms are fine.',
                        )}
                    </p>
                    <p className={styles.hintDisclaimer}>
                        {t('Hints are free and never lower your score.')}
                    </p>
                </div>
            ) : null}
            <ul aria-label={t('Hint legend')} className={styles.legend}>
                <li className={styles.legendItem}>
                    <Bookmark aria-hidden className={styles.dictionaryIcon} />
                    <span className={styles.dictionaryLegend}>
                        {t('Required word')}
                    </span>{' '}
                    · {required.length}
                </li>
                {contextual.length ? (
                    <li className={styles.legendItem}>
                        <Lightbulb aria-hidden className={styles.icon} />
                        <span className={styles.contextualLegend}>
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
                <p className={styles.hintNote}>
                    {t('Hints shown:')}{' '}
                    <span lang={exercise.targetLanguage}>
                        {opened.map((item) => item.text).join(', ')}
                    </span>
                </p>
            ) : null}
        </div>
    );
}
