import { describe, expect, it } from 'vitest';
import { Mapping, StepMap } from '@tiptap/pm/transform';
import { mapProposalTarget } from '../src/fsd/features/knowledge-notes/lib/proposal-target';

function mapping(...steps: Array<[number, number, number]>) {
    const result = new Mapping();
    for (const step of steps) result.appendMap(new StepMap(step));
    return result;
}

const selected = {
    id: 'selection',
    from: 5,
    to: 10,
    selectedText: 'word',
    changed: false,
};

describe('proposal target mapping', () => {
    it('keeps the original selection when text above or below changes', () => {
        expect(mapProposalTarget(selected, mapping([2, 0, 3]))).toMatchObject({
            from: 8,
            to: 13,
            changed: false,
        });
        expect(mapProposalTarget(selected, mapping([15, 0, 3]))).toMatchObject({
            from: 5,
            to: 10,
            changed: false,
        });
    });

    it('marks edits inside or replacing the target for comparison', () => {
        expect(mapProposalTarget(selected, mapping([7, 0, 2])).changed).toBe(
            true,
        );
        expect(mapProposalTarget(selected, mapping([5, 5, 4])).changed).toBe(
            true,
        );
    });

    it('tracks sequential steps and detects a later edit to the shifted target', () => {
        const result = mapProposalTarget(
            selected,
            mapping([2, 0, 3], [10, 0, 1]),
        );
        expect(result.changed).toBe(true);
        expect(result.from).toBe(8);
        expect(result.to).toBe(14);
    });

    it('treats writing at a captured cursor as a changed insertion target', () => {
        const cursor = { ...selected, from: 5, to: 5, selectedText: '' };
        expect(mapProposalTarget(cursor, mapping([5, 0, 2])).changed).toBe(
            true,
        );
    });
});
