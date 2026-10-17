import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    Popover,
    PopoverClose,
    PopoverContent,
    PopoverTrigger,
    Tooltip,
} from '@/fsd/shared/ui';
import { render } from './render';

afterEach(() => vi.restoreAllMocks());

describe('shared overlay portal and lifecycle', () => {
    it('automatically keeps a modal popover in its non-inert dialog host', async () => {
        const user = userEvent.setup();
        render(
            <dialog open aria-label='Reader'>
                <Popover>
                    <PopoverTrigger>Reader actions</PopoverTrigger>
                    <PopoverContent aria-label='Reader actions'>
                        <button>Save word</button>
                    </PopoverContent>
                </Popover>
            </dialog>,
        );
        await user.click(
            screen.getByRole('button', { name: 'Reader actions' }),
        );
        const panel = await screen.findByRole('dialog', {
            name: 'Reader actions',
        });
        expect(panel.parentElement).toBe(
            screen.getByRole('dialog', { name: 'Reader' }),
        );
        await user.click(screen.getByRole('button', { name: 'Save word' }));
        expect(panel).toBeVisible();
        await user.keyboard('{Escape}');
        expect(
            screen.getByRole('button', { name: 'Reader actions' }),
        ).toHaveFocus();
        expect(screen.getByRole('dialog', { name: 'Reader' })).toBeVisible();
    });

    it('hosts tooltips beside modal controls while ordinary controls portal to body', async () => {
        const user = userEvent.setup();
        render(
            <>
                <dialog open aria-label='Settings'>
                    <Tooltip content='Modal explanation'>
                        <button>Modal help</button>
                    </Tooltip>
                </dialog>
                <Tooltip content='Page explanation'>
                    <button>Page help</button>
                </Tooltip>
            </>,
        );
        screen.getByRole('button', { name: 'Modal help' }).focus();
        const modalTooltip = await screen.findByRole('tooltip');
        expect(modalTooltip.parentElement).toBe(
            screen.getByRole('dialog', { name: 'Settings' }),
        );
        await user.click(screen.getByRole('button', { name: 'Page help' }));
        const pageTooltip = await screen.findByRole('tooltip');
        expect(pageTooltip.parentElement).toBe(document.body);
    });

    it('opens native panels hidden until measured and hides them on controlled close', async () => {
        const visibilityOnShow: string[] = [];
        const show = vi.fn(function (this: HTMLDivElement) {
            visibilityOnShow.push(this.style.visibility);
            this.style.display = 'block';
        });
        const hide = vi.fn(() => {
            // Native removal can clear focus after an eager invoker.focus().
            if (document.activeElement instanceof HTMLElement)
                document.activeElement.blur();
        });
        Object.defineProperty(HTMLElement.prototype, 'showPopover', {
            configurable: true,
            value: show,
        });
        Object.defineProperty(HTMLElement.prototype, 'hidePopover', {
            configurable: true,
            value: hide,
        });
        try {
            const user = userEvent.setup();
            render(
                <Popover>
                    <PopoverTrigger>Show native actions</PopoverTrigger>
                    <PopoverContent aria-label='Native actions'>
                        <PopoverClose>Done</PopoverClose>
                    </PopoverContent>
                </Popover>,
            );
            await user.click(
                screen.getByRole('button', { name: 'Show native actions' }),
            );
            const panel = await screen.findByRole('dialog', {
                name: 'Native actions',
            });
            expect(show).toHaveBeenCalledOnce();
            expect(visibilityOnShow).toEqual(['hidden']);
            await waitFor(() => expect(panel).toBeVisible());
            expect(panel).toHaveAttribute('popover', 'manual');
            await user.click(screen.getByRole('button', { name: 'Done' }));
            expect(hide).toHaveBeenCalledOnce();
            await waitFor(() =>
                expect(
                    screen.getByRole('button', { name: 'Show native actions' }),
                ).toHaveFocus(),
            );
            await user.click(
                screen.getByRole('button', { name: 'Show native actions' }),
            );
            await screen.findByRole('dialog', { name: 'Native actions' });
            await user.keyboard('{Escape}');
            await waitFor(() =>
                expect(
                    screen.getByRole('button', { name: 'Show native actions' }),
                ).toHaveFocus(),
            );
            expect(
                screen.queryByRole('dialog', { name: 'Native actions' }),
            ).not.toBeInTheDocument();
        } finally {
            Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
            Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover');
        }
    });
    it('promotes native tooltips while hidden and keeps a full viewport height budget', async () => {
        const visibilityOnShow: string[] = [];
        Object.defineProperty(HTMLElement.prototype, 'showPopover', {
            configurable: true,
            value(this: HTMLElement) {
                visibilityOnShow.push(this.style.visibility);
                this.style.display = 'block';
            },
        });
        Object.defineProperty(HTMLElement.prototype, 'hidePopover', {
            configurable: true,
            value: vi.fn(),
        });
        let view: ReturnType<typeof render> | undefined;
        try {
            view = render(
                <Tooltip open content='Keep the complete explanation visible'>
                    <button>Native tooltip</button>
                </Tooltip>,
            );
            const tooltip = await screen.findByRole('tooltip');
            expect(visibilityOnShow).toEqual(['hidden']);
            expect(tooltip.style.maxHeight).toBe(
                `${window.innerHeight - 32}px`,
            );
            expect(tooltip).toHaveTextContent(
                'Keep the complete explanation visible',
            );
        } finally {
            view?.unmount();
            Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
            Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover');
        }
    });
});
