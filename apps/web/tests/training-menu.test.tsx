import { fireEvent, render, screen } from '@testing-library/react';
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
    it('renders a noninteractive heading and disabled hint, restores focus on Escape', () => {
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
        expect(screen.getAllByRole('menuitem')).toHaveLength(2);
        expect(
            screen.getByRole('menuitem', { name: 'Sentences Coming soon' }),
        ).toBeDisabled();
        const cards = screen.getByRole('menuitem', { name: 'Cards' });
        expect(cards).toHaveFocus();
        fireEvent.keyDown(cards, { key: 'Escape' });
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
        expect(select).not.toHaveBeenCalled();
    });
    it('allows informational all-disabled menus only when explicitly requested', () => {
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
        expect(screen.getByRole('menuitem')).toBeDisabled();
        fireEvent.click(screen.getByRole('menuitem'));
        expect(select).not.toHaveBeenCalled();
        fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
    it('keeps retry menus open only when a menu action requests it', () => {
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
        fireEvent.click(screen.getByRole('menuitem', { name: 'Retry' }));
        expect(retry).toHaveBeenCalledOnce();
        expect(screen.getByRole('menu')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('menuitem', { name: 'Cards' }));
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Train' })).toHaveFocus();
    });
});
