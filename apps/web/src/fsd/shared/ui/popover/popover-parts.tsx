'use client';
import {
    cloneElement,
    forwardRef,
    isValidElement,
    type ButtonHTMLAttributes,
    type HTMLAttributes,
    type ReactElement,
    type Ref,
    type SyntheticEvent,
    useLayoutEffect,
} from 'react';
import type { VirtualElement } from '@floating-ui/react';
import styles from './popover.module.css';
import { usePopover } from './popover-context';
import { assignRef, composeHandlers } from './popover-helpers';

type TriggerChildProps = {
    'aria-controls'?: string;
    'aria-expanded'?: boolean;
    'aria-haspopup'?: 'dialog';
    className?: string;
    onClick?: (event: SyntheticEvent) => void;
    ref?: Ref<HTMLElement>;
};

export type PopoverTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
};

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

export type PopoverAnchorProps = HTMLAttributes<HTMLElement> & {
    asChild?: boolean;
    virtualRef?: VirtualElement | undefined;
};

export const PopoverAnchor = forwardRef<HTMLElement, PopoverAnchorProps>(
    function PopoverAnchor(
        { asChild = false, children, className, virtualRef, ...props },
        forwardedRef,
    ) {
        const context = usePopover();
        const { setVirtualReference } = context;
        useLayoutEffect(() => {
            setVirtualReference(virtualRef);
            return () => setVirtualReference(undefined);
        }, [setVirtualReference, virtualRef]);

        const setRef = (node: HTMLElement | null) => {
            context.triggerRef.current = node;

            if (typeof forwardedRef === 'function') forwardedRef(node);
            else if (forwardedRef) forwardedRef.current = node;
        };

        if (asChild && isValidElement(children)) {
            const child = children as ReactElement<{
                className?: string;
                ref?: Ref<HTMLElement>;
            }>;

            return cloneElement(child, {
                ...props,
                className: [child.props.className, className]
                    .filter(Boolean)
                    .join(' '),
                ref: (node) => {
                    assignRef(child.props.ref, node);

                    setRef(node);
                },
            });
        }

        return (
            <span {...props} className={className} ref={setRef}>
                {children}
            </span>
        );
    },
);
