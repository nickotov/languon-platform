import { StrictMode } from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Save } from 'lucide-react';
import { useDesktopTooltip } from '@/fsd/shared/ui/tooltip/use-desktop-tooltip';
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

it('reads client desktop availability immediately and cleans viewport subscriptions under StrictMode', () => {
    const listeners = new Set<() => void>();
    const media = Object.assign(window.matchMedia(''), {
        matches: true,
        addEventListener: (_type: string, listener: () => void) =>
            listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) =>
            listeners.delete(listener),
    });

    vi.spyOn(window, 'matchMedia').mockReturnValue(media);
    const snapshots: boolean[] = [];
    function Probe() {
        const available = useDesktopTooltip(true);
        snapshots.push(available);

        return <output>{available ? 'desktop' : 'mobile'}</output>;
    }

    const mounted = render(
        <StrictMode>
            <Probe />
        </StrictMode>,
    );

    expect(snapshots[0]).toBe(true);
    expect(listeners.size).toBe(1);
    act(() => {
        Object.assign(media, { matches: false });
        listeners.forEach((notify) => notify());
    });

    expect(screen.getByRole('status')).toHaveTextContent('mobile');
    act(() => {
        Object.assign(media, { matches: true });
        listeners.forEach((notify) => notify());
    });

    expect(screen.getByRole('status')).toHaveTextContent('desktop');
    mounted.unmount();
    expect(listeners.size).toBe(0);
});
