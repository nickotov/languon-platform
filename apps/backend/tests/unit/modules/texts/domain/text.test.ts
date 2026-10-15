import { describe, expect, it } from 'vitest';
import {
    applyTextEdits,
    resolveTextSelection,
    resolveTextTitle,
    segmentText,
    validateTranslation,
} from '../../../../../src/modules/texts/domain/text';
function ids() {
    let n = 0;
    return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
}
function aligned(text: string, locale = 'en') {
    const source = segmentText(text, locale, ids());
    return validateTranslation(
        source,
        source.map((s) => ({ pairId: s.pairId, text: s.text })),
    );
}
describe('Text alignment and occurrence context', () => {
    it.each([
        '  First sentence. Second sentence.\r\n\r\nThird sentence!\n',
        '\n\n你好。世界！\n\n再见。',
        'مرحبا بالعالم.\nكيف حالك؟',
        'A 😀 smile. Another 😀 smile.',
    ])('reconstructs exact Unicode source and whitespace: %s', (text) => {
        const result = aligned(text);
        expect(result.source.map((s) => s.text).join('')).toBe(text);
        for (const s of result.source)
            expect(text.slice(s.startOffset, s.endOffset)).toBe(s.text);
        expect(result.source.every((s) => s.text.trim())).toBe(true);
    });
    it('rejects missing, duplicated, and reordered translations', () => {
        const a = aligned('First. Second.');
        expect(() =>
            validateTranslation(a.source, a.translation.slice(1)),
        ).toThrow();
        expect(() =>
            validateTranslation(a.source, [...a.translation].reverse()),
        ).toThrow();
        expect(() =>
            validateTranslation(a.source, [
                a.translation[0]!,
                a.translation[0]!,
            ]),
        ).toThrow();
    });
    it('preserves pair identities, updates offsets, and retains edit provenance', () => {
        const a = aligned('First. Second.');
        const pairs = a.source.map((s, i) => ({
            pairId: s.pairId,
            source: s.text,
            translation: a.translation[i]!.text,
        }));
        pairs[0]!.source = 'Edited first. ';
        const edited = applyTextEdits(a, pairs);
        expect(edited.editedPairIds).toEqual([pairs[0]!.pairId]);
        expect(edited.source[1]!.startOffset).toBe('Edited first. '.length);
        expect(applyTextEdits(edited, pairs).editedPairIds).toEqual(
            edited.editedPairIds,
        );
        expect(() => applyTextEdits(a, pairs.slice(1))).toThrow();
    });
    it('selects the exact repeated occurrence with neighboring context and reversed languages', () => {
        const a = aligned('First bank. Second bank. Third bank.');
        const middle = a.translation[1]!;
        const result = resolveTextSelection(
            a,
            {
                side: 'translation',
                pairId: middle.pairId,
                startOffset: 7,
                endOffset: 11,
            },
            { sourceLanguage: 'en', targetLanguage: 'es' },
        );
        expect(result).toEqual({
            phrase: 'bank',
            startOffset: 7,
            endOffset: 11,
            sentence: 'Second bank. ',
            previousSentence: 'First bank. ',
            nextSentence: 'Third bank.',
            sourceLanguage: 'es',
            targetLanguage: 'en',
        });
    });
    it('rejects surrogate slicing and selection across sentences inside a translated pair', () => {
        const a = aligned('A 😀 smile.');
        const select = (startOffset: number, endOffset: number) =>
            resolveTextSelection(
                a,
                {
                    side: 'source',
                    pairId: a.source[0]!.pairId,
                    startOffset,
                    endOffset,
                },
                { sourceLanguage: 'en', targetLanguage: 'es' },
            );
        expect(() => select(2, 3)).toThrow();
        expect(select(2, 4).phrase).toBe('😀');
        a.translation[0]!.text = 'One sentence. Another sentence.';
        expect(() =>
            resolveTextSelection(
                a,
                {
                    side: 'translation',
                    pairId: a.source[0]!.pairId,
                    startOffset: 4,
                    endOffset: 20,
                },
                { sourceLanguage: 'en', targetLanguage: 'es' },
            ),
        ).toThrow();
    });
    it.each(['source', 'translation'] as const)(
        'retains real neighboring context across paragraph whitespace on %s',
        (side) => {
            const a = aligned(
                'The river flows slowly.\n\nWe rested on the bank.\n\nBirds sang nearby.',
            );
            const middle = a[side].find((pair) => pair.text.includes('bank'))!;
            const startOffset = middle.text.indexOf('bank');
            const result = resolveTextSelection(
                a,
                {
                    side,
                    pairId: middle.pairId,
                    startOffset,
                    endOffset: startOffset + 4,
                },
                { sourceLanguage: 'en', targetLanguage: 'es' },
            );
            expect(result.previousSentence?.trim()).toBe(
                'The river flows slowly.',
            );
            expect(result.nextSentence?.trim()).toBe('Birds sang nearby.');
        },
    );
    it('skips blank sentence units inside a manually edited pair without changing offsets', () => {
        const a = aligned('Original.');
        const text =
            '\n\nThe river flows slowly.\n\nWe rested on the bank.\n\nBirds sang nearby.\n\n';
        a.translation[0]!.text = text;
        const startOffset = text.indexOf('bank');
        const result = resolveTextSelection(
            a,
            {
                side: 'translation',
                pairId: a.translation[0]!.pairId,
                startOffset,
                endOffset: startOffset + 4,
            },
            { sourceLanguage: 'es', targetLanguage: 'en' },
        );
        expect(result.previousSentence?.trim()).toBe('The river flows slowly.');
        expect(result.nextSentence?.trim()).toBe('Birds sang nearby.');
        expect(
            result.sentence.slice(result.startOffset, result.endOffset),
        ).toBe('bank');
    });
    it('defaults title to the first nonblank line using code points', () => {
        expect(resolveTextTitle(undefined, '\n  A title\nContent')).toBe(
            'A title',
        );
        expect(
            Array.from(resolveTextTitle(undefined, '😀'.repeat(201))),
        ).toHaveLength(200);
    });
});
