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
} from 'react';
import styles from './popover.module.css';
import { usePopover } from './popover-context';
import {
    assignRef,
    composeHandlers,
    restorePopoverFocus,
} from './popover-helpers';
type TriggerChildProps = {
    className?: string;
    onClick?: (event: SyntheticEvent) => void;
    ref?: Ref<HTMLElement>;
};
export function PopoverHeader({
    className,
    ...props
}: HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            {...props}
            className={[styles.header, className].filter(Boolean).join(' ')}
        />
    );
}

export type PopoverHeaderProps = HTMLAttributes<HTMLDivElement>;

export type PopoverItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    selected?: boolean;
};

export const PopoverItem = forwardRef<HTMLButtonElement, PopoverItemProps>(
    function PopoverItem(
        { children, className, selected = false, ...props },
        ref,
    ) {
        return (
            <button
                {...props}
                aria-checked={selected}
                className={[
                    styles.item,
                    selected ? styles.selected : undefined,
                    className,
                ]
                    .filter(Boolean)
                    .join(' ')}
                ref={ref}
                role='menuitemradio'
                type={props.type ?? 'button'}
            >
                <span className={styles.itemLabel}>{children}</span>
                {selected ? <span aria-hidden='true'>✓</span> : null}
            </button>
        );
    },
);

export type PopoverSeparatorProps = HTMLAttributes<HTMLDivElement>;

export function PopoverSeparator({
    className,
    ...props
}: HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            {...props}
            className={[styles.separator, className].filter(Boolean).join(' ')}
            role='separator'
        />
    );
}

export type PopoverCloseProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
};

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
