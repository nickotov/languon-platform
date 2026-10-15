import {
    readingFragment,
    paragraphEdgeWhitespace,
} from '../../lib/reading-fragment';
import { Fragment } from 'react';
import { PencilLine } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
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
    return (
        <Fragment key={pair.pairId}>
            {hasPrevious
                ? fragment.leading
                : paragraphEdgeWhitespace(fragment.leading)}
            <span
                data-reading-pair={pair.pairId}
                data-side={side}
                data-offset-origin={fragment.offsetOrigin}
                lang={
                    side === 'source' ? doc.sourceLanguage : doc.targetLanguage
                }
                className={`${styles.pair} ${matchMode ? styles.match : ''} ${highlighted ? styles.active : ''}`}
                tabIndex={matchMode ? 0 : undefined}
                onMouseEnter={() => matchMode && setActive(pair.pairId)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => {
                    if (matchMode) {
                        setFocused(pair.pairId);
                        setAnnouncement(
                            t('texts.reading.matched', {
                                side: t(
                                    side === 'source'
                                        ? 'texts.reading.translation'
                                        : 'texts.reading.source',
                                ),
                                text:
                                    side === 'source'
                                        ? (translation[index]?.text ?? '')
                                        : pair.text,
                            }),
                        );
                    }
                }}
                onBlur={() => setFocused(null)}
                onClick={() => {
                    if (
                        matchMode &&
                        compact &&
                        window.getSelection()?.isCollapsed
                    )
                        setSheet(index);
                }}
                onKeyDown={(event) => {
                    if (
                        matchMode &&
                        compact &&
                        ['Enter', ' '].includes(event.key)
                    ) {
                        event.preventDefault();
                        setSheet(index);
                    }
                }}
            >
                {renderText(
                    fragment.text,
                    fragment.offsetOrigin,
                    pair.pairId,
                    side,
                )}
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
