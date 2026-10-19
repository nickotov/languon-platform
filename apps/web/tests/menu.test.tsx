import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Menu } from '@/fsd/shared/ui';
import { render } from './render';

describe('icon action menu', () => {
    it('hands focus to its persistent trigger before opening another surface', async () => {
        const user = userEvent.setup();
        let opener: Element | null = null;
        function openNextSurface() {
            // Native dialogs capture this element as their return-focus target.
            opener = document.activeElement;
        }
        render(
            <Menu
                label='Dictionary actions'
                trigger='Actions'
                items={[
                    { label: 'Practice history', onSelect: openNextSurface },
                ]}
            />,
        );
        const trigger = screen.getByRole('button', {
            name: 'Dictionary actions',
        });
        await user.click(trigger);
        await user.click(
            screen.getByRole('menuitem', { name: 'Practice history' }),
        );
        expect(opener).toBe(trigger);
    });
    it('keeps decorative icons out of names and restores focus after selection', async () => {
        const user = userEvent.setup();
        const onSelect = vi.fn();
        render(
            <Menu
                iconOnly
                label='Dictionary actions'
                trigger={<span aria-hidden='true'>•••</span>}
                items={[
                    { icon: <span>Edit icon</span>, label: 'Edit', onSelect },
                    {
                        icon: <span>Archive icon</span>,
                        label: 'Archive',
                        onSelect: vi.fn(),
                        tone: 'danger',
                    },
                ]}
            />,
        );
        const trigger = screen.getByRole('button', {
            name: 'Dictionary actions',
        });
        await user.click(trigger);
        expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
        await user.keyboard('{Enter}');
        expect(onSelect).toHaveBeenCalledExactlyOnceWith();
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
    });

    it('retains outside dismissal and enabled-item Home/End navigation', async () => {
        const user = userEvent.setup();
        render(
            <>
                <button type='button'>Outside</button>
                <Menu
                    iconOnly
                    label='Dictionary actions'
                    trigger='•••'
                    items={[
                        { label: 'Edit', onSelect: vi.fn() },
                        {
                            label: 'Unavailable',
                            disabled: true,
                            onSelect: vi.fn(),
                        },
                        { label: 'Archive', onSelect: vi.fn() },
                    ]}
                />
            </>,
        );
        await user.click(
            screen.getByRole('button', { name: 'Dictionary actions' }),
        );
        expect(screen.getByRole('menu').parentElement).toBe(document.body);
        await user.keyboard('{End}');
        expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveFocus();
        await user.keyboard('{Home}');
        expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
        await user.click(screen.getByRole('button', { name: 'Outside' }));
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
    it('exposes checked layout options and keeps the menu open on activation', async () => {
        const user = userEvent.setup();
        const onSelect = vi.fn();
        render(
            <Menu
                label='Tutor options'
                trigger='Options'
                items={[
                    {
                        label: 'Wide',
                        checked: true,
                        closeOnSelect: false,
                        onSelect,
                    },
                ]}
            />,
        );
        await user.click(screen.getByRole('button', { name: 'Tutor options' }));
        const item = screen.getByRole('menuitemcheckbox', {
            name: 'Wide',
            checked: true,
        });
        expect(item).toHaveFocus();
        await user.keyboard('{Enter}');
        expect(onSelect).toHaveBeenCalledOnce();
        expect(screen.getByRole('menu')).toBeVisible();
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
});
