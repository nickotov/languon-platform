import { afterEach, describe, expect, it } from 'vitest';
import { readingFragment } from '@/fsd/features/text-reading/lib/reading-fragment';
import { analyzeReadingSelection } from '@/fsd/features/text-reading/lib/selection';
afterEach(() => {
    document.body.replaceChildren();
    window.getSelection()?.removeAllRanges();
});
function select(text: string, start: number, end: number) {
    const root = document.createElement('div');
    const pair = document.createElement('span');
    pair.dataset.readingPair = 'pair-1';
    pair.dataset.side = 'translation';
    pair.lang = 'en';
    pair.textContent = text;
    root.append(pair);
    document.body.append(root);
    const range = document.createRange();
    range.setStart(pair.firstChild!, start);
    range.setEnd(pair.firstChild!, end);
    range.getBoundingClientRect = () =>
        ({ top: 0, left: 0, width: 30, height: 20 }) as DOMRect;
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return { root, pair, selection, range };
}
describe('native contextual text selection', () => {
    it('keeps the repeated occurrence and pair-relative UTF16 offset after trimming', () => {
        const { root, selection } = select('😀 word word. Other.', 7, 12);
        const result = analyzeReadingSelection(root, selection);
        expect(result?.kind).toBe('valid');
        expect(result?.text).toBe('word');
        expect(result?.selection).toEqual({
            side: 'translation',
            pairId: 'pair-1',
            startOffset: 8,
            endOffset: 12,
        });
    });
    it('rejects selecting two actual sentences inside a single aligned pair', () => {
        const { root, selection } = select('One. Two.', 1, 8);
        expect(analyzeReadingSelection(root, selection)?.kind).toBe('cross');
    });
    it('counts Unicode code points while keeping UTF16 transport offsets', () => {
        const { root, selection } = select('😀'.repeat(200) + '.', 0, 400);
        expect(analyzeReadingSelection(root, selection)?.kind).toBe('valid');
        const tooLong = select('😀'.repeat(201) + '.', 0, 402);
        expect(
            analyzeReadingSelection(tooLong.root, tooLong.selection)?.kind,
        ).toBe('long');
    });
    it('rejects selection across pair boundaries', () => {
        const { root, pair, selection, range } = select('First.', 0, 3);
        const next = pair.cloneNode() as HTMLElement;
        next.dataset.readingPair = 'pair-2';
        next.textContent = 'Second.';
        root.append(next);
        range.setEnd(next.firstChild!, 3);
        selection.removeAllRanges();
        selection.addRange(range);
        expect(analyzeReadingSelection(root, selection)?.kind).toBe('cross');
    });
    it('maps visible repeated Unicode words to original offsets after structural edge whitespace is removed', () => {
        const original = ' \n 😀 word word.\n\n';
        const fragment = readingFragment(original);
        expect(fragment).toMatchObject({
            text: '😀 word word.',
            offsetOrigin: 3,
        });
        const { root, pair, selection } = select(fragment.text, 8, 12);
        pair.dataset.offsetOrigin = String(fragment.offsetOrigin);
        const result = analyzeReadingSelection(root, selection)!;
        expect(result.kind).toBe('valid');
        expect(result.selection).toMatchObject({
            startOffset: 11,
            endOffset: 15,
        });
        expect(
            original.slice(
                result.selection.startOffset,
                result.selection.endOffset,
            ),
        ).toBe('word');
        expect(result.sentenceStart).toBe(3);
        expect(
            result.sentence.slice(
                result.selection.startOffset - result.sentenceStart,
                result.selection.endOffset - result.sentenceStart,
            ),
        ).toBe('word');
        expect(original).toBe(' \n 😀 word word.\n\n');
    });
});
