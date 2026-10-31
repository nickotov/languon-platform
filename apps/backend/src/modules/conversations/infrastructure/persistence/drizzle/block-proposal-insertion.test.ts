import { describe, expect, it } from 'vitest';
import type { KnowledgeNode, LearningBlock } from '@languon/contracts';
import { insertProposalBlocks } from './block-proposal-insertion';

const grammar: LearningBlock = {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'grammar',
    language: 'fr',
    rule: 'Use the subjunctive.',
};
const paragraph = (text: string): KnowledgeNode => ({
    type: 'paragraph',
    content: [{ type: 'text', text, marks: [{ type: 'bold' }] }],
});
describe('Proposal insertion positions', () => {
    it('counts a horizontal rule as one atomic PM position and preserves H1 at adjacent insertions', () => {
        const heading: KnowledgeNode = {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'A' }],
        };
        const rule: KnowledgeNode = { type: 'horizontalRule' };
        const original: KnowledgeNode = {
            type: 'doc',
            content: [heading, rule, paragraph('B')],
        };
        for (const position of [3, 4]) {
            const result = insertProposalBlocks(original, [grammar], position);
            const insertedIndex = position === 3 ? 1 : 2;
            expect(result.content?.[insertedIndex]?.type).toBe('learningBlock');
            expect(
                result.content?.filter((node) => node.type !== 'learningBlock'),
            ).toEqual(original.content);
        }
        expect(
            insertProposalBlocks(original, [grammar], 7).content?.at(-1)?.type,
        ).toBe('learningBlock');
    });
    it('splits prose at the exact PM offset while preserving marks and surrounding nodes', () => {
        const original: KnowledgeNode = {
            type: 'doc',
            content: [paragraph('Bonjour monde'), paragraph('Following')],
        };
        const inserted = insertProposalBlocks(original, [grammar], 8);
        expect(inserted.content?.map((node) => node.type)).toEqual([
            'paragraph',
            'learningBlock',
            'paragraph',
            'paragraph',
        ]);
        expect(inserted.content?.[0]).toEqual(paragraph('Bonjour'));
        expect(inserted.content?.[2]).toEqual(paragraph(' monde'));
        expect(inserted.content?.[3]).toEqual(original.content?.[1]);
        expect(original.content).toHaveLength(2);
    });
    it('supports document boundaries without replacing existing content', () => {
        const original: KnowledgeNode = {
            type: 'doc',
            content: [paragraph('Hello')],
        };
        expect(
            insertProposalBlocks(original, [grammar], 0).content?.[0]?.type,
        ).toBe('learningBlock');
        expect(
            insertProposalBlocks(original, [grammar], 7).content?.[1]?.type,
        ).toBe('learningBlock');
    });
    it('rejects stale/out-of-range offsets and surrogate-pair interiors', () => {
        const original: KnowledgeNode = {
            type: 'doc',
            content: [paragraph('😀')],
        };
        for (const position of [-1, 1.5, 2, 9])
            expect(() =>
                insertProposalBlocks(original, [grammar], position),
            ).toThrow('insertion cursor');
    });
    it('rejects a position between members of the same exercise group', () => {
        const group = { id: '22222222-2222-4222-8222-222222222222' };
        const exercise = (id: string): KnowledgeNode => ({
            type: 'learningBlock',
            attrs: {
                block: {
                    id,
                    type: 'exercise',
                    format: 'free-text',
                    question: 'Why?',
                    referenceAnswer: 'Because',
                    explanation: 'Reason',
                    group,
                },
            },
        });
        const original: KnowledgeNode = {
            type: 'doc',
            content: [
                exercise('33333333-3333-4333-8333-333333333333'),
                { type: 'paragraph' },
                exercise('44444444-4444-4444-8444-444444444444'),
            ],
        };
        for (const position of [1, 2, 3])
            expect(() =>
                insertProposalBlocks(original, [grammar], position),
            ).toThrow('exercise group');
    });
    it('lifts a valid quotation split without losing its original text', () => {
        const original: KnowledgeNode = {
            type: 'doc',
            content: [
                { type: 'blockquote', content: [paragraph('Quoted words')] },
            ],
        };
        const result = insertProposalBlocks(original, [grammar], 8);
        expect(result.content?.map((node) => node.type)).toEqual([
            'blockquote',
            'learningBlock',
            'blockquote',
        ]);
        expect(result.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe(
            'Quoted',
        );
        expect(result.content?.[2]?.content?.[0]?.content?.[0]?.text).toBe(
            ' words',
        );
    });
});
