import type { KeyboardEvent } from 'react';
import type { SentenceExercise } from '@languon/contracts';
import { useSentenceCopy } from '../sentence-copy';
import styles from './sentence-hints.module.css';

export interface HintWordActions {
    register(index: number, node: HTMLSpanElement | null): void;
    toggle(index: number): void;
    keyDown(index: number, event: KeyboardEvent<HTMLSpanElement>): void;
    hover(index: number): void;
    leave(): void;
}

export function HintWord({
    segment,
    index,
    dictionary,
    revealed,
    opened,
    popoverId,
    actions,
}: {
    segment: SentenceExercise['segments'][number];
    index: number;
    dictionary: boolean;
    revealed: boolean;
    opened: boolean;
    popoverId: string;
    actions: HintWordActions;
}) {
    const { t } = useSentenceCopy();
    const wordClasses = [styles.hintWord];
    wordClasses.push(
        dictionary ? styles.dictionaryWord : styles.contextualWord,
    );

    if (revealed) {
        wordClasses.push(
            dictionary ? styles.dictionaryRevealed : styles.contextualRevealed,
        );
    }

    if (opened) {
        wordClasses.push(styles.wordOpen);
    }

    const wordClassName = wordClasses.join(' ');
    const label = `${segment.text}: ${t('show hint')} · ${t(dictionary ? 'Required word' : 'Extra help')}`;

    function register(node: HTMLSpanElement | null) {
        actions.register(index, node);
    }

    function toggle() {
        actions.toggle(index);
    }

    function keyDown(event: KeyboardEvent<HTMLSpanElement>) {
        actions.keyDown(index, event);
    }

    function hover() {
        actions.hover(index);
    }

    return (
        <span
            ref={register}
            role='button'
            tabIndex={0}
            aria-label={label}
            aria-haspopup='dialog'
            aria-expanded={opened}
            aria-controls={opened ? popoverId : undefined}
            onClick={toggle}
            onKeyDown={keyDown}
            onMouseEnter={hover}
            onMouseLeave={actions.leave}
            className={wordClassName}
        >
            {segment.text}
        </span>
    );
}
