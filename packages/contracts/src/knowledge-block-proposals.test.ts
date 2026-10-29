import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
    ApplyKnowledgeBlockProposalRequestSchema,
    LearningBlockProposalInputSchema,
} from './knowledge-block-proposals';
const block = {
    id: randomUUID(),
    type: 'grammar',
    language: 'fr',
    rule: 'A rule',
};
describe('Structured block change proposals', () => {
    it('accepts an explicit single-block update and rejects ambiguous replacement groups', () => {
        const targetBlockId = randomUUID();
        expect(
            LearningBlockProposalInputSchema.parse({
                blocks: [block],
                targetBlockId,
            }).targetBlockId,
        ).toBe(targetBlockId);
        expect(
            LearningBlockProposalInputSchema.safeParse({
                blocks: [block, { ...block, id: randomUUID() }],
                targetBlockId,
            }).success,
        ).toBe(false);
    });
    it('makes add-separately an explicit apply mode without accepting foreign destination fields', () => {
        expect(
            ApplyKnowledgeBlockProposalRequestSchema.parse({
                expectedBranchVersion: 3,
                mode: 'add-separately',
            }).mode,
        ).toBe('add-separately');
        expect(
            ApplyKnowledgeBlockProposalRequestSchema.safeParse({
                expectedBranchVersion: 3,
                mode: 'replace-anything',
            }).success,
        ).toBe(false);
        expect(
            ApplyKnowledgeBlockProposalRequestSchema.safeParse({
                expectedBranchVersion: 3,
                noteId: randomUUID(),
            }).success,
        ).toBe(false);
    });
});
