import type { KeyboardEvent } from 'react';

function editable(target: EventTarget) {
    return (
        target instanceof HTMLElement &&
        (target.matches('input, textarea, select') || target.isContentEditable)
    );
}

/** Native text editing wins; command navigation is limited to this surface's actions. */
export function commandMenuKey(
    event: KeyboardEvent<HTMLElement>,
    actions: {
        onBack?: (() => void) | undefined;
        onClose(): void;
        onResumeTyping?: ((text: string) => void) | undefined;
    },
) {
    if (
        event.defaultPrevented ||
        event.nativeEvent.isComposing ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
    ) {
        return;
    }

    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        (actions.onBack ?? actions.onClose)();

        return;
    }

    const controls = Array.from(
        event.currentTarget.querySelectorAll<HTMLButtonElement>(
            'button[data-command-item]:not(:disabled)',
        ),
    ).filter((item) => !item.closest('[hidden]'));
    const active = document.activeElement;
    const index = controls.findIndex(
        (item) =>
            item === active ||
            item.closest('[data-command-row]')?.contains(active),
    );
    const typing = editable(event.target);
    const searchInput =
        event.target instanceof HTMLElement &&
        event.target.matches('[data-command-search]');

    // Passage/translation fields keep their native caret and selection behavior.
    if (typing && !searchInput) {
        return;
    }

    let next: number | undefined;
    if (event.key === 'ArrowDown' && !event.shiftKey) {
        next = (index + 1) % controls.length;
    } else if (event.key === 'ArrowUp' && !event.shiftKey) {
        next =
            index < 0
                ? controls.length - 1
                : (index - 1 + controls.length) % controls.length;
    } else if (!typing && event.key === 'Home') {
        next = 0;
    } else if (!typing && event.key === 'End') {
        next = controls.length - 1;
    }

    if (next !== undefined && controls.length) {
        event.preventDefault();
        event.stopPropagation();
        controls[next]?.focus({ preventScroll: true });
        controls[next]?.scrollIntoView({ block: 'nearest' });

        return;
    }

    if (typing && event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        controls[0]?.click();

        return;
    }

    if (!typing && event.key === 'ArrowLeft' && actions.onBack) {
        event.preventDefault();
        actions.onBack();

        return;
    }

    if (
        !typing &&
        event.key.length === 1 &&
        event.key !== ' ' &&
        actions.onResumeTyping
    ) {
        event.preventDefault();
        event.stopPropagation();
        actions.onResumeTyping(event.key);
    }
}
