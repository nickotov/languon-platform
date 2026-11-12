'use client';
import styles from '../styles/sentence-hints-common.module.css';
import { HintWord, type HintWordActions } from './ui/hint-word/hint-word';
import { HintPopoverContent } from './ui/hint-popover-content/hint-popover-content';

import {
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent,
} from 'react';
import type { SentenceExercise } from '@languon/contracts';
import { Bookmark, Lightbulb } from 'lucide-react';
import { Popover, PopoverAnchor } from '@/fsd/shared/ui';
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
        if (restore && open) {
            triggers.current.get(open.index)?.focus();
        }

        setOpen(null);
    };
    const activate = (index: number, hover = false) => {
        const selected = hintFor(index);
        if (!selected || (hover && openRef.current && !openRef.current.hover)) {
            return;
        }

        onReveal(selected.id);
        setOpen((previous) =>
            hover && previous && !previous.hover ? previous : { index, hover },
        );
    };

    useEffect(
        () => () => {
            if (timer.current) {
                clearTimeout(timer.current);
            }
        },
        [],
    );

    const virtualReference = useMemo(() => {
        const trigger = open ? triggers.current.get(open.index) : undefined;
        if (!trigger) {
            return undefined;
        }

        return {
            contextElement: trigger,
            getBoundingClientRect() {
                const rects = trigger.getClientRects();

                return (
                    rects[rects.length - 1] ?? trigger.getBoundingClientRect()
                );
            },
        };
    }, [open]);

    function registerTrigger(index: number, node: HTMLSpanElement | null) {
        if (node) {
            triggers.current.set(index, node);
        } else {
            triggers.current.delete(index);
        }
    }

    function toggleHint(index: number) {
        if (open?.index === index && !open.hover) {
            close();
        } else {
            activate(index);
        }
    }

    function handleWordKey(
        index: number,
        event: KeyboardEvent<HTMLSpanElement>,
    ) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            activate(index);
        }

        if (event.key === 'Escape' && open) {
            event.preventDefault();
            event.stopPropagation();
            close(true);
        }
    }

    function hoverHint(index: number) {
        if (timer.current) {
            clearTimeout(timer.current);
        }

        timer.current = setTimeout(() => activate(index, true), 350);
    }

    function leaveHint() {
        if (timer.current) {
            clearTimeout(timer.current);
        }

        setOpen((previous) => (previous?.hover ? null : previous));
    }

    function handleOpenChange(next: boolean) {
        if (!next) {
            close(false);
        }
    }

    function closeHint() {
        close(true);
    }

    function handlePopoverKey(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close(true);
        }
    }

    const hintActions: HintWordActions = {
        register: registerTrigger,
        toggle: toggleHint,
        keyDown: handleWordKey,
        hover: hoverHint,
        leave: leaveHint,
    };

    return (
        <Popover open={Boolean(open)} onOpenChange={handleOpenChange}>
            <div className={styles.hintRoot}>
                <PopoverAnchor asChild virtualRef={virtualReference}>
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
                            if (!itemHint) {
                                return <span key={item.id}>{item.text}</span>;
                            }

                            return (
                                <HintWord
                                    key={item.id}
                                    segment={item}
                                    index={index}
                                    dictionary={itemHint.kind !== 'contextual'}
                                    revealed={revealedHintIds.includes(
                                        itemHint.id,
                                    )}
                                    opened={open?.index === index}
                                    popoverId={popoverId}
                                    actions={hintActions}
                                />
                            );
                        })}
                    </p>
                </PopoverAnchor>
                {open && hint && segment ? (
                    <HintPopoverContent
                        exercise={exercise}
                        hint={hint}
                        segment={segment}
                        popoverId={popoverId}
                        panelRef={panel}
                        onClose={closeHint}
                        onKeyDown={handlePopoverKey}
                    />
                ) : null}
                <ul aria-label={t('Hint legend')} className={styles.legend}>
                    <li className={styles.legendItem}>
                        <Bookmark
                            aria-hidden
                            className={styles.dictionaryIcon}
                        />
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
                        {t(
                            'Select, tap or Tab to a marked word to see its hint.',
                        )}
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
        </Popover>
    );
}
