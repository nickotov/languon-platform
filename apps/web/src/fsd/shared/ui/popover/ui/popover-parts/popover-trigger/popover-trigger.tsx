'use client';

import {
    cloneElement,
    forwardRef,
    isValidElement,
    type ReactElement,
    type Ref,
    type SyntheticEvent,
} from 'react';
import styles from '../../../../styles/popover-common.module.css';
import { usePopover } from '../../../popover-context';
import { assignRef, composeHandlers } from '../../../popover-helpers';
import type { PopoverTriggerProps, TriggerChildProps } from '../types';

export const PopoverTrigger = forwardRef<
    HTMLButtonElement,
    PopoverTriggerProps
>(function PopoverTrigger(
    { asChild = false, children, className, onClick, ...props },
    forwardedRef,
) {
    const context = usePopover();

    if (asChild && isValidElement(children)) {
        const child = children as ReactElement<TriggerChildProps>;

        const triggerClick = onClick as unknown as
            ((event: SyntheticEvent) => void) | undefined;

        return cloneElement(child, {
            ...props,
            'aria-controls': context.contentId,
            'aria-expanded': context.open,
            'aria-haspopup': 'dialog',
            className: [child.props.className, className]
                .filter(Boolean)
                .join(' '),
            onClick: composeHandlers(
                child.props.onClick,
                composeHandlers(triggerClick, () =>
                    context.setOpen(!context.open),
                ),
            ),
            ref: (node) => {
                context.triggerRef.current = node;

                assignRef(child.props.ref, node);

                assignRef(forwardedRef as Ref<HTMLElement>, node);
            },
        });
    }

    return (
        <button
            {...props}
            aria-controls={context.contentId}
            aria-expanded={context.open}
            aria-haspopup='dialog'
            className={[styles.trigger, className].filter(Boolean).join(' ')}
            onClick={composeHandlers(onClick, () =>
                context.setOpen(!context.open),
            )}
            ref={(node) => {
                context.triggerRef.current = node;

                assignRef(forwardedRef, node);
            }}
            type={props.type ?? 'button'}
        >
            {children}
        </button>
    );
});
