import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Save } from 'lucide-react';
import { Button, ButtonLink } from '@/fsd/shared/ui';
import { render } from './render';

describe('responsive icon actions', () => {
    it('preserves the localized name, keyboard hint, and action', async () => {
        const save = vi.fn();
        render(
            <Button
                desktopIconOnly
                leadingIcon={<Save aria-hidden />}
                onClick={save}
            >
                Сохранить
            </Button>,
        );

        const button = screen.getByRole('button', { name: 'Сохранить' });
        fireEvent.focus(button);
        await waitFor(() =>
            expect(
                screen.getByRole('tooltip', { hidden: true }),
            ).toHaveTextContent('Сохранить'),
        );
        fireEvent.click(button);
        expect(save).toHaveBeenCalledOnce();
        fireEvent.blur(button);
        await waitFor(() =>
            expect(button).not.toHaveAttribute('aria-describedby'),
        );
    });

    it('keeps loading actions labelled and disabled', () => {
        render(
            <Button desktopIconOnly loading leadingIcon={<Save aria-hidden />}>
                Saving
            </Button>,
        );
        const button = screen.getByRole('button', { name: 'Saving' });
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('aria-busy', 'true');
    });

    it('keeps responsive links semantic with their destination and localized name', () => {
        render(
            <ButtonLink
                desktopIconOnly
                leadingIcon={<Save aria-hidden />}
                href='/texts'
            >
                Открыть
            </ButtonLink>,
        );
        expect(screen.getByRole('link', { name: 'Открыть' })).toHaveAttribute(
            'href',
            '/texts',
        );
    });
});
