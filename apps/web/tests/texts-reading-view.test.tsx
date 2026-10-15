import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from './render';
import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';
import { CounterpartSheet } from '@/fsd/features/text-reading/ui/text-reading/counterpart-sheet';
import { TextReading } from '@/fsd/features/text-reading';
import type { ReadingDocument } from '@/fsd/features/text-reading';
const pair = '54b51acb-320e-4ea9-86f3-0d4502349b89';
const document: ReadingDocument = {
    id: pair,
    version: 1,
    status: 'translated',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    sourceText: '  One sentence.\n\n',
    alignment: {
        source: [
            {
                pairId: pair,
                text: '  One sentence.\n\n',
                startOffset: 0,
                endOffset: 17,
                paragraphIndex: 0,
            },
        ],
        translation: [{ pairId: pair, text: 'Одно предложение.' }],
        editedPairIds: [pair],
    },
};
beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: vi.fn().mockReturnValue({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }),
    });
});
describe('aligned reading surface', () => {
    it('keeps structural paragraph whitespace out of lexical spans and matches both sides from keyboard focus', () => {
        const { container } = render(
            <TextReading
                collectionActorKey='user-a'
                document={document}
                matchMode
            />,
        );
        const source = container.querySelector<HTMLElement>(
            '[data-side="source"]',
        )!;
        const target = container.querySelector<HTMLElement>(
            '[data-side="translation"]',
        )!;
        expect(source.textContent).toBe('One sentence.');
        expect(document.sourceText).toBe('  One sentence.\n\n');
        fireEvent.focus(source);
        expect(source.className).toMatch(/active/);
        expect(target.className).toMatch(/active/);
        expect(
            screen.getByText('Matched Translation: Одно предложение.'),
        ).toBeInTheDocument();
        fireEvent.blur(source);
        fireEvent.focus(target);
        expect(source.className).toMatch(/active/);
        expect(target.className).toMatch(/active/);
    });
    it('clears matching and keyboard stops when Match is turned off', () => {
        const { container, rerender } = render(
            <TextReading
                collectionActorKey='user-a'
                document={document}
                matchMode
            />,
        );
        fireEvent.focus(container.querySelector('[data-side="source"]')!);
        // Preserve the real provider during rerender through the helper wrapper.
        rerender(
            <I18nProvider locale='en' messages={en}>
                <TextReading
                    collectionActorKey='user-a'
                    document={document}
                    matchMode={false}
                />
            </I18nProvider>,
        );
        const spans = container.querySelectorAll('[data-reading-pair]');
        spans.forEach((span) => {
            expect(span).not.toHaveAttribute('tabindex');
            expect(span.className).not.toMatch(/active/);
        });
    });
    it('hosts selection actions inside their native workspace dialog and keeps selection when opening the picker', async () => {
        const { container } = render(
            <dialog open>
                <TextReading
                    collectionActorKey='user-a'
                    document={document}
                    source={{
                        kind: 'owned-text',
                        textId: pair,
                        expectedTextVersion: 1,
                    }}
                    matchMode={false}
                />
            </dialog>,
        );
        const workspace = container.querySelector('dialog')!;
        const source = container.querySelector('[data-side="source"]')!;
        const range = window.document.createRange();
        range.setStart(source.firstChild!, 0);
        range.setEnd(source.firstChild!, 3);
        range.getBoundingClientRect = () =>
            ({ top: 80, left: 100, width: 30, height: 20 }) as DOMRect;
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        fireEvent(window.document, new Event('selectionchange'));
        const trigger = await screen.findByRole('button', {
            name: 'Add to dictionary',
        });
        expect(workspace).toContainElement(trigger);
        fireEvent.mouseDown(trigger);
        fireEvent.click(trigger);
        expect(
            await screen.findByRole('button', { name: 'Sign in and continue' }),
        ).toBeInTheDocument();
        expect(workspace).toContainElement(
            screen.getByRole('button', { name: 'Sign in and continue' }),
        );
        expect(
            screen.getByText(
                'Save “One” with its contextual meaning to your dictionary.',
            ),
        ).toBeInTheDocument();
        selection.removeAllRanges();
    });
    it('renders one sentence join and one paragraph gap while keeping edited markers inline with lexical translation', () => {
        const pairs = [
            {
                pairId: 'first',
                text: 'One. ',
                paragraphIndex: 0,
                startOffset: 0,
                endOffset: 5,
            },
            {
                pairId: 'second',
                text: 'Two.\n\n',
                paragraphIndex: 0,
                startOffset: 5,
                endOffset: 11,
            },
            {
                pairId: 'third',
                text: '  Three.\n\n',
                paragraphIndex: 1,
                startOffset: 11,
                endOffset: 21,
            },
        ];
        const translations = [
            { pairId: 'first', text: 'Один. ' },
            { pairId: 'second', text: 'Два.\n\n' },
            { pairId: 'third', text: 'Три.\n\n' },
        ];
        const original = pairs.map((item) => item.text).join('');
        const value: ReadingDocument = {
            ...document,
            sourceText: original,
            alignment: {
                source: pairs,
                translation: translations,
                editedPairIds: ['second'],
            },
        };
        const { container } = render(
            <TextReading
                collectionActorKey='user-a'
                document={value}
                matchMode={false}
            />,
        );
        const source = container.querySelector(
            '[data-reading-pair="second"][data-side="source"]',
        )!;
        const translation = container.querySelector(
            '[data-reading-pair="second"][data-side="translation"]',
        )!;
        expect(source.parentElement?.textContent).toBe('One. Two.');
        expect(translation.parentElement?.textContent).toBe('Один. Два.');
        expect(translation.textContent).toBe('Два.');
        expect(translation.nextElementSibling).toContainElement(
            screen.getByLabelText('Edited after translation'),
        );
        expect(
            container.querySelector(
                '[data-reading-pair="third"][data-side="source"]',
            )?.parentElement?.textContent,
        ).toBe('  Three.');
        expect(value.sourceText).toBe(original);
        expect(value.alignment?.source[1]?.text).toBe('Two.\n\n');
    });
    it('preserves zero-space CJK joins and repeated intra-paragraph spaces without inventing separators', () => {
        const pairs = [
            {
                pairId: 'a',
                text: '第一句。',
                paragraphIndex: 0,
                startOffset: 0,
                endOffset: 4,
            },
            {
                pairId: 'b',
                text: '第二句。  ',
                paragraphIndex: 0,
                startOffset: 4,
                endOffset: 10,
            },
            {
                pairId: 'c',
                text: '第三句。\n\n',
                paragraphIndex: 0,
                startOffset: 10,
                endOffset: 16,
            },
        ];
        const value: ReadingDocument = {
            ...document,
            sourceLanguage: 'ja',
            targetLanguage: 'zh',
            alignment: {
                source: pairs,
                translation: pairs.map(({ pairId, text }) => ({
                    pairId,
                    text,
                })),
                editedPairIds: ['b'],
            },
        };
        const { container } = render(
            <TextReading
                collectionActorKey='user-a'
                document={value}
                matchMode={false}
            />,
        );
        for (const side of ['source', 'translation'])
            expect(
                container.querySelector(
                    `[data-reading-pair="a"][data-side="${side}"]`,
                )?.parentElement?.textContent,
            ).toBe('第一句。第二句。  第三句。');
    });
    it('shows lexical sentence content in the phone counterpart sheet without paragraph suffixes', () => {
        const value: ReadingDocument = {
            ...document,
            alignment: {
                ...document.alignment!,
                translation: [{ pairId: pair, text: 'Одно предложение.\n\n' }],
            },
        };
        const { container } = render(
            <CounterpartSheet
                sheet={0}
                setSheet={vi.fn()}
                doc={value}
                language={(code) => code}
            />,
        );
        const paragraphs = [...container.querySelectorAll('section p')];
        expect(paragraphs.map((item) => item.textContent)).toEqual([
            'One sentence.',
            'Одно предложение.',
        ]);
        expect(value.alignment?.translation[0]?.text).toBe(
            'Одно предложение.\n\n',
        );
    });
});
