import { describe, expect, it } from 'vitest';
import {
    KnowledgeBodySchema,
    KnowledgeDraftSchema,
    KnowledgeLinkSchema,
    KnowledgeNoteContentSchema,
    type KnowledgeNode,
    CopiedAttachmentSchema,
    SubmitConversationTurnRequestSchema,
    ConversationToolCallSchema,
} from '../src/contextual-assistant';
const paragraph: KnowledgeNode = {
    type: 'paragraph',
    content: [
        { type: 'text', text: 'El subjuntivo', marks: [{ type: 'italic' }] },
    ],
};
const body = {
    schemaVersion: 1 as const,
    document: { type: 'doc' as const, content: [paragraph] },
};
const content = {
    title: 'Subjunctive mood',
    summary: 'How uncertainty changes the verb.',
    body,
    categories: ['grammar'],
    studiedLanguage: 'es',
    explanationLanguage: 'en',
};
describe('contextual assistant rich content contracts', () => {
    it('rejects invalid persisted chat text and exposes only sanitized tool lifecycle', () => {
        const id = '00000000-0000-4000-8000-000000000001';
        for (const text of ['bad\u0000text', 'bad\uD800text']) {
            expect(
                SubmitConversationTurnRequestSchema.safeParse({
                    requestId: id,
                    content: text,
                }).success,
            ).toBe(false);
            expect(
                CopiedAttachmentSchema.safeParse({
                    id,
                    label: 'Copied passage',
                    content: text,
                }).success,
            ).toBe(false);
        }
        expect(
            SubmitConversationTurnRequestSchema.safeParse({
                requestId: id,
                content: 'Explain مرحباً 👋',
            }).success,
        ).toBe(true);
        expect(
            ConversationToolCallSchema.safeParse({
                id: 'tool-1',
                name: 'read_source_context',
                state: 'running',
            }).success,
        ).toBe(true);
        expect(
            ConversationToolCallSchema.safeParse({
                id: 'tool-1',
                name: 'read_source_context',
                state: 'succeeded',
                arguments: { shareKey: 'private' },
            }).success,
        ).toBe(false);
    });
    it('retains meaningful language examples and a rectangular comparison table', () => {
        const rich = {
            ...body,
            document: {
                type: 'doc',
                content: [
                    paragraph,
                    {
                        type: 'table',
                        content: [
                            {
                                type: 'tableRow',
                                content: [
                                    {
                                        type: 'tableHeader',
                                        attrs: {
                                            colspan: 1,
                                            rowspan: 1,
                                            colwidth: null,
                                        },
                                        content: [paragraph],
                                    },
                                    { type: 'tableCell', content: [paragraph] },
                                ],
                            },
                        ],
                    },
                ],
            },
        };
        expect(KnowledgeBodySchema.parse(rich)).toEqual(rich);
    });
    it.each([
        'javascript:alert(1)',
        'data:text/html,x',
        '//example.test',
        'https://user:password@example.test',
        'https://example.test/\nfoo',
    ])('rejects unsafe link %s', (href) => {
        expect(KnowledgeLinkSchema.safeParse(href).success).toBe(false);
    });
    it('allows absolute web links without interpreting strings as markup', () => {
        expect(
            KnowledgeLinkSchema.parse(
                'https://example.test/grammar?q=%E3%81%AF',
            ),
        ).toContain('https:');
        expect(
            KnowledgeBodySchema.parse({
                ...body,
                document: {
                    type: 'doc',
                    content: [
                        {
                            type: 'paragraph',
                            content: [
                                {
                                    type: 'text',
                                    text: '<script>ignored markup</script>',
                                },
                            ],
                        },
                    ],
                },
            }),
        ).toBeDefined();
    });
    it.each([
        { type: 'image', attrs: { src: 'https://example.test/a.png' } },
        { type: 'heading', attrs: { level: 1 }, content: [] },
        { type: 'paragraph', attrs: { onclick: 'x' }, content: [] },
        { type: 'paragraph', content: [{ type: 'doc', content: [paragraph] }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'a\u0000b' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '\ud800' }] },
    ])('rejects unsupported or invalid document nodes', (node) => {
        expect(
            KnowledgeBodySchema.safeParse({
                ...body,
                document: { type: 'doc', content: [node] },
            }).success,
        ).toBe(false);
    });
    it('bounds malicious recursion before recursive schema validation', () => {
        let node: KnowledgeNode = paragraph;
        for (let i = 0; i < 2_000; i++)
            node = { type: 'blockquote', content: [node] };
        expect(
            KnowledgeBodySchema.safeParse({
                ...body,
                document: { type: 'doc', content: [node] },
            }).success,
        ).toBe(false);
    });
    it('rejects malformed tables and indirect nested tables', () => {
        const cell = { type: 'tableCell', content: [paragraph] };
        const table = {
            type: 'table',
            content: [
                { type: 'tableRow', content: [cell] },
                { type: 'tableRow', content: [cell, cell] },
            ],
        };
        expect(
            KnowledgeBodySchema.safeParse({
                ...body,
                document: { type: 'doc', content: [table] },
            }).success,
        ).toBe(false);
        const nested = {
            type: 'table',
            content: [
                {
                    type: 'tableRow',
                    content: [
                        {
                            type: 'tableCell',
                            content: [
                                paragraph,
                                {
                                    type: 'blockquote',
                                    content: [
                                        {
                                            type: 'table',
                                            content: [
                                                {
                                                    type: 'tableRow',
                                                    content: [cell],
                                                },
                                            ],
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        };
        expect(
            KnowledgeBodySchema.safeParse({
                ...body,
                document: { type: 'doc', content: [nested] },
            }).success,
        ).toBe(false);
    });
    it('requires unique categories and paired update target/version', () => {
        expect(
            KnowledgeNoteContentSchema.safeParse({
                ...content,
                categories: ['grammar', 'grammar'],
            }).success,
        ).toBe(false);
        const draft = {
            id: '00000000-0000-4000-8000-000000000001',
            conversationId: '00000000-0000-4000-8000-000000000002',
            version: 1,
            targetNoteId: null,
            expectedNoteVersion: null,
            content,
            createdAt: '2026-10-19T00:00:00.000Z',
            updatedAt: '2026-10-19T00:00:00.000Z',
        };
        expect(KnowledgeDraftSchema.safeParse(draft).success).toBe(true);
        expect(
            KnowledgeDraftSchema.safeParse({ ...draft, expectedNoteVersion: 1 })
                .success,
        ).toBe(false);
    });
});

describe('immutable typed copied dictionary cards', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const card = {
        source: 'مرحبا',
        translation: 'Hello',
        sourceLanguage: 'ar',
        targetLanguage: 'en',
        definition: 'تحية',
        definitionLanguage: 'ar',
        transcription: 'marḥaban',
        transcriptionNotation: 'romanization',
        example: 'مرحبا يا صديقي',
        exampleLanguage: 'ar',
        exampleTranslation: 'Hello, my friend',
        exampleTranslationLanguage: 'en',
    };
    it('preserves legacy and pasted text without inferring structure from JSON-looking content', () => {
        const legacy = {
            id,
            label: 'Copied passage',
            content: JSON.stringify(card),
        };
        expect(CopiedAttachmentSchema.parse(legacy)).toEqual(legacy);
        expect(
            CopiedAttachmentSchema.parse({ ...legacy, kind: 'text' }).kind,
        ).toBe('text');
    });
    it('validates all copied fields and languages and keeps model text equal to the visible snapshot', () => {
        const copy = {
            id,
            label: card.source,
            kind: 'dictionary-card',
            card,
            content: JSON.stringify(card),
        };
        expect(CopiedAttachmentSchema.parse(copy)).toEqual(copy);
        const reordered = Object.fromEntries(Object.entries(card).reverse());
        expect(
            CopiedAttachmentSchema.safeParse({
                ...copy,
                content: JSON.stringify(reordered),
            }).success,
        ).toBe(true);
        expect(
            CopiedAttachmentSchema.safeParse({
                ...copy,
                content: JSON.stringify({ ...card, translation: 'Different' }),
            }).success,
        ).toBe(false);
        expect(
            CopiedAttachmentSchema.safeParse({
                ...copy,
                card: { ...card, definitionLanguage: undefined },
            }).success,
        ).toBe(false);
        expect(
            CopiedAttachmentSchema.safeParse({
                ...copy,
                card: { ...card, hiddenInstructions: 'arbitrary' },
            }).success,
        ).toBe(false);
        expect(
            CopiedAttachmentSchema.safeParse({
                ...copy,
                card: { ...card, sourceLanguage: 'ar" onclick="bad' },
            }).success,
        ).toBe(false);
    });
    it('retains copied snapshots independently of later live card edits and permits multiple attachments', () => {
        const liveCard = { ...card };
        const first = CopiedAttachmentSchema.parse({
            id,
            label: card.source,
            kind: 'dictionary-card',
            card: liveCard,
            content: JSON.stringify(liveCard),
        });
        const second = CopiedAttachmentSchema.parse({
            ...first,
            id: '00000000-0000-4000-8000-000000000002',
        });
        const turn = SubmitConversationTurnRequestSchema.parse({
            requestId: id,
            content: 'Compare these words.',
            attachments: [first, second],
        });
        liveCard.source = 'A changed live source';
        expect(liveCard.source).not.toBe(card.source);
        expect(turn.attachments).toHaveLength(2);
        expect(turn.attachments[0]).toMatchObject({
            kind: 'dictionary-card',
            card: { source: 'مرحبا', definition: 'تحية' },
        });
    });
});
