import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    Button,
    Checkbox,
    clearToasts,
    Combobox,
    Dialog,
    dismissToast,
    Field,
    Input,
    Menu,
    Popover,
    showToast,
    Tabs,
    Toast,
    ToastHost,
    Tooltip,
} from '@/fsd/shared/ui';

import { render } from './render';

describe('shared UI accessibility contracts', () => {
    afterEach(() => act(clearToasts));

    it('connects a field label, hint, required state, and error to its control', () => {
        const { rerender } = render(
            <>
                <p id='email-format'>Address format</p>
                <Field hint='Use a personal address.' label='Email' required>
                    <Input
                        aria-describedby='email-format'
                        name='email'
                        type='email'
                    />
                </Field>
            </>,
        );

        const input = screen.getByRole('textbox', { name: /Email/ });
        expect(input).toBeRequired();
        expect(input).toHaveAccessibleDescription(
            'Address format Use a personal address.',
        );

        rerender(
            <Field error='Enter a valid address.' label='Email' required>
                <Input name='email' type='email' />
            </Field>,
        );
        expect(screen.getByRole('textbox', { name: /Email/ })).toHaveAttribute(
            'aria-invalid',
            'true',
        );
        expect(
            screen.getByRole('textbox', { name: /Email/ }),
        ).toHaveAccessibleDescription('Enter a valid address.');

        rerender(
            <Field label='Email' success='Email address verified.'>
                <Input name='email' type='email' />
            </Field>,
        );
        expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAttribute(
            'data-validation',
            'success',
        );
        expect(
            screen.getByRole('textbox', { name: 'Email' }),
        ).toHaveAccessibleDescription('Email address verified.');
    });

    it('supports automatic tab activation with arrow, Home, and End keys', async () => {
        const user = userEvent.setup();
        render(
            <Tabs
                items={[
                    { content: 'Overview content', label: 'Overview' },
                    { content: 'Notes content', label: 'Notes' },
                    { content: 'Review content', label: 'Review' },
                ]}
                label='Lesson sections'
            />,
        );

        const overview = screen.getByRole('tab', { name: 'Overview' });
        overview.focus();
        await user.keyboard('{ArrowRight}');
        expect(screen.getByRole('tab', { name: 'Notes' })).toHaveAttribute(
            'aria-selected',
            'true',
        );
        expect(screen.getByRole('tabpanel')).toHaveTextContent('Notes content');

        await user.keyboard('{End}');
        expect(screen.getByRole('tab', { name: 'Review' })).toHaveFocus();
        await user.keyboard('{Home}');
        expect(overview).toHaveFocus();
    });

    it('exposes indeterminate checkboxes and keeps loading button labels', () => {
        render(
            <>
                <Checkbox indeterminate>All lessons</Checkbox>
                <Button loading>Save changes</Button>
            </>,
        );

        expect(
            screen.getByRole('checkbox', { name: 'All lessons' }),
        ).toHaveAttribute('aria-checked', 'mixed');
        expect(
            screen.getByRole('button', { name: 'Save changes' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Save changes' }),
        ).toHaveAttribute('aria-busy', 'true');
    });

    it('implements searchable combobox ownership, selection, and empty state', async () => {
        const user = userEvent.setup();
        render(
            <Combobox
                aria-label='Learning language'
                emptyMessage='No matching languages'
                options={[
                    { label: 'Spanish', value: 'es' },
                    { label: 'French', value: 'fr' },
                ]}
            />,
        );

        const input = screen.getByRole('combobox', {
            name: 'Learning language',
        });
        await user.click(input);
        expect(input).toHaveAttribute('aria-expanded', 'true');
        expect(input).toHaveAttribute('aria-controls');
        await user.type(input, 'Span');
        expect(screen.getByRole('option', { name: 'Spanish' })).toHaveAttribute(
            'aria-selected',
            'true',
        );
        await user.keyboard('{Enter}');
        expect(input).toHaveValue('es');
        expect(input).toHaveAttribute('aria-expanded', 'false');

        await user.clear(input);
        await user.type(input, 'German');
        expect(
            screen.getByRole('option', { name: 'No matching languages' }),
        ).toHaveAttribute('aria-disabled', 'true');
    });

    it('does not reference a hidden option while a combobox is loading', async () => {
        const user = userEvent.setup();
        render(
            <Combobox
                aria-label='Learning language'
                loading
                options={[{ label: 'Spanish', value: 'es' }]}
            />,
        );
        const input = screen.getByRole('combobox', {
            name: 'Learning language',
        });
        await user.click(input);
        expect(input).toHaveAttribute('aria-busy', 'true');
        expect(input).not.toHaveAttribute('aria-activedescendant');
        expect(
            screen.getByRole('option', { name: 'Loading options' }),
        ).toHaveAttribute('id');
    });

    it('describes the real tooltip trigger and dismisses with Escape', async () => {
        const user = userEvent.setup();
        render(
            <Tooltip
                content={
                    <span>
                        <strong>Progress</strong> updates after each lesson.
                    </span>
                }
            >
                <button type='button'>Progress information</button>
            </Tooltip>,
        );

        const trigger = screen.getByRole('button', {
            name: 'Progress information',
        });
        await user.click(trigger);
        expect(trigger).toHaveAccessibleDescription(
            'Progress updates after each lesson.',
        );
        expect(screen.getByRole('tooltip')).toBeVisible();
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it('delays pointer tooltips and lets Escape dismiss them globally', async () => {
        vi.useFakeTimers();
        try {
            render(
                <Tooltip content='Delayed explanation'>
                    <button type='button'>More information</button>
                </Tooltip>,
            );
            const trigger = screen.getByRole('button', {
                name: 'More information',
            });
            fireEvent.mouseEnter(trigger.parentElement!);
            await act(async () => vi.advanceTimersByTimeAsync(499));
            expect(trigger).not.toHaveAccessibleDescription();
            await act(async () => vi.advanceTimersByTimeAsync(1));
            expect(trigger).toHaveAccessibleDescription('Delayed explanation');
            fireEvent.keyDown(document, { key: 'Escape' });
            expect(trigger).not.toHaveAccessibleDescription();
        } finally {
            vi.useRealTimers();
        }
    });

    it('limits visible toasts to three and advances the queue on dismissal', async () => {
        const user = userEvent.setup();
        render(
            <>
                <ToastQueueHarness />
                <ToastHost label='Notifications' />
            </>,
        );

        await user.click(
            screen.getByRole('button', { name: 'Queue notifications' }),
        );
        expect(screen.getAllByRole('status')).toHaveLength(1);
        expect(screen.getByText('Notification 1')).toBeVisible();
        expect(screen.getByText('Notification 2')).toBeVisible();
        expect(screen.getByText('Notification 3')).toBeVisible();
        expect(screen.queryByText('Notification 4')).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Dismiss 1' }));
        expect(screen.getByText('Notification 4')).toBeVisible();
        expect(screen.getAllByRole('status')).toHaveLength(1);
    });

    it('dispatches, dismisses, and clears toasts without a provider', () => {
        render(<ToastHost label='Notifications' />);
        let first = 0;
        act(() => {
            first = showToast({
                content: 'First notification',
                dismissLabel: 'Dismiss first',
                duration: null,
                tone: 'success',
            });
            showToast({
                content: 'Second notification',
                dismissLabel: 'Dismiss second',
                duration: null,
            });
        });
        expect(
            screen.getByText('First notification').parentElement,
        ).toHaveAttribute('data-tone', 'success');
        act(() => dismissToast(first));
        expect(
            screen.queryByText('First notification'),
        ).not.toBeInTheDocument();
        expect(screen.getByText('Second notification')).toBeVisible();
        act(clearToasts);
        expect(
            screen.queryByText('Second notification'),
        ).not.toBeInTheDocument();
    });

    it('does not restart an active toast timer when another toast is queued', async () => {
        vi.useFakeTimers();
        try {
            render(<ToastHost label='Notifications' limit={10} />);
            act(() => {
                showToast({
                    content: 'Timed notification',
                    dismissLabel: 'Dismiss timed notification',
                    duration: 6_000,
                });
            });
            await act(async () => vi.advanceTimersByTimeAsync(3_000));
            act(() => {
                showToast({
                    content: 'Persistent notification',
                    dismissLabel: 'Dismiss persistent notification',
                    duration: null,
                });
                showToast({
                    content: 'Third notification',
                    dismissLabel: 'Dismiss third notification',
                    duration: null,
                });
                showToast({
                    content: 'Queued notification',
                    dismissLabel: 'Dismiss queued notification',
                    duration: null,
                });
            });
            expect(
                screen.queryByText('Queued notification'),
            ).not.toBeInTheDocument();
            await act(async () => vi.advanceTimersByTimeAsync(2_999));
            expect(screen.getByText('Timed notification')).toBeVisible();
            await act(async () => vi.advanceTimersByTimeAsync(1));
            expect(
                screen.queryByText('Timed notification'),
            ).not.toBeInTheDocument();
            expect(screen.getByText('Queued notification')).toBeVisible();
        } finally {
            vi.useRealTimers();
        }
    });

    it('keeps action toasts persistent even when a duration is supplied', async () => {
        vi.useFakeTimers();
        try {
            render(<ToastHost label='Notifications' />);
            act(() => {
                showToast({
                    action: <button type='button'>Undo</button>,
                    content: 'Lesson removed',
                    dismissLabel: 'Dismiss lesson removal',
                    duration: 6_000,
                });
            });
            await act(async () => vi.advanceTimersByTimeAsync(60_000));
            expect(screen.getByText('Lesson removed')).toBeVisible();
            expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
        } finally {
            vi.useRealTimers();
        }
    });

    it('moves through enabled menu items and restores trigger focus', async () => {
        const user = userEvent.setup();
        render(
            <Menu
                items={[
                    { label: 'Rename', onSelect: vi.fn() },
                    { disabled: true, label: 'Archive', onSelect: vi.fn() },
                    { label: 'Remove', onSelect: vi.fn() },
                ]}
                label='Lesson actions'
                trigger='Actions'
            />,
        );

        const trigger = screen.getByRole('button', { name: 'Lesson actions' });
        await user.click(trigger);
        expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus();
        await user.keyboard('{ArrowDown}');
        expect(screen.getByRole('menuitem', { name: 'Remove' })).toHaveFocus();
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
    });

    it('closes a popover when focus leaves its interactive surface', async () => {
        const user = userEvent.setup();
        render(
            <>
                <Popover label='Practice information' trigger='Practice info'>
                    <button type='button'>Use calm pace</button>
                </Popover>
                <button type='button'>After popover</button>
            </>,
        );

        await user.click(
            screen.getByRole('button', { name: 'Practice information' }),
        );
        expect(screen.getByRole('dialog')).toBeVisible();
        expect(
            screen.getByRole('button', { name: 'Practice information' }),
        ).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('dialog')).toHaveFocus();
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Practice information' }),
        ).toHaveFocus();
        await user.click(
            screen.getByRole('button', { name: 'Practice information' }),
        );
        await user.tab();
        expect(
            screen.getByRole('button', { name: 'Use calm pace' }),
        ).toHaveFocus();
        await user.tab();
        expect(
            screen.getByRole('button', { name: 'After popover' }),
        ).toHaveFocus();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('synchronizes focus and expanded state with native popover toggles', () => {
        const originalShowPopover = HTMLElement.prototype.showPopover;
        const originalHidePopover = HTMLElement.prototype.hidePopover;
        vi.stubGlobal('CSS', { supports: () => true });
        Object.defineProperty(HTMLElement.prototype, 'showPopover', {
            configurable: true,
            value: vi.fn(),
        });
        Object.defineProperty(HTMLElement.prototype, 'hidePopover', {
            configurable: true,
            value: vi.fn(function hidePopoverForTest(this: HTMLElement) {
                fireEvent(
                    this,
                    Object.assign(new Event('toggle'), { newState: 'closed' }),
                );
            }),
        });
        try {
            render(
                <Popover label='Native information' trigger='Open native'>
                    Native content
                </Popover>,
            );
            const trigger = screen.getByRole('button', {
                name: 'Native information',
            });
            const panel = document.getElementById(
                trigger.getAttribute('aria-controls')!,
            )!;
            expect(panel).toHaveAttribute('role', 'dialog');
            expect(panel).toHaveAttribute('aria-label', 'Native information');
            expect(trigger).toHaveAttribute('popovertarget', panel.id);
            expect(panel).toHaveAttribute('popover', 'auto');

            fireEvent(
                panel,
                Object.assign(new Event('toggle'), { newState: 'open' }),
            );
            expect(trigger).toHaveAttribute('aria-expanded', 'true');
            expect(panel).toHaveFocus();

            fireEvent.keyDown(panel, { key: 'Escape' });
            expect(HTMLElement.prototype.hidePopover).toHaveBeenCalledOnce();
            expect(trigger).toHaveAttribute('aria-expanded', 'false');
            expect(trigger).toHaveFocus();

            fireEvent(
                panel,
                Object.assign(new Event('toggle'), { newState: 'closed' }),
            );
            expect(trigger).toHaveAttribute('aria-expanded', 'false');
        } finally {
            vi.unstubAllGlobals();
            if (originalShowPopover) {
                Object.defineProperty(HTMLElement.prototype, 'showPopover', {
                    configurable: true,
                    value: originalShowPopover,
                });
            } else {
                Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
            }
            if (originalHidePopover) {
                Object.defineProperty(HTMLElement.prototype, 'hidePopover', {
                    configurable: true,
                    value: originalHidePopover,
                });
            } else {
                Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover');
            }
        }
    });

    it('notifies once when the native dialog close button is used', async () => {
        const user = userEvent.setup();
        const showModal = HTMLDialogElement.prototype.showModal;
        const close = HTMLDialogElement.prototype.close;
        HTMLDialogElement.prototype.showModal = function showModalForTest() {
            this.setAttribute('open', '');
        };
        HTMLDialogElement.prototype.close = function closeForTest() {
            this.removeAttribute('open');
            this.dispatchEvent(new Event('close'));
        };
        const onClose = vi.fn();

        try {
            render(
                <Dialog
                    closeLabel='Close dialog'
                    onClose={onClose}
                    open
                    title='Remove passkey?'
                >
                    Confirm this change.
                </Dialog>,
            );
            await user.click(
                screen.getByRole('button', { name: 'Close dialog' }),
            );
            expect(onClose).toHaveBeenCalledTimes(1);
        } finally {
            HTMLDialogElement.prototype.showModal = showModal;
            HTMLDialogElement.prototype.close = close;
        }
    });

    it('pauses toast dismissal during pointer interaction', async () => {
        vi.useFakeTimers();
        const onDismiss = vi.fn();
        try {
            render(
                <Toast
                    dismissLabel='Dismiss notification'
                    duration={6_000}
                    onDismiss={onDismiss}
                >
                    Lesson saved
                </Toast>,
            );
            const toast = screen.getByText('Lesson saved').parentElement;
            expect(toast).not.toBeNull();
            fireEvent.mouseEnter(toast!);
            await act(async () => vi.advanceTimersByTimeAsync(7_000));
            expect(onDismiss).not.toHaveBeenCalled();
            fireEvent.mouseLeave(toast!);
            await act(async () => vi.advanceTimersByTimeAsync(5_999));
            expect(onDismiss).not.toHaveBeenCalled();
            await act(async () => vi.advanceTimersByTimeAsync(1));
            expect(onDismiss).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });
});

function ToastQueueHarness() {
    return (
        <button
            onClick={() => {
                for (let index = 1; index <= 4; index += 1) {
                    showToast({
                        content: `Notification ${index}`,
                        dismissLabel: `Dismiss ${index}`,
                        duration: null,
                    });
                }
            }}
            type='button'
        >
            Queue notifications
        </button>
    );
}
