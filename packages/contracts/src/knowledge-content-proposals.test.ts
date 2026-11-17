import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
    ApplyKnowledgeContentProposalRequestSchema,
    LearningContentProposalInputSchema,
    KnowledgeContentProposalSchema,
} from './knowledge-content-proposals';
import { ProseKnowledgeBodySchema } from './contextual-assistant';
const block = {
    id: randomUUID(),
    type: 'grammar',
    language: 'fr',
    rule: 'A rule',
};
const body = (blocks: unknown[]) => ({
    schemaVersion: 2,
    document: {
        type: 'doc',
        content: blocks.map((block) => ({
            type: 'learningBlock',
            attrs: { block },
        })),
    },
});
const paragraph = {
    type: 'paragraph',
    content: [{ type: 'text', text: 'Read this introduction.' }],
};
const proposal = (content: unknown[]) => ({
    id: randomUUID(),
    conversationId: randomUUID(),
    noteId: randomUUID(),
    branchId: randomUUID(),
    baseBranchVersion: 1,
    body: { schemaVersion: 2, document: { type: 'doc', content } },
    createdAt: new Date().toISOString(),
    appliedAt: null,
    appliedBranchVersion: null,
});

describe('Structured block change proposals', () => {
    it('allows a bounded cursor only when adding an independent copy', () => {
        expect(
            ApplyKnowledgeContentProposalRequestSchema.parse({
                expectedBranchVersion: 3,
                mode: 'add-separately',
                insertionPosition: 12,
            }).insertionPosition,
        ).toBe(12);

        for (const candidate of [
            { expectedBranchVersion: 3, insertionPosition: 12 },
            {
                expectedBranchVersion: 3,
                mode: 'proposal',
                insertionPosition: 12,
            },
            {
                expectedBranchVersion: 3,
                mode: 'add-separately',
                insertionPosition: -1,
            },
            {
                expectedBranchVersion: 3,
                mode: 'add-separately',
                insertionPosition: 1.5,
            },
        ]) {
            expect(
                ApplyKnowledgeContentProposalRequestSchema.safeParse(candidate)
                    .success,
            ).toBe(false);
        }
    });

    it('accepts an explicit single-block update and rejects ambiguous replacement groups', () => {
        const targetBlockId = randomUUID();
        expect(
            LearningContentProposalInputSchema.parse({
                body: body([block]),
                targetBlockId,
            }).targetBlockId,
        ).toBe(targetBlockId);

        expect(
            LearningContentProposalInputSchema.safeParse({
                body: body([block, { ...block, id: randomUUID() }]),
                targetBlockId,
            }).success,
        ).toBe(false);
    });

    it('makes add-separately an explicit apply mode without accepting foreign destination fields', () => {
        expect(
            ApplyKnowledgeContentProposalRequestSchema.parse({
                expectedBranchVersion: 3,
                mode: 'add-separately',
            }).mode,
        ).toBe('add-separately');

        expect(
            ApplyKnowledgeContentProposalRequestSchema.safeParse({
                expectedBranchVersion: 3,
                mode: 'replace-anything',
            }).success,
        ).toBe(false);

        expect(
            ApplyKnowledgeContentProposalRequestSchema.safeParse({
                expectedBranchVersion: 3,
                noteId: randomUUID(),
            }).success,
        ).toBe(false);
    });

    it('preserves mixed order while retaining narrow replacement and prose writer authority', () => {
        const nodes = [
            paragraph,
            ...body([block]).document.content,
            { type: 'horizontalRule' },
        ];
        const mixed = proposal(nodes);

        expect(
            KnowledgeContentProposalSchema.parse(mixed).body.document.content,
        ).toEqual(nodes);

        expect(
            LearningContentProposalInputSchema.safeParse({
                body: mixed.body,
                targetBlockId: block.id,
            }).success,
        ).toBe(false);

        expect(
            KnowledgeContentProposalSchema.safeParse({
                ...mixed,
                target: { blockId: block.id, blockHash: 'a'.repeat(64) },
            }).success,
        ).toBe(false);

        expect(ProseKnowledgeBodySchema.safeParse(mixed.body).success).toBe(
            false,
        );

        expect(
            LearningContentProposalInputSchema.safeParse({ blocks: [block] })
                .success,
        ).toBe(false);

        expect(
            LearningContentProposalInputSchema.safeParse({
                body: mixed.body,
                title: 'New title',
            }).success,
        ).toBe(false);
    });

    it('rejects unsafe topology and more than 25 custom blocks', () => {
        expect(
            LearningContentProposalInputSchema.safeParse({
                body: body(
                    Array.from({ length: 26 }, () => ({
                        ...block,
                        id: randomUUID(),
                    })),
                ),
            }).success,
        ).toBe(false);

        expect(
            KnowledgeContentProposalSchema.safeParse(
                proposal([{ type: 'html', text: '<script>bad()</script>' }]),
            ).success,
        ).toBe(false);

        expect(
            KnowledgeContentProposalSchema.safeParse(
                proposal([
                    {
                        type: 'paragraph',
                        content: body([block]).document.content,
                    },
                ]),
            ).success,
        ).toBe(false);
    });

    it('includes frozen dependencies in the serialized aggregate bound', () => {
        const dependencies = Array.from({ length: 25 }, () => ({
            ...block,
            id: randomUUID(),
            rule: 'x'.repeat(4_000),
        }));

        expect(
            KnowledgeContentProposalSchema.safeParse({
                ...proposal([paragraph]),
                dependencies,
            }).success,
        ).toBe(false);

        expect(
            KnowledgeContentProposalSchema.safeParse({
                ...proposal([paragraph]),
                dependencies: dependencies.slice(0, 2),
            }).success,
        ).toBe(true);
    });

    it('resolves fragment references only against captured dependencies in persisted proposals', () => {
        const segmentId = randomUUID();
        const parent = {
            id: randomUUID(),
            type: 'bilingual-text',
            language: 'fr',
            segments: [{ id: segmentId, text: 'Bonjour' }],
            translations: [
                {
                    language: 'ru',
                    segments: [{ sourceSegmentId: segmentId, text: 'Привет' }],
                },
            ],
        };
        const exercise = {
            id: randomUUID(),
            type: 'exercise',
            format: 'free-text',
            question: 'What does it mean?',
            referenceAnswer: 'Hello',
            explanation: 'A greeting.',
            source: {
                blockId: parent.id,
                segmentIds: [parent.segments[0]!.id],
            },
        };
        const value = proposal(body([exercise]).document.content);

        expect(
            LearningContentProposalInputSchema.safeParse({ body: value.body })
                .success,
        ).toBe(true);

        expect(KnowledgeContentProposalSchema.safeParse(value).success).toBe(
            false,
        );

        expect(
            KnowledgeContentProposalSchema.safeParse({
                ...value,
                dependencies: [parent],
            }).success,
        ).toBe(true);
    });
});
