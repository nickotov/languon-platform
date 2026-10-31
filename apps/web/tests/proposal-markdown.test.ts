import { describe, expect, it } from 'vitest';
import {
    parseProposalMarkdown,
    proposalPlainTextDocument,
    ProposalMarkdownError,
} from '../src/fsd/features/knowledge-notes/lib/proposal-markdown';

describe('chat Markdown proposal import', () => {
    it.each([
        '#',
        '-',
        '[](https://example.com)',
        'Prose [](https://example.com) continues.',
        'Prose\n\n[unused]: https://example.com',
        '# &#32;',
        '- &#32;',
        'Prefix [&#32;](https://example.com) suffix',
    ])(
        'requires literal fallback when an empty construct or unused definition would lose source: %s',
        (source) => {
            expect(() => parseProposalMarkdown(source)).toThrow(
                ProposalMarkdownError,
            );
            expect(JSON.stringify(proposalPlainTextDocument(source))).toContain(
                source.split('\n')[0],
            );
        },
    );

    it('retains meaningful multi-mark link labels with whitespace spans', () => {
        expect(() =>
            parseProposalMarkdown(
                '[ **meaningful** label ](https://example.com)',
            ),
        ).not.toThrow();
    });
    it('formats the French reply and maps unsupported heading levels', () => {
        const result = parseProposalMarkdown(
            '# Времена во французском: обзор с примерами\n\n\nФранцузская система строится на **времени** и *виде*.\n\n## 1. Настоящее\n\n### Exemple\n\n#### Détail',
        );
        expect(result.headingMapped).toBe(true);
        const nodes = result.document.content!;
        expect(
            nodes
                .filter((node) => node.type === 'heading')
                .map((node) => node.attrs?.level),
        ).toEqual([1, 2, 3, 3]);
        expect(
            nodes
                .flatMap((node) => node.content ?? [])
                .find((node) => node.text === 'времени')?.marks,
        ).toEqual([{ type: 'bold' }]);
        expect(
            nodes
                .flatMap((node) => node.content ?? [])
                .find((node) => node.text === 'виде')?.marks,
        ).toEqual([{ type: 'italic' }]);
    });

    it('supports nested lists, quotations, hard breaks and safe links', () => {
        const { document, headingMapped } = parseProposalMarkdown(
            '3. Trois\n   - **très** bien\n   - `mot`\n\n> Citation  \n> ligne [source](https://example.com/path?q=1&x=2)',
        );
        expect(headingMapped).toBe(false);
        expect(document.content?.[0]).toMatchObject({
            type: 'orderedList',
            attrs: { start: 3 },
        });
        const json = JSON.stringify(document);
        expect(json).toContain('bulletList');
        expect(json).toContain('hardBreak');
        expect(json).toContain('blockquote');
        expect(json).toContain('https://example.com/path?q=1&x=2');
    });

    it('supports editable rectangular tables and inline formatting', () => {
        const { document } = parseProposalMarkdown(
            '| Temps | Exemple |\n| --- | --- |\n| Présent | **Je parle** |\n| Passé | ~~Je vais~~ |',
        );
        expect(document.content?.[0]?.type).toBe('table');
        expect(document.content?.[0]?.content).toHaveLength(3);
        expect(JSON.stringify(document)).toContain('strike');
        expect(JSON.stringify(document)).toContain('bold');
    });

    it('reports normalized table alignment and link tooltips without losing visible content', () => {
        const result = parseProposalMarkdown(
            '| Left | Right |\n| :--- | ---: |\n| \\| pipe | [mot](https://example.com "Tooltip") |',
        );
        expect(result.formattingAdjusted).toBe(true);
        expect(JSON.stringify(result.document)).toContain('| pipe');
        expect(JSON.stringify(result.document)).toContain('mot');
        expect(JSON.stringify(result.document)).not.toContain('align');
        expect(parseProposalMarkdown('ordinary text').formattingAdjusted).toBe(
            false,
        );
    });

    it.each([
        '| A | B |\n| --- | --- |\n| one | two | lost |',
        '| A | B |\n| --- | --- |\n| one |',
    ])('rejects ragged table rows instead of truncating cells: %s', (text) => {
        expect(() => parseProposalMarkdown(text)).toThrow(
            ProposalMarkdownError,
        );
    });

    it('preserves extra blank paragraph spacing', () => {
        const { document } = parseProposalMarkdown('First\n\n\n\nSecond');
        expect(
            document.content?.map((node) => node.content?.[0]?.text ?? ''),
        ).toEqual(['First', '', 'Second']);
    });

    it('supports safe reference links and rejects code combined with other marks', () => {
        expect(
            JSON.stringify(
                parseProposalMarkdown(
                    '[mot][source]\n\n[source]: https://example.com',
                ).document,
            ),
        ).toContain('https://example.com');
        expect(() => parseProposalMarkdown('**`mot`**')).toThrow(
            ProposalMarkdownError,
        );
        expect(() =>
            parseProposalMarkdown('[`mot`](https://example.com)'),
        ).toThrow(ProposalMarkdownError);
    });

    it('preserves escapes, entities, ordinary math and multiline prose', () => {
        const { document } = parseProposalMarkdown(
            '\\# literal \\*stars\\* &amp; &lt;tag&gt; $x + y$\nnext line',
        );
        expect(document.content).toHaveLength(1);
        expect(document.content?.[0]?.content).toEqual([
            {
                type: 'text',
                text: '# literal *stars* & <tag> $x + y$\nnext line',
            },
        ]);
    });

    it.each([
        'Before\n\n```js\ncode\n```\n\nAfter',
        '    indented code',
        '![image](https://example.com/image.png)',
        '- [x] task',
        '<div>HTML</div>',
        'An inline <strong>tag</strong>',
        'Before\n\n<!-- comment -->\n\nAfter',
    ])('rejects unsupported content atomically: %s', (markdown) => {
        expect(() => parseProposalMarkdown(markdown)).toThrow(
            ProposalMarkdownError,
        );
        try {
            parseProposalMarkdown(markdown);
        } catch (error) {
            expect((error as ProposalMarkdownError).code).toBe('unsupported');
        }
    });

    it.each([
        '[click](javascript:alert%281%29)',
        '[click](data:text/html,payload)',
        '[click](https://user:password@example.com)',
        '[relative](/path)',
        '[mail](mailto:person@example.com)',
        '[reference][id]\n\n[id]: javascript:alert%281%29',
    ])('rejects unsafe links before parsing: %s', (markdown) => {
        try {
            parseProposalMarkdown(markdown);
            expect.fail('Unsafe link should fail');
        } catch (error) {
            expect(error).toBeInstanceOf(ProposalMarkdownError);
            expect((error as ProposalMarkdownError).code).toBe('unsafe-link');
        }
    });

    it('does not treat escaped unsupported syntax as markup', () => {
        expect(() =>
            parseProposalMarkdown('\\!\\[image\\] plain text \\<tag>'),
        ).not.toThrow();
    });

    it('provides an explicit literal fallback preserving blank paragraphs', () => {
        const document = proposalPlainTextDocument(
            '# Heading\r\n\r\n**bold**\n',
        );
        expect(document.content).toEqual([
            {
                type: 'paragraph',
                content: [{ type: 'text', text: '# Heading' }],
            },
            { type: 'paragraph' },
            {
                type: 'paragraph',
                content: [{ type: 'text', text: '**bold**' }],
            },
            { type: 'paragraph' },
        ]);
        expect(
            proposalPlainTextDocument('> '.repeat(20) + 'quote').content?.[0]
                ?.content?.[0]?.text,
        ).toBe('> '.repeat(20) + 'quote');
    });

    it('bounds input, nesting, tables and invalid Unicode without truncation', () => {
        for (const text of [
            'x'.repeat(80_001),
            '> '.repeat(30) + 'nested',
            '| A |\n| --- |\n' + '| row |\n'.repeat(21),
            '\u0000',
            '\ud800',
            '   ',
        ]) {
            expect(() => parseProposalMarkdown(text)).toThrow(
                ProposalMarkdownError,
            );
        }
        expect(() => parseProposalMarkdown('😀 accents é')).not.toThrow();
    });

    it('handles adversarial quote whitespace within the bounded input without a backtracking prefix regex', () => {
        const source = '>    '.repeat(12) + ' '.repeat(79_000);
        expect(() => parseProposalMarkdown(source)).toThrow(
            ProposalMarkdownError,
        );
        expect(() =>
            parseProposalMarkdown('>    '.repeat(13) + 'text'),
        ).toThrow(ProposalMarkdownError);
    });
});

it('preserves H1–H3 and horizontal rules while mapping only H4–H6', () => {
    const source = '# Title\n\n---\n\n## Section\n\n### Detail';
    const result = parseProposalMarkdown(source);
    expect(result.headingMapped).toBe(false);
    expect(result.document.content?.map((node) => node.type)).toEqual([
        'heading',
        'horizontalRule',
        'heading',
        'heading',
    ]);
    expect(
        result.document.content
            ?.filter((node) => node.type === 'heading')
            .map((node) => node.attrs?.level),
    ).toEqual([1, 2, 3]);
    const mapped = parseProposalMarkdown(
        '#### Four\n\n##### Five\n\n###### Six',
    );
    expect(mapped.headingMapped).toBe(true);
    expect(mapped.document.content?.map((node) => node.attrs?.level)).toEqual([
        3, 3, 3,
    ]);
});
