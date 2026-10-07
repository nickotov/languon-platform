import { describe, expect, it } from 'vitest';
import { partitionSentencePreparation } from '../../../../../src/modules/learning/domain/sentence-preparation-policy';
const entry = (index: number) => ({
    entryId: `entry-${index}`,
    learningVersion: 1,
    sourceText: `source-${index}`,
    targetText: `target-${index}`,
});
describe('sentence preparation partitioning', () => {
    it('keeps the chosen round first and covers a large dictionary exactly once', () => {
        const entries = Array.from({ length: 257 }, (_, index) => entry(index));
        const selected = ['entry-240', 'entry-2', 'entry-155'];
        const batches = partitionSentencePreparation(entries, selected);
        expect(batches[0]!.map((item) => item.entryId)).toEqual([
            'entry-2',
            'entry-155',
            'entry-240',
        ]);
        expect(batches.map((batch) => batch.length)).toEqual([3, 100, 100, 54]);
        expect(new Set(batches.flat().map((item) => item.entryId)).size).toBe(
            257,
        );
    });
    it('uses stable first 100 for all and bounds every subsequent round', () => {
        const entries = Array.from({ length: 201 }, (_, index) => entry(index));
        const batches = partitionSentencePreparation(
            entries,
            entries.slice(0, 100).map((item) => item.entryId),
        );
        expect(batches.map((batch) => batch.length)).toEqual([100, 100, 1]);
        expect(batches.flat()).toEqual(entries);
    });
    it('does not create an empty partition and rejects an oversized initial round', () => {
        expect(partitionSentencePreparation([], [])).toEqual([]);
        const entries = Array.from({ length: 101 }, (_, index) => entry(index));
        expect(() =>
            partitionSentencePreparation(
                entries,
                entries.map((item) => item.entryId),
            ),
        ).toThrow('exceeds');
    });
});
