import type { Ref, SyntheticEvent } from 'react';

export const assignRef = <T>(ref: Ref<T> | undefined, value: T | null) => {
    if (typeof ref === 'function') ref(value);
    else if (ref) ref.current = value;
};

export const composeHandlers =
    <E extends SyntheticEvent>(
        childHandler: ((event: E) => void) | undefined,
        ownHandler: (event: E) => void,
    ) =>
    (event: E) => {
        childHandler?.(event);

        if (!event.defaultPrevented) ownHandler(event);
    };

/** Native hidePopover must finish before returning focus to its invoker. */
export function restorePopoverFocus(anchor: HTMLElement | null) {
    queueMicrotask(() => {
        if (anchor?.isConnected) anchor.focus({ preventScroll: true });
    });
}
