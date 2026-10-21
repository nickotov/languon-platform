import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Menu, Popover, PopoverContent, PopoverTrigger } from '@/fsd/shared/ui';
import { render } from './render';

function FlyoutWithMenu({ pin }: { pin(): void }) {
    return (
        <Popover>
            <PopoverTrigger>Open flyout</PopoverTrigger>
            <PopoverContent aria-label='Resources'>
                <label>
                    Filter
                    <input />
                </label>
                <Menu
                    label='Resource actions'
                    trigger='More'
                    items={[{ label: 'Pin', onSelect: pin }]}
                />
            </PopoverContent>
        </Popover>
    );
}

describe('nested portal overlay boundaries', () => {
    it('keeps a flyout open while its portaled row menu receives focus and selects Pin', async () => {
        const interaction = userEvent.setup();
        const pin = vi.fn();
        render(<FlyoutWithMenu pin={pin} />);
        await interaction.click(
            screen.getByRole('button', { name: 'Open flyout' }),
        );
        await interaction.click(
            screen.getByRole('button', { name: 'Resource actions' }),
        );
        const item = await screen.findByRole('menuitem', { name: 'Pin' });
        await waitFor(() => expect(item).toHaveFocus());
        expect(screen.getByRole('dialog', { name: 'Resources' })).toBeVisible();
        await interaction.click(item);
        expect(pin).toHaveBeenCalledOnce();
        expect(screen.getByRole('dialog', { name: 'Resources' })).toBeVisible();
    });
    it('keeps its parent when native child removal temporarily clears focus', async () => {
        const showDescriptor = Object.getOwnPropertyDescriptor(
            HTMLElement.prototype,
            'showPopover',
        );
        const hideDescriptor = Object.getOwnPropertyDescriptor(
            HTMLElement.prototype,
            'hidePopover',
        );
        Object.defineProperty(HTMLElement.prototype, 'showPopover', {
            configurable: true,
            value: function (this: HTMLElement) {
                this.style.display = 'block';
            },
        });
        Object.defineProperty(HTMLElement.prototype, 'hidePopover', {
            configurable: true,
            value: function () {
                if (document.activeElement instanceof HTMLElement)
                    document.activeElement.blur();
            },
        });
        try {
            const interaction = userEvent.setup();
            const pin = vi.fn();
            render(<FlyoutWithMenu pin={pin} />);
            await interaction.click(
                screen.getByRole('button', { name: 'Open flyout' }),
            );
            await interaction.click(
                screen.getByRole('button', { name: 'Resource actions' }),
            );
            await interaction.click(
                await screen.findByRole('menuitem', { name: 'Pin' }),
            );
            expect(pin).toHaveBeenCalledOnce();
            expect(
                screen.getByRole('dialog', { name: 'Resources' }),
            ).toBeVisible();
        } finally {
            if (showDescriptor)
                Object.defineProperty(
                    HTMLElement.prototype,
                    'showPopover',
                    showDescriptor,
                );
            else Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
            if (hideDescriptor)
                Object.defineProperty(
                    HTMLElement.prototype,
                    'hidePopover',
                    hideDescriptor,
                );
            else Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover');
        }
    });

    it('dismisses only the inner menu on Escape, then dismisses its parent and restores focus', async () => {
        const interaction = userEvent.setup();
        render(<FlyoutWithMenu pin={vi.fn()} />);
        const trigger = screen.getByRole('button', { name: 'Open flyout' });
        await interaction.click(trigger);
        const actions = screen.getByRole('button', {
            name: 'Resource actions',
        });
        await interaction.click(actions);
        await screen.findByRole('menuitem', { name: 'Pin' });
        await interaction.keyboard('{Escape}');
        expect(
            screen.queryByRole('menuitem', { name: 'Pin' }),
        ).not.toBeInTheDocument();
        expect(screen.getByRole('dialog', { name: 'Resources' })).toBeVisible();
        await waitFor(() => expect(actions).toHaveFocus());
        await interaction.keyboard('{Escape}');
        expect(
            screen.queryByRole('dialog', { name: 'Resources' }),
        ).not.toBeInTheDocument();
        await waitFor(() => expect(trigger).toHaveFocus());
    });
});
