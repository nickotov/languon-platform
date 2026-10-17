import {
    readingFragment,
    paragraphEdgeWhitespace,
} from '../../lib/reading-fragment';
import { Fragment } from 'react';
import { PencilLine } from 'lucide-react';
import type { Dispatch, SetStateAction, KeyboardEvent } from 'react';
import type { TextReadingProps, Side } from '../../types';
import type { CollectController } from '../../hooks/use-collect';
import { useReadingCopy } from '../../hooks/use-reading-copy';
import styles from './text-reading.module.css';

export function ReadingPair({
    index,
    side,
    props,
    c,
    compact,
    active,
    focused,
    setActive,
    setFocused,
    setAnnouncement,
    setSheet,
}: {
    index: number;
    side: Side;
    props: TextReadingProps;
    c: CollectController;
    compact: boolean;
    active: string | null;
    focused: string | null;
    setActive: Dispatch<SetStateAction<string | null>>;
    setFocused: Dispatch<SetStateAction<string | null>>;
    setAnnouncement: Dispatch<SetStateAction<string>>;
    setSheet: Dispatch<SetStateAction<number | null>>;
}) {
    const { document: doc, matchMode } = props;
    const pairs = doc.alignment!.source;
    const translation = doc.alignment!.translation;
    const t = useReadingCopy();
    const renderText = (
        text: string,
        offsetOrigin: number,
        pairId: string,
        side: Side,
    ) => {
        const marks = [
            ...c.marks,
            ...c.pendingMarks,
            ...(c.selection && !['trigger', 'closed'].includes(c.step)
                ? [c.selection]
                : []),
        ]
            .filter(
                (mark) =>
                    mark.selection.pairId === pairId &&
                    mark.selection.side === side,
            )
            .sort((a, b) => a.selection.startOffset - b.selection.startOffset);
        let cursor = 0;
        const result = [];
        for (const mark of marks) {
            const startOffset = mark.selection.startOffset - offsetOrigin;
            const endOffset = mark.selection.endOffset - offsetOrigin;
            if (startOffset < cursor) continue;
            result.push(
                text.slice(cursor, startOffset),
                <mark
                    key={startOffset}
                    className={
                        c.pendingMarks.includes(mark)
                            ? styles.pendingMark
                            : undefined
                    }
                >
                    {text.slice(startOffset, endOffset)}
                </mark>,
            );
            cursor = endOffset;
        }
        result.push(text.slice(cursor));
        return result;
    };

    const pair = pairs[index]!;
    const fragment = readingFragment(
        side === 'source' ? pair.text : (translation[index]?.text ?? ''),
    );
    const hasPrevious =
        pairs[index - 1]?.paragraphIndex === pair.paragraphIndex;
    const hasNext = pairs[index + 1]?.paragraphIndex === pair.paragraphIndex;
    const highlighted = matchMode && (focused ?? active) === pair.pairId;

    const pairLanguage =
        side === 'source' ? doc.sourceLanguage : doc.targetLanguage;
    const pairClassName = `${styles.pair} ${matchMode ? styles.match : ''} ${highlighted ? styles.active : ''}`;
    const renderedText = renderText(
        fragment.text,
        fragment.offsetOrigin,
        pair.pairId,
        side,
    );

    function enter() {
        if (matchMode) setActive(pair.pairId);
    }

    function leave() {
        setActive(null);
    }

    function focus() {
        if (!matchMode) return;
        setFocused(pair.pairId);
        const matchedSide =
            side === 'source'
                ? 'texts.reading.translation'
                : 'texts.reading.source';
        const matchedText =
            side === 'source' ? (translation[index]?.text ?? '') : pair.text;
        setAnnouncement(
            t('texts.reading.matched', {
                side: t(matchedSide),
                text: matchedText,
            }),
        );
    }

    function blur() {
        setFocused(null);
    }

    function openCounterpart() {
        if (matchMode && compact && window.getSelection()?.isCollapsed)
            setSheet(index);
    }

    function keyDown(event: KeyboardEvent<HTMLSpanElement>) {
        if (matchMode && compact && ['Enter', ' '].includes(event.key)) {
            event.preventDefault();
            setSheet(index);
        }
    }

    return (
        <Fragment key={pair.pairId}>
            {hasPrevious
                ? fragment.leading
                : paragraphEdgeWhitespace(fragment.leading)}
            <span
                data-reading-pair={pair.pairId}
                data-side={side}
                data-offset-origin={fragment.offsetOrigin}
                lang={pairLanguage}
                className={pairClassName}
                tabIndex={matchMode ? 0 : undefined}
                onMouseEnter={enter}
                onMouseLeave={leave}
                onFocus={focus}
                onBlur={blur}
                onClick={openCounterpart}
                onKeyDown={keyDown}
            >
                {renderedText}
            </span>
            {side === 'translation' &&
                props.showEditedMarkers !== false &&
                doc.alignment?.editedPairIds.includes(pair.pairId) && (
                    <span
                        className={styles.edited}
                        title={t('texts.reading.edited')}
                    >
                        <PencilLine
                            size={14}
                            aria-label={t('texts.reading.edited')}
                        />
                    </span>
                )}
            {hasNext
                ? fragment.trailing
                : paragraphEdgeWhitespace(fragment.trailing)}
        </Fragment>
    );
}
