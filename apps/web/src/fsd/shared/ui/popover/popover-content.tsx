'use client';

import type { Placement } from '@floating-ui/react';
import {
    forwardRef,
    useCallback,
    useEffect,
    useLayoutEffect,
    useState,
    type HTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { overlayContainer } from '../../lib/overlay-container';
import { usePopover } from './popover-context';
import { assignRef, restorePopoverFocus } from './popover-helpers';
import styles from './popover.module.css';

type PopoverSide = 'bottom' | 'left' | 'right' | 'top';
export type PopoverContentProps = HTMLAttributes<HTMLDivElement> & {
    autoFocus?: boolean;
    returnFocus?: boolean;
    closeOnFocusOut?: boolean;
    align?: 'center' | 'end' | 'start';
    showArrow?: boolean;
    side?: PopoverSide;
    sideOffset?: number;
};

export const PopoverContent = forwardRef<HTMLDivElement, PopoverContentProps>(
    function PopoverContent(
        {
            autoFocus = true,
            returnFocus = true,
            closeOnFocusOut = true,
            align = 'center',
            children,
            className,
            showArrow = false,
            side = 'bottom',
            sideOffset = 8,
            ...props
        },
        forwardedRef,
    ) {
        const context = usePopover();
        const {
            contentRef,
            triggerRef,
            setOpen,
            setPosition,
            setFloating,
            open,
            isPositioned,
        } = context;
        const [mounted, setMounted] = useState(false);
        const setContent = useCallback(
            (node: HTMLDivElement | null) => {
                contentRef.current = node;
                if (node && typeof node.showPopover === 'function') {
                    // Supplying the invoker also establishes the native focus/navigation relationship.
                    (
                        node.showPopover as (options: {
                            source?: HTMLElement | undefined;
                        }) => void
                    )({
                        source: triggerRef.current ?? undefined,
                    });
                }
                setFloating(node);
                assignRef(forwardedRef, node);
            },
            [contentRef, forwardedRef, setFloating, triggerRef],
        );

        useEffect(() => {
            setMounted(true);
        }, []);
        useLayoutEffect(() => {
            setPosition(
                (side + (align === 'center' ? '' : '-' + align)) as Placement,
                sideOffset,
            );
        }, [align, setPosition, side, sideOffset]);

        useLayoutEffect(() => {
            const panel = contentRef.current;
            if (!open || !panel) return;
            return () => {
                if (typeof panel.hidePopover === 'function')
                    panel.hidePopover();
            };
        }, [contentRef, mounted, open, triggerRef]);

        useEffect(() => {
            const panel = contentRef.current;
            if (!open || !panel || !isPositioned) return;
            if (autoFocus) panel.focus({ preventScroll: true });

            function contains(target: EventTarget | null) {
                return (
                    target instanceof Node &&
                    (panel!.contains(target) ||
                        triggerRef.current?.contains(target))
                );
            }
            function dismiss(event: PointerEvent) {
                if (!contains(event.target)) setOpen(false);
            }
            function escape(event: KeyboardEvent) {
                if (
                    event.key === 'Tab' &&
                    typeof panel!.showPopover !== 'function'
                ) {
                    const selector =
                        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';
                    const controls =
                        panel!.querySelectorAll<HTMLElement>(selector);
                    const boundary = event.shiftKey
                        ? controls[0]
                        : controls[controls.length - 1];
                    if (
                        document.activeElement === boundary ||
                        controls.length === 0
                    ) {
                        event.preventDefault();
                        const outside = Array.from(
                            document.querySelectorAll<HTMLElement>(selector),
                        ).filter((node) => !panel!.contains(node));
                        const index = outside.indexOf(triggerRef.current!);
                        const next = event.shiftKey
                            ? triggerRef.current
                            : outside[index + 1];
                        next?.focus({ preventScroll: true });
                        setOpen(false);
                    }
                    return;
                }
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
                if (returnFocus)
                    restorePopoverFocus(
                        context.anchorElement instanceof HTMLElement
                            ? context.anchorElement
                            : triggerRef.current,
                    );
            }
            function blur(event: FocusEvent) {
                if (closeOnFocusOut && !contains(event.relatedTarget))
                    setOpen(false);
            }
            function sync(event: Event) {
                if ((event as ToggleEvent).newState === 'closed')
                    setOpen(false);
            }
            document.addEventListener('pointerdown', dismiss);
            document.addEventListener('keydown', escape, true);
            panel.addEventListener('focusout', blur);
            panel.addEventListener('toggle', sync);
            return () => {
                document.removeEventListener('pointerdown', dismiss);
                document.removeEventListener('keydown', escape, true);
                panel.removeEventListener('focusout', blur);
                panel.removeEventListener('toggle', sync);
            };
        }, [
            context.anchorElement,
            autoFocus,
            closeOnFocusOut,
            contentRef,
            isPositioned,
            mounted,
            open,
            returnFocus,
            setOpen,
            triggerRef,
        ]);

        if (!mounted || !open) return null;
        const contentClassName = [styles.content, className]
            .filter(Boolean)
            .join(' ');
        const panelStyle = {
            ...props.style,
            ...context.floatingStyles,
            visibility: isPositioned
                ? ('visible' as const)
                : ('hidden' as const),
        };
        return createPortal(
            <div
                {...props}
                className={contentClassName}
                id={props.id ?? context.contentId}
                popover={
                    typeof HTMLElement.prototype.showPopover === 'function'
                        ? 'manual'
                        : undefined
                }
                ref={setContent}
                role={props.role ?? 'dialog'}
                style={panelStyle}
                tabIndex={props.tabIndex ?? -1}
            >
                {children}
                {showArrow ? (
                    <span aria-hidden='true' className={styles.arrow} />
                ) : null}
            </div>,
            overlayContainer(context.anchorElement ?? triggerRef.current),
        );
    },
);
