import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatMarkdown } from '../src/fsd/widgets/contextual-assistant/ui/contextual-assistant/chat-markdown';

describe('tutor Markdown', () => {
    it('renders unfinished emphasis while streaming and the completed final answer', () => {
        const view = render(
            <ChatMarkdown content='Try **speaking slowly' streaming />,
        );
        expect(view.container.querySelector('strong')?.textContent).toBe(
            'speaking slowly',
        );
        view.rerender(<ChatMarkdown content='Try **speaking slowly**.' />);
        expect(view.container.textContent).toBe('Try speaking slowly.');
        expect(view.container.querySelector('strong')?.textContent).toBe(
            'speaking slowly',
        );
    });

    it('retains semantic lists, tables and inert code without interactive renderers', () => {
        const view = render(
            <ChatMarkdown
                content={
                    '- First\n- Second\n\n| Word | Meaning |\n| --- | --- |\n| Hola | Hello |\n\n```mermaid\ngraph TD; A-->B\n```'
                }
            />,
        );
        expect(screen.getAllByRole('listitem')).toHaveLength(2);
        expect(screen.getByRole('table')).toBeInTheDocument();
        expect(view.container.querySelector('pre code')?.textContent).toContain(
            'graph TD; A-->B',
        );
        expect(
            view.container.querySelector('svg, button, canvas, iframe'),
        ).toBeNull();
    });

    it('renders only safe absolute HTTP links with opener isolation', () => {
        render(
            <ChatMarkdown
                content={
                    '[safe](https://example.test/lesson) [http](http://example.test) [script](javascript:alert%281%29) [data](data:text/html,hello) [relative](/private) [email](mailto:me@example.test)'
                }
            />,
        );
        const links = screen.getAllByRole('link');
        expect(links).toHaveLength(2);
        expect(links[0]).toHaveAttribute('href', 'https://example.test/lesson');
        for (const link of links) {
            expect(link).toHaveAttribute('target', '_blank');
            expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        }
        expect(screen.getByText('script').closest('a')).toBeNull();
    });

    it.each([true, false])(
        'never mounts raw HTML, images, SVG, styles or remote embeds (streaming=%s)',
        (streaming) => {
            const view = render(
                <ChatMarkdown
                    content={
                        '<script>alert(1)</script>\n\n<iframe src="https://bad.test"></iframe>\n\n<img src="https://bad.test/x" onerror="alert(1)">\n\n<style>body{display:none}</style>\n\n<svg><use href="https://bad.test/x" /></svg>\n\n![tracking](https://bad.test/pixel.png)\n\n<span style="color:red" onclick="alert(1)">plain</span>'
                    }
                    streaming={streaming}
                />,
            );
            expect(
                view.container.querySelector(
                    'script, iframe, img, style, svg, video, audio, object, embed',
                ),
            ).toBeNull();
            expect(
                view.container.querySelector(
                    '[onclick], [onerror], [style*="color:red"]',
                ),
            ).toBeNull();
        },
    );

    it('keeps final Markdown exact and only animates active streaming text', () => {
        const view = render(<ChatMarkdown content='A **finished** answer.' />);
        expect(view.container.querySelector('[data-sd-animate]')).toBeNull();
        view.rerender(
            <ChatMarkdown
                content='A **finished** answer. More words'
                streaming
            />,
        );
        expect(
            view.container.querySelector('[data-sd-animate]'),
        ).not.toBeNull();
        expect(view.container.textContent).toBe(
            'A finished answer. More words',
        );
        view.rerender(<ChatMarkdown content='Unclosed **literal' />);
        expect(view.container.textContent).toBe('Unclosed **literal');
        expect(view.container.querySelector('[data-sd-animate]')).toBeNull();
    });

    it('keeps incomplete link destinations inert until the destination is complete', () => {
        const view = render(
            <ChatMarkdown
                content='Read [this lesson](https://example.test/les'
                streaming
            />,
        );
        expect(screen.queryByRole('link')).toBeNull();
        view.rerender(
            <ChatMarkdown content='Read [this lesson](https://example.test/lesson)' />,
        );
        expect(screen.getByRole('link')).toHaveAttribute(
            'href',
            'https://example.test/lesson',
        );
    });
});
