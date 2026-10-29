import { describe, expect, it } from 'vitest';
import {
    InteractiveKnowledgeBodySchema,
    KnowledgeBodySchema,
    LegacyKnowledgeBodySchema,
    LegacyKnowledgeNoteContentSchema,
} from './contextual-assistant';

const audioId = '00000000-0000-4000-8000-000000000001';
const segmentId = '00000000-0000-4000-8000-000000000002';
const exerciseId = '00000000-0000-4000-8000-000000000003';
const audio = {
    type: 'audio',
    id: audioId,
    assetId: '00000000-0000-4000-8000-000000000004',
    transcript: {
        language: 'en',
        segments: [{ id: segmentId, text: 'A cat is sleeping.' }],
    },
};
const exercise = {
    type: 'exercise',
    id: exerciseId,
    format: 'free-text',
    question: 'What is sleeping?',
    referenceAnswer: 'A cat',
    explanation: 'The transcript names a cat.',
    source: { blockId: audioId, segmentIds: [segmentId] },
};
const node = (block: unknown) => ({ type: 'learningBlock', attrs: { block } });
const body = (content: unknown[]) => ({
    schemaVersion: 2,
    document: { type: 'doc', content },
});
const paragraph = {
    type: 'paragraph',
    content: [{ type: 'text', text: 'Hello' }],
};

describe('interactive knowledge document compatibility and safety', () => {
    it('retains v1 round trips unchanged', () => {
        const legacy = {
            schemaVersion: 1,
            document: { type: 'doc', content: [paragraph] },
        };
        expect(KnowledgeBodySchema.parse(legacy)).toEqual(legacy);
        expect(LegacyKnowledgeBodySchema.parse(legacy)).toEqual(legacy);
    });
    it('round trips mixed prose and typed learning blocks', () => {
        const input = body([paragraph, node(audio), node(exercise)]);
        expect(KnowledgeBodySchema.parse(input)).toEqual(input);
    });
    it('allows a source block later in the document', () => {
        expect(
            InteractiveKnowledgeBodySchema.safeParse(
                body([node(exercise), node(audio)]),
            ).success,
        ).toBe(true);
    });
    it('keeps legacy proposal authority constrained to v1', () => {
        expect(
            LegacyKnowledgeBodySchema.safeParse(body([node(audio)])).success,
        ).toBe(false);
        expect(
            LegacyKnowledgeNoteContentSchema.safeParse({
                title: 'Test',
                summary: '',
                categories: [],
                studiedLanguage: null,
                explanationLanguage: null,
                body: body([node(audio)]),
            }).success,
        ).toBe(false);
        expect(
            KnowledgeBodySchema.safeParse({
                schemaVersion: 1,
                document: { type: 'doc', content: [node(audio)] },
            }).success,
        ).toBe(false);
    });
    it('rejects duplicate block identities', () => {
        expect(
            KnowledgeBodySchema.safeParse(body([node(audio), node(audio)]))
                .success,
        ).toBe(false);
    });
    it('rejects missing and wrong-type exercise source references', () => {
        expect(
            KnowledgeBodySchema.safeParse(body([node(exercise)])).success,
        ).toBe(false);
        const wrong = {
            type: 'grammar',
            id: audioId,
            language: 'en',
            rule: 'A rule',
        };
        expect(
            KnowledgeBodySchema.safeParse(body([node(wrong), node(exercise)]))
                .success,
        ).toBe(false);
    });
    it('rejects nonexistent source segments', () => {
        const invalid = {
            ...exercise,
            source: { blockId: audioId, segmentIds: [exerciseId] },
        };
        expect(
            KnowledgeBodySchema.safeParse(body([node(audio), node(invalid)]))
                .success,
        ).toBe(false);
    });
    it('rejects blocks nested in prose containers', () => {
        for (const container of [
            'paragraph',
            'blockquote',
            'listItem',
            'tableCell',
        ]) {
            expect(
                KnowledgeBodySchema.safeParse(
                    body([{ type: container, content: [node(audio)] }]),
                ).success,
            ).toBe(false);
        }
    });
    it('rejects arbitrary attrs and child content on atomic blocks', () => {
        expect(
            KnowledgeBodySchema.safeParse(
                body([{ ...node(audio), content: [paragraph] }]),
            ).success,
        ).toBe(false);
        expect(
            KnowledgeBodySchema.safeParse(
                body([
                    {
                        type: 'learningBlock',
                        attrs: { block: audio, onclick: 'alert(1)' },
                    },
                ]),
            ).success,
        ).toBe(false);
        expect(
            KnowledgeBodySchema.safeParse(
                body([node({ ...audio, html: '<script>alert(1)</script>' })]),
            ).success,
        ).toBe(false);
    });
    it('preserves literal markup as text while rejecting executable media URLs', () => {
        const literal = body([
            {
                type: 'paragraph',
                content: [{ type: 'text', text: '<script>alert(1)</script>' }],
            },
        ]);
        expect(KnowledgeBodySchema.parse(literal)).toEqual(literal);
        expect(
            KnowledgeBodySchema.safeParse(
                body([
                    node({
                        id: audioId,
                        type: 'video',
                        source: { kind: 'url', url: 'javascript:alert(1)' },
                    }),
                ]),
            ).success,
        ).toBe(false);
    });
    it('bounds cumulative block payload before recursive parsing', () => {
        const grammar = (id: string) =>
            node({
                type: 'grammar',
                id,
                language: 'en',
                rule: 'x'.repeat(8_000),
            });
        const blocks = Array.from({ length: 21 }, (_, index) =>
            grammar(
                `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
            ),
        );
        expect(KnowledgeBodySchema.safeParse(body(blocks)).success).toBe(false);
    });
    it('rejects cyclic inputs and invalid prose topology without stack overflow', () => {
        const cyclic: { type: string; content: unknown[] } = {
            type: 'doc',
            content: [],
        };
        cyclic.content.push(cyclic);
        expect(
            InteractiveKnowledgeBodySchema.safeParse({
                schemaVersion: 2,
                document: cyclic,
            }).success,
        ).toBe(false);
        expect(
            KnowledgeBodySchema.safeParse(
                body([{ type: 'heading', attrs: { level: 9 }, content: [] }]),
            ).success,
        ).toBe(false);
    });
});
