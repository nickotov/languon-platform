'use client';

import {
    cloneElement,
    forwardRef,
    isValidElement,
    type ReactElement,
    type Ref,
} from 'react';
import { usePopover } from '../../../popover-context';
import {
    assignRef,
    composeHandlers,
    restorePopoverFocus,
} from '../../../popover-helpers';
import type { PopoverCloseProps, TriggerChildProps } from '../types';

export const PopoverClose = forwardRef<HTMLButtonElement, PopoverCloseProps>(
    function PopoverClose(
        { asChild = false, children, className, onClick, ...props },
        forwardedRef,
    ) {
        const context = usePopover();

        const close = () => {
            context.setOpen(false);
            restorePopoverFocus(
                context.anchorElement instanceof HTMLElement
                    ? context.anchorElement
                    : context.triggerRef.current,
            );
        };

        if (asChild && isValidElement(children)) {
            const child = children as ReactElement<TriggerChildProps>;

            return cloneElement(child, {
                ...props,
                className: [child.props.className, className]
                    .filter(Boolean)
                    .join(' '),
                onClick: composeHandlers(
                    child.props.onClick,
                    composeHandlers(onClick, close),
                ),
                ref: (node) => {
                    assignRef(child.props.ref, node);

                    assignRef(forwardedRef as Ref<HTMLElement>, node);
                },
            } as Partial<TriggerChildProps>);
        }

        return (
            <button
                {...props}
                className={className}
                onClick={composeHandlers(onClick, close)}
                ref={forwardedRef}
                type={props.type ?? 'button'}
            >
                {children}
            </button>
        );
    },
);
