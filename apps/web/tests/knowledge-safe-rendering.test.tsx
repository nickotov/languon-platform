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
