import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { KnowledgeBodySchema } from '@languon/contracts';
import { KnowledgeBody } from '../src/fsd/entities/knowledge/ui/knowledge-body/knowledge-body';

it('renders validated Tiptap text and safe links without interpreting stored markup', () => {
    const body = KnowledgeBodySchema.parse({
        schemaVersion: 1,
        document: {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        { type: 'text', text: '<img src=x onerror=alert(1)>' },
                        {
                            type: 'text',
                            text: '辞書',
                            marks: [
                                {
                                    type: 'link',
                                    attrs: { href: 'https://example.org/word' },
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    });
    const html = renderToStaticMarkup(
        <KnowledgeBody body={body} language='ja' />,
    );
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img');
    expect(html).toContain('href="https://example.org/word"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('dir="auto"');
    expect(html).toContain('lang="ja"');
});

it('rejects executable document nodes and URLs at the renderer boundary', () => {
    for (const node of [
        { type: 'script', text: 'alert(1)' },
        { type: 'paragraph', attrs: { onclick: 'alert(1)' } },
        {
            type: 'paragraph',
            content: [
                {
                    type: 'text',
                    text: 'Click',
                    marks: [
                        {
                            type: 'link',
                            attrs: { href: 'javascript:alert(1)' },
                        },
                    ],
                },
            ],
        },
    ]) {
        expect(() =>
            KnowledgeBodySchema.parse({
                schemaVersion: 1,
                document: { type: 'doc', content: [node] },
            }),
        ).toThrow();
    }
});

it('renders all supported heading levels and a safe leaf separator in static reading', () => {
    const body = KnowledgeBodySchema.parse({
        schemaVersion: 1,
        document: {
            type: 'doc',
            content: [
                ...[1, 2, 3].map((level) => ({
                    type: 'heading',
                    attrs: { level },
                    content: [{ type: 'text', text: `Level ${level}` }],
                })),
                { type: 'horizontalRule' },
            ],
        },
    });
    const html = renderToStaticMarkup(<KnowledgeBody body={body} />);
    expect(html).toContain('<h1 dir="auto">Level 1</h1>');
    expect(html).toContain('<h2 dir="auto">Level 2</h2>');
    expect(html).toContain('<h3 dir="auto">Level 3</h3>');
    expect(html).toContain('<hr/>');
});
