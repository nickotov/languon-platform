import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { LearningBlock } from '@languon/contracts';
import {
    blockContentHash,
    findProposalBlock,
    freshProposalBlocks,
    replaceProposalBlock,
} from './block-proposal-content';

const block: LearningBlock = {
    id: randomUUID(),
    type: 'grammar',
    language: 'fr',
    rule: 'Use faire.',
};
describe('Block proposal content identity', () => {
    it('ignores JSONB property ordering but detects content changes', () => {
        const reordered = Object.fromEntries(
            Object.entries(block).reverse(),
        ) as LearningBlock;
        expect(blockContentHash(block)).toBe(blockContentHash(reordered));
        expect(blockContentHash(block)).not.toBe(
            blockContentHash({ ...block, title: 'Different' }),
        );
    });
    it('replaces only the target while preserving surrounding prose and other blocks', () => {
        const other = { ...block, id: randomUUID() };
        const paragraph = {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Keep this.' }],
        };
        const document = {
            type: 'doc',
            content: [
                paragraph,
                { type: 'learningBlock', attrs: { block } },
                { type: 'learningBlock', attrs: { block: other } },
            ],
        };
        const replacement = { ...block, title: 'Updated' };
        const changed = replaceProposalBlock(document, block.id, replacement);
        expect(findProposalBlock(changed, block.id)).toEqual(replacement);
        expect(findProposalBlock(changed, other.id)).toEqual(other);
        expect((changed as typeof document).content[0]).toEqual(paragraph);
        expect(findProposalBlock(document, block.id)).toEqual(block);
    });
    it('freshens copied exercise identities and shared group identity exactly once', () => {
        const group = { id: randomUUID(), title: 'Questions' };
        const items: LearningBlock[] = [1, 2].map((n) => ({
            id: randomUUID(),
            type: 'exercise',
            format: 'free-text',
            question: `Q${n}`,
            referenceAnswer: 'A',
            explanation: 'Why',
            group,
        }));
        const copies = freshProposalBlocks(items);
        expect(copies[0]?.id).not.toBe(items[0]?.id);
        expect(copies[1]?.id).not.toBe(items[1]?.id);
        const a = copies[0];
        const b = copies[1];
        if (a?.type !== 'exercise' || b?.type !== 'exercise')
            throw new Error('Expected exercises');
        expect(a.group?.id).toBe(b.group?.id);
        expect(a.group?.id).not.toBe(group.id);
    });
});
