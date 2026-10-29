import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sourceSentenceEntries } from './knowledge-sentence-context';
import type { VocabularyPracticeContent } from './vocabulary-practice-source';
// This helper consumes only the explicitly supplied material projection.
const source = {
    sourceLanguage: 'en',
    targetLanguage: 'es',
    entries: Array.from({ length: 110 }, (_, index) => ({
        entryId: randomUUID(),
        learningVersion: 1,
        term: `term${index}`,
        translation: `palabra${index}`,
    })),
} as VocabularyPracticeContent;
describe('knowledge sentence source selection', () => {
    it('keeps all bounded block entries eligible instead of permanently truncating at the manual selection limit', () => {
        const result = sourceSentenceEntries(source, 'source-to-target', {
            type: 'all',
        });
        expect(result.entries).toHaveLength(110);
        expect(result.skippedCount).toBe(0);
        expect(result.entries.at(-1)!.entryId).toBe(
            source.entries.at(-1)!.entryId,
        );
    });
    it('allows a manually selected later entry without exposing other entries', () => {
        const last = source.entries.at(-1)!;
        const result = sourceSentenceEntries(source, 'target-to-source', {
            type: 'manual',
            entryIds: [last.entryId],
        });
        expect(result.entries).toHaveLength(1);
        expect(result.entries[0]).toMatchObject({
            sourceText: last.translation,
            targetText: last.term,
        });
    });
});
