import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    CommandMenu,
    CommandMenuItem,
    Popover,
    PopoverAnchor,
    PopoverContent,
    PopoverTrigger,
} from '@/fsd/shared/ui';
import { render } from './render';

const originalScroll = HTMLElement.prototype.scrollIntoView;
beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
    HTMLElement.prototype.scrollIntoView = originalScroll;
    vi.restoreAllMocks();
});

function commands(actions: {
    choose(): void;
    back?(): void;
    close(): void;
    resume?(text: string): void;
    query?(text: string): void;
}) {
    return (
        <CommandMenu
            title='Add to prompt'
            searchLabel='Find a command'
            query=''
            onQueryChange={actions.query}
            onClose={actions.close}
            closeLabel='Close picker'
            onBack={actions.back}
            backLabel='Back'
            onResumeTyping={actions.resume}
        >
            <CommandMenuItem
                label='Exercises'
                description='Choose an activity'
                onSelect={actions.choose}
            />
            <CommandMenuItem
                label='Unavailable'
                onSelect={actions.choose}
                disabled
            />
            <CommandMenuItem
                label='Document blocks'
                onSelect={actions.choose}
            />
            <textarea
                aria-label='Exact passage'
                defaultValue={'First line\nSecond line'}
            />
        </CommandMenu>
    );
}

describe('compact action command surface', () => {
    it('preserves standalone virtual anchors without a separate trigger', async () => {
        const user = userEvent.setup();
        const position = {
            getBoundingClientRect: () => new DOMRect(20, 20, 1, 20),
        };

        function StandaloneAnchor() {
            const [open, setOpen] = useState(false);

            return (
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverAnchor asChild virtualRef={position}>
                        <button type='button' onClick={() => setOpen(!open)}>
                            Selected text
                        </button>
                    </PopoverAnchor>
                    <PopoverContent aria-label='Text actions'>
                        <button type='button'>Choose</button>
                    </PopoverContent>
                </Popover>
            );
        }

        render(<StandaloneAnchor />);
        const anchor = screen.getByRole('button', { name: 'Selected text' });
        await user.click(anchor);
        expect(
            await screen.findByRole('dialog', { name: 'Text actions' }),
        ).toBeVisible();

        await user.click(anchor);
        expect(
            screen.queryByRole('dialog', { name: 'Text actions' }),
        ).not.toBeInTheDocument();
    });

    it('keeps the actual trigger registered when a virtual positioning anchor follows it', async () => {
        const user = userEvent.setup();
        const position = {
            getBoundingClientRect: () => new DOMRect(20, 20, 1, 20),
        };

        render(
            <Popover>
                <PopoverTrigger>Commands</PopoverTrigger>
                <PopoverAnchor virtualRef={position}>
                    <span aria-hidden='true' />
                </PopoverAnchor>
                <PopoverContent aria-label='Anchored commands'>
                    <button type='button'>Choose</button>
                </PopoverContent>
            </Popover>,
        );

        const trigger = screen.getByRole('button', { name: 'Commands' });
        await user.click(trigger);
        expect(
            await screen.findByRole('dialog', { name: 'Anchored commands' }),
        ).toBeVisible();

        await user.click(trigger);
        expect(
            screen.queryByRole('dialog', { name: 'Anchored commands' }),
        ).not.toBeInTheDocument();
    });

    it('navigates enabled actions from search and preserves exact accessible names', async () => {
        const choose = vi.fn();
        render(commands({ choose, close: vi.fn() }));
        const search = screen.getByRole('textbox', { name: 'Find a command' });
        search.focus();
        fireEvent.keyDown(search, { key: 'ArrowUp' });
        expect(
            screen.getByRole('button', {
                name: 'Document blocks',
                exact: true,
            }),
        ).toHaveFocus();

        search.focus();
        fireEvent.keyDown(search, { key: 'ArrowDown' });
        expect(
            screen.getByRole('button', { name: 'Exercises', exact: true }),
        ).toHaveFocus();

        await userEvent.keyboard('{ArrowDown}');
        expect(
            screen.getByRole('button', {
                name: 'Document blocks',
                exact: true,
            }),
        ).toHaveFocus();

        await userEvent.keyboard('{Enter}');
        expect(choose).toHaveBeenCalledTimes(1);
        await userEvent.keyboard(' ');
        expect(choose).toHaveBeenCalledTimes(2);
    });

    it('resumes writing from a command without swallowing text, but leaves search and IME native', () => {
        const resume = vi.fn();
        const query = vi.fn();
        render(commands({ choose: vi.fn(), close: vi.fn(), resume, query }));
        const action = screen.getByRole('button', { name: 'Exercises' });
        action.focus();
        fireEvent.keyDown(action, { key: 'x' });
        expect(resume).toHaveBeenCalledWith('x');
        const search = screen.getByRole('textbox', { name: 'Find a command' });
        fireEvent.change(search, { target: { value: 'reading' } });
        fireEvent.keyDown(search, { key: 'y' });
        fireEvent.keyDown(action, { key: 'あ', isComposing: true });
        fireEvent.keyDown(action, { key: 'c', ctrlKey: true });
        expect(query).toHaveBeenCalledWith('reading');
        expect(resume).toHaveBeenCalledTimes(1);
    });

    it('does not hijack passage arrow, selection, or newline keys', () => {
        const choose = vi.fn();
        render(commands({ choose, close: vi.fn() }));
        const passage = screen.getByRole('textbox', { name: 'Exact passage' });
        passage.focus();
        expect(fireEvent.keyDown(passage, { key: 'ArrowDown' })).toBe(true);
        expect(
            fireEvent.keyDown(passage, { key: 'ArrowUp', shiftKey: true }),
        ).toBe(true);

        expect(fireEvent.keyDown(passage, { key: 'Enter' })).toBe(true);
        expect(passage).toHaveFocus();
        expect(choose).not.toHaveBeenCalled();
    });

    it('allows a nested action surface to own Escape without dismissing its popover', async () => {
        const back = vi.fn();
        const user = userEvent.setup();
        render(
            <Popover>
                <PopoverTrigger>Open commands</PopoverTrigger>
                <PopoverContent
                    aria-label='Command popup'
                    dismissOnEscape={false}
                    autoFocus={false}
                >
                    {commands({ choose: vi.fn(), close: vi.fn(), back })}
                </PopoverContent>
            </Popover>,
        );

        await user.click(screen.getByRole('button', { name: 'Open commands' }));
        const action = await screen.findByRole('button', { name: 'Exercises' });
        action.focus();
        await user.keyboard('{Escape}');
        expect(back).toHaveBeenCalledTimes(1);
        expect(
            screen.getByRole('dialog', { name: 'Command popup' }),
        ).toBeVisible();
    });
});
