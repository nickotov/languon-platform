import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { KnowledgeBodySchema } from '@languon/contracts';
import { KnowledgeBody, KnowledgeEmbed } from '../src/fsd/entities/knowledge';
import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';
import { render } from './render';

afterEach(cleanup);

it.each(['imageEmbed', 'websiteEmbed'] as const)(
    'loads a saved %s only on request, expands it and retains an external fallback',
    (type) => {
        const src = 'https://lessons.example.org/resource';
        const body = KnowledgeBodySchema.parse({
            schemaVersion: 2,
            document: { type: 'doc', content: [{ type, attrs: { src } }] },
        });
        const { container } = render(<KnowledgeBody body={body} />);
        expect(container.querySelector('iframe, img')).toBeNull();
        expect(
            screen
                .getByRole('link', { name: 'Open in new tab' })
                .getAttribute('href'),
        ).toBe(src);

        fireEvent.click(screen.getByRole('button', { name: 'Load preview' }));
        if (type === 'websiteEmbed') {
            const frame = screen.getByTitle('Website · lessons.example.org');
            expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
            expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
            expect(frame.getAttribute('src')).toBe(
                '/knowledge-website-preview.html#' + encodeURIComponent(src),
            );
        } else {
            const image = screen.getByRole('img');
            expect(image.getAttribute('src')).toBe(src);
            expect(image.getAttribute('referrerpolicy')).toBe('no-referrer');
        }

        fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
        const dialog = screen.getByRole('dialog');
        expect(dialog.querySelector('iframe, img')).toBeTruthy();
        expect(
            within(dialog)
                .getByRole('link', { name: 'Open in new tab' })
                .getAttribute('rel'),
        ).toBe('noopener noreferrer');

        fireEvent.click(
            within(dialog).getByRole('button', { name: 'Close preview' }),
        );

        expect(screen.queryByRole('dialog')).toBeNull();
    },
);

it('keeps a source link for unavailable images and requests fresh consent after changing the source', () => {
    const { rerender } = render(
        <KnowledgeEmbed
            src='https://lessons.example.org/missing.png'
            type='imageEmbed'
        />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Load preview' }));
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('status').textContent).toContain(
        'could not be loaded',
    );

    expect(screen.getByRole('link').getAttribute('href')).toContain(
        'missing.png',
    );

    rerender(
        <I18nProvider locale='en' messages={en}>
            <KnowledgeEmbed
                src='https://other.example.org/image.png'
                type='imageEmbed'
            />
        </I18nProvider>,
    );

    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('button', { name: 'Load preview' })).toBeTruthy();
});

it('does not expose unvalidated editor URLs as links or subresource requests', () => {
    const { container } = render(
        <KnowledgeEmbed type='websiteEmbed' src='javascript:void(0)' />,
    );

    expect(container.querySelector('a, iframe, img')).toBeNull();
});
