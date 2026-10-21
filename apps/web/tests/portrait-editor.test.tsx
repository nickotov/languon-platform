import { useState } from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
    PortraitItemsSchema,
    portraitCharacterCount,
    type PortraitItems,
} from '@languon/contracts';
import {
    PortraitEditor,
    PortraitSummaryPanel,
    emptyPortraitItems,
    hasMeaningfulPortraitItems,
} from '@/fsd/features/portrait-editor';
import { resolvePortraitLanguage } from '@/fsd/features/portrait-editor/lib/items';
import { portraitDiff } from '@/fsd/features/portrait-editor/lib/details';
import { previewPortraitSummary } from '@/fsd/features/portrait-editor/lib/summary';
import { render } from './render';

function EditablePortrait({
    initialItems = emptyPortraitItems(),
}: {
    initialItems?: PortraitItems;
}) {
    const [items, setItems] = useState<PortraitItems>(initialItems);
    return (
        <>
            <PortraitEditor items={items} onChange={setItems} />
            <PortraitSummaryPanel items={items} locale='en' />
        </>
    );
}

describe('portrait editor confirmed preferences', () => {
    it('treats confirmed notes and standalone mixing notes as meaningful without inventing frequency', () => {
        const note = {
            id: '8f86d1fe-56ba-4e86-a664-286b2bfc9912',
            topic: 'goals' as const,
            text: 'Prepare for travel conversations',
        };
        const items = {
            ...emptyPortraitItems(),
            mixingNote: 'Short translations',
            notes: [note],
        };
        expect(hasMeaningfulPortraitItems(items)).toBe(true);
        const preview = previewPortraitSummary(items, 'en');
        expect(preview).toContain('Short translations');
        expect(preview).toContain(note.text);
        expect(preview).not.toContain('sometimes helpful');
        const changes = portraitDiff(emptyPortraitItems(), items, 'en');
        expect(changes.map((entry) => entry.key)).toEqual([
            'explanation',
            'notes',
        ]);
        const excessive = {
            ...items,
            notes: [{ ...note, text: 'a'.repeat(201) }],
        };
        expect(PortraitItemsSchema.safeParse(excessive).success).toBe(false);
    });
    it('retains a sometimes preference separately from its note and legacy boolean', () => {
        const onChange = vi.fn();
        const items = {
            ...emptyPortraitItems(),
            mixedLanguage: true,
            mixedLanguageFrequency: 'sometimes' as const,
            mixingNote: 'English rules with Spanish examples',
        };
        render(<PortraitEditor items={items} onChange={onChange} />);
        expect(screen.getByRole('radio', { name: 'Sometimes' })).toBeChecked();
        expect(screen.getByLabelText('In your words (optional)')).toHaveValue(
            items.mixingNote,
        );
        fireEvent.click(
            screen.getByRole('radio', { name: 'Keep one language' }),
        );
        expect(onChange).toHaveBeenLastCalledWith({
            ...items,
            mixedLanguage: false,
            mixedLanguageFrequency: 'avoid',
        });
        const explanations = screen.getByRole('region', {
            name: 'Explanation languages',
        });
        fireEvent.click(
            within(explanations).getByRole('radio', { name: 'No preference' }),
        );
        expect(onChange).toHaveBeenLastCalledWith({
            ...emptyPortraitItems(),
            mixingNote: items.mixingNote,
        });
    });
    it('edits and removes confirmed notes without silently creating new notes', () => {
        const note = {
            id: '8f86d1fe-56ba-4e86-a664-286b2bfc9912',
            topic: 'goals' as const,
            text: 'Prepare for travel conversations',
        };
        render(
            <EditablePortrait
                initialItems={{ ...emptyPortraitItems(), notes: [note] }}
            />,
        );
        const notes = screen.getByRole('region', { name: 'Confirmed notes' });
        const input = within(notes).getByLabelText(
            'Note · Goals and situations',
        );
        fireEvent.change(input, {
            target: { value: 'Prepare for work conversations' },
        });
        expect(input).toHaveValue('Prepare for work conversations');
        fireEvent.click(
            within(notes).getByRole('button', { name: 'Remove note' }),
        );
        expect(
            screen.queryByRole('region', { name: 'Confirmed notes' }),
        ).not.toBeInTheDocument();
        expect(screen.getByText('Nothing to save yet')).toBeInTheDocument();
    });
    it.each(['en', 'ru', 'fr', 'es'] as const)(
        'renders saved mixing notes and confirmed notes in %s',
        (locale) => {
            const note = {
                id: '8f86d1fe-56ba-4e86-a664-286b2bfc9912',
                topic: 'goals' as const,
                text: 'Travel conversations',
            };
            render(
                <PortraitEditor
                    items={{
                        ...emptyPortraitItems(),
                        mixingNote: 'Short translations',
                        notes: [note],
                    }}
                    onChange={vi.fn()}
                    locale={locale}
                />,
                { locale },
            );
            expect(
                screen.getByDisplayValue('Short translations'),
            ).toBeInTheDocument();
            expect(
                screen.getByDisplayValue('Travel conversations'),
            ).toBeInTheDocument();
        },
    );

    it('resolves custom language names and codes without inventing proficiency', () => {
        expect(resolvePortraitLanguage('Catalan', 'en')).toBe('ca');
        expect(resolvePortraitLanguage('каталанский', 'ru')).toBe('ca');
        expect(resolvePortraitLanguage('German', 'fr')).toBe('de');
        expect(resolvePortraitLanguage('zh-Hans', 'en')).toBe('zh-hans');
        expect(resolvePortraitLanguage('not a language', 'en')).toBeUndefined();
    });

    it('starts unknown, requires meaningful facts, and never turns declined age into a fact', () => {
        expect(hasMeaningfulPortraitItems(emptyPortraitItems())).toBe(false);
        expect(
            hasMeaningfulPortraitItems({
                ...emptyPortraitItems(),
                ageRange: 'prefer-not-to-say',
            }),
        ).toBe(false);
        expect(
            hasMeaningfulPortraitItems({
                ...emptyPortraitItems(),
                mixedLanguage: false,
            }),
        ).toBe(true);
    });
    it('keeps language knowledge and explanation language separate and updates summary from edits', () => {
        render(<EditablePortrait />);
        expect(screen.getByText('Nothing to save yet')).toBeInTheDocument();
        const languages = screen.getByRole('region', {
            name: 'Languages and levels',
        });
        fireEvent.click(
            within(languages).getByRole('button', { name: 'Spanish' }),
        );
        fireEvent.change(
            within(languages).getByLabelText('How you’d describe it'),
            { target: { value: 'basic' } },
        );
        fireEvent.click(within(languages).getByLabelText('Currently learning'));
        const explanations = screen.getByRole('region', {
            name: 'Explanation languages',
        });
        fireEvent.click(
            within(explanations).getByRole('button', { name: 'English' }),
        );
        const summary = screen.getByRole('region', {
            name: 'Portrait summary',
        });
        expect(summary).toHaveTextContent('Spanish (basic) — learning');
        expect(summary).toHaveTextContent(
            'You prefer explanations in: English',
        );
    });
    it('adds and removes custom answers with a 200-grapheme bound including emoji', () => {
        render(<EditablePortrait />);
        const goals = screen.getByRole('region', {
            name: 'Goals and situations',
        });
        const input = within(goals).getByLabelText('Your own goal');
        const emoji = '👩🏽‍💻';
        fireEvent.change(input, { target: { value: emoji.repeat(201) } });
        expect(
            within(goals).getByRole('button', { name: 'Add' }),
        ).toBeDisabled();
        fireEvent.change(input, { target: { value: emoji.repeat(200) } });
        expect(portraitCharacterCount((input as HTMLInputElement).value)).toBe(
            200,
        );
        fireEvent.click(within(goals).getByRole('button', { name: 'Add' }));
        const remove = within(goals).getByRole('button', {
            name: `Remove: ${emoji.repeat(200)}`,
        });
        fireEvent.click(remove);
        expect(screen.getByText('Nothing to save yet')).toBeInTheDocument();
    });
    it('disables all editable controls while a save is pending', () => {
        render(
            <PortraitEditor
                items={emptyPortraitItems()}
                onChange={vi.fn()}
                disabled
            />,
        );
        for (const button of screen.getAllByRole('button'))
            expect(button).toBeDisabled();
        for (const radio of screen.getAllByRole('radio'))
            expect(radio).toBeDisabled();
    });
    it.each(['en', 'ru', 'fr', 'es'] as const)(
        'renders controls and only confirmed preview facts in %s',
        (locale) => {
            const items = {
                ...emptyPortraitItems(),
                tone: 'friendly' as const,
                goals: ['Travel'],
                accommodations: ['Short steps'],
            };
            expect(PortraitItemsSchema.safeParse(items).success).toBe(true);
            render(
                <PortraitEditor
                    items={items}
                    onChange={vi.fn()}
                    locale={locale}
                />,
                { locale },
            );
            expect(screen.getAllByRole('radio').length).toBeGreaterThan(10);
            const preview = previewPortraitSummary(items, locale);
            expect(preview).toContain('Travel');
            expect(preview).toContain('Short steps');
            expect(preview).not.toContain('native');
        },
    );
    it('distinguishes added, removed and changed confirmed fields without mutating inputs', () => {
        const before = {
            ...emptyPortraitItems(),
            tone: 'friendly' as const,
            goals: ['Travel'],
        };
        const after = {
            ...emptyPortraitItems(),
            tone: 'formal' as const,
            hobbies: ['Music'],
        };
        const original = JSON.stringify(before);
        const changes = portraitDiff(before, after, 'en');
        expect(changes.map((entry) => [entry.key, entry.kind])).toEqual([
            ['goals', 'removed'],
            ['style', 'changed'],
            ['hobbies', 'added'],
        ]);
        expect(JSON.stringify(before)).toBe(original);
    });
});
