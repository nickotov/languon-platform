import type { ReadingSelection } from '../types';
/** UTF-16 offsets remain relative to the aligned pair, including its whitespace. */
export function analyzeReadingSelection(
    container: HTMLElement | null,
    selection = window.getSelection(),
): ReadingSelection | null {
    if (
        !container ||
        !selection ||
        selection.isCollapsed ||
        !selection.rangeCount
    )
        return null;
    const range = selection.getRangeAt(0);
    if (
        !container.contains(range.startContainer) ||
        !container.contains(range.endContainer)
    )
        return null;
    const element = (node: Node) =>
        (node.nodeType === 1
            ? (node as HTMLElement)
            : node.parentElement
        )?.closest<HTMLElement>('[data-reading-pair]');
    const startElement = element(range.startContainer);
    const endElement = element(range.endContainer);
    if (!startElement || !endElement) return null;
    const raw = range.toString();
    const text = raw.trim();
    if (!text) return null;
    const prefix = document.createRange();
    prefix.selectNodeContents(startElement);
    prefix.setEnd(range.startContainer, range.startOffset);
    const offsetOrigin = Number(startElement.dataset.offsetOrigin ?? 0);
    const localStart =
        prefix.toString().length + raw.length - raw.trimStart().length;
    const localEnd = localStart + text.length;
    const startOffset = localStart + offsetOrigin;
    const endOffset = localEnd + offsetOrigin;
    const pairText = startElement.textContent ?? '';
    const locale = startElement.lang || undefined;
    const sentences = [
        ...new Intl.Segmenter(locale, { granularity: 'sentence' }).segment(
            pairText,
        ),
    ];
    const sentence = sentences.find(
        (part) =>
            localStart >= part.index &&
            localEnd <= part.index + part.segment.trimEnd().length,
    );
    const bounds = range.getBoundingClientRect();
    return {
        kind:
            startElement !== endElement || !sentence
                ? 'cross'
                : Array.from(text).length > 200
                  ? 'long'
                  : 'valid',
        text,
        sentence: sentence?.segment ?? pairText,
        sentenceStart: (sentence?.index ?? 0) + offsetOrigin,
        selection: {
            side:
                startElement.dataset.side === 'translation'
                    ? 'translation'
                    : 'source',
            pairId: startElement.dataset.readingPair!,
            startOffset,
            endOffset,
        },
        rect: {
            top: bounds.top,
            left: bounds.left,
            width: bounds.width,
            height: bounds.height,
        },
    };
}
