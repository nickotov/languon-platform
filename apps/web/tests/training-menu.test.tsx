import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Menu } from '@/fsd/shared/ui';

describe('menu training extensions preserve default behavior', () => {
    it('keeps the default all-disabled trigger disabled', () => {
        render(
            <Menu
                label='Actions'
                trigger='Actions'
                items={[
                    { label: 'Unavailable', disabled: true, onSelect: vi.fn() },
                ]}
            />,
        );
        expect(screen.getByRole('button', { name: 'Actions' })).toBeDisabled();
    });
    it('renders a noninteractive heading and disabled hint, restores focus on Escape', async () => {
        const select = vi.fn();
        render(
            <Menu
                label='Train'
                trigger='Train'
                heading='Train with'
                variant='secondary'
                showChevron
                placement='top-end'
                items={[
                    { label: 'Cards', onSelect: select },
                    {
                        label: 'Sentences',
                        hint: 'Coming soon',
                        disabled: true,
                        onSelect: vi.fn(),
                    },
                ]}
            />,
        );
        const trigger = screen.getByRole('button', { name: 'Train' });
        fireEvent.click(trigger);
        expect(screen.getByText('Train with')).toHaveAttribute(
            'role',
            'presentation',
        );
        expect(await screen.findAllByRole('menuitem')).toHaveLength(2);
        expect(
            await screen.findByRole('menuitem', {
                name: 'Sentences Coming soon',
            }),
        ).toBeDisabled();
        const cards = await screen.findByRole('menuitem', { name: 'Cards' });
        expect(cards).toHaveFocus();
        fireEvent.keyDown(cards, { key: 'Escape' });
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        await waitFor(() => expect(trigger).toHaveFocus());
        expect(select).not.toHaveBeenCalled();
    });
    it('allows informational all-disabled menus only when explicitly requested', async () => {
        const select = vi.fn();
        render(
            <Menu
                label='Train'
                trigger='Train'
                allowDisabledItems
                heading='Train with'
                items={[
                    {
                        label: 'Cards — Archived',
                        disabled: true,
                        onSelect: select,
                    },
                ]}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Train' }));
        expect(await screen.findByRole('menuitem')).toBeDisabled();
        fireEvent.click(await screen.findByRole('menuitem'));
        expect(select).not.toHaveBeenCalled();
        fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
    it('keeps retry menus open only when a menu action requests it', async () => {
        const retry = vi.fn();
        render(
            <Menu
                label='Train'
                trigger='Train'
                items={[
                    { label: 'Retry', closeOnSelect: false, onSelect: retry },
                    { label: 'Cards', onSelect: vi.fn() },
                ]}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Train' }));
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Retry' }));
        expect(retry).toHaveBeenCalledOnce();
        expect(screen.getByRole('menu')).toBeInTheDocument();
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Cards' }));
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Train' })).toHaveFocus(),
        );
    });
});
