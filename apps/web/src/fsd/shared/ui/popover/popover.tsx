'use client';

import {
    autoUpdate,
    flip,
    offset,
    type Placement,
    shift,
    useFloating,
} from '@floating-ui/react';
import {
    cloneElement,
    createContext,
    forwardRef,
    isValidElement,
    type ButtonHTMLAttributes,
    type CSSProperties,
    type HTMLAttributes,
    type MutableRefObject,
    type ReactElement,
    type ReactNode,
    type Ref,
    type SyntheticEvent,
    useCallback,
    useContext,
    useEffect,
    useId,
    useRef,
    useState,
} from 'react';
import { createPortal } from 'react-dom';

import styles from './popover.module.css';

type PopoverContextValue = {
    contentId: string;
    contentRef: MutableRefObject<HTMLDivElement | null>;
    floatingStyles: CSSProperties;
    open: boolean;
    setOpen(open: boolean): void;
    setPosition(placement: Placement, sideOffset: number): void;
    triggerRef: MutableRefObject<HTMLElement | null>;
};
const PopoverContext = createContext<PopoverContextValue | null>(null);
const usePopover = () => {
    const context = useContext(PopoverContext);
    if (!context) throw new Error('Popover parts must be used within Popover');
    return context;
};

export type PopoverRootProps = {
    children: ReactNode;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    open?: boolean;
};
export type LegacyPopoverProps = {
    children: ReactNode;
    label: string;
    placement?: Placement;
    trigger: ReactNode;
};

export function Popover(props: PopoverRootProps | LegacyPopoverProps) {
    if ('trigger' in props) return <LegacyPopover {...props} />;
    return <PopoverRoot {...props} />;
}

function LegacyPopover({
    children,
    label,
    placement = 'bottom-end',
    trigger,
}: LegacyPopoverProps) {
    const id = useId();
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const [nativePopover, setNativePopover] = useState(false);
    const [open, setOpen] = useState(false);
    const { floatingStyles, refs } = useFloating({
        middleware: [offset(8), flip({ padding: 16 }), shift({ padding: 16 })],
        open,
        placement,
        strategy: 'fixed',
        whileElementsMounted: open ? autoUpdate : undefined,
    });
    useEffect(() => {
        setNativePopover(
            Boolean(
                'showPopover' in HTMLElement.prototype &&
                typeof CSS !== 'undefined' &&
                CSS.supports?.('selector(:popover-open)'),
            ),
        );
    }, []);
    useEffect(() => {
        const panel = panelRef.current;
        if (!panel) return;
        const sync = (event: Event) => {
            const nextOpen = (event as ToggleEvent).newState === 'open';
            setOpen(nextOpen);
            if (nextOpen) panel.focus();
        };
        panel.addEventListener('toggle', sync);
        return () => panel.removeEventListener('toggle', sync);
    }, []);
    useEffect(() => {
        if (!open || nativePopover) return;
        const dismiss = (event: PointerEvent) => {
            if (
                !panelRef.current?.contains(event.target as Node) &&
                !triggerRef.current?.contains(event.target as Node)
            )
                setOpen(false);
        };
        document.addEventListener('pointerdown', dismiss);
        return () => document.removeEventListener('pointerdown', dismiss);
    }, [nativePopover, open]);
    useEffect(() => {
        if (open && !nativePopover) panelRef.current?.focus();
    }, [nativePopover, open]);
    const setPanel = (node: HTMLDivElement | null) => {
        panelRef.current = node;
        refs.setFloating(node);
    };
    const setTrigger = (node: HTMLButtonElement | null) => {
        triggerRef.current = node;
        refs.setReference(node);
    };
    const hide = (restoreFocus = false) => {
        if (nativePopover) panelRef.current?.hidePopover();
        setOpen(false);
        if (restoreFocus) triggerRef.current?.focus();
    };
    return (
        <span className={styles.root}>
            <button
                aria-controls={id}
                aria-expanded={open}
                aria-haspopup='dialog'
                aria-label={label}
                className={styles.trigger}
                onClick={
                    nativePopover
                        ? undefined
                        : () => (open ? hide() : setOpen(true))
                }
                popoverTarget={nativePopover ? id : undefined}
                popoverTargetAction={nativePopover ? 'toggle' : undefined}
                ref={setTrigger}
                type='button'
            >
                {trigger}
            </button>
            <div
                aria-label={label}
                className={styles.content}
                hidden={!nativePopover && !open}
                id={id}
                onBlur={(event) => {
                    if (
                        !event.currentTarget.contains(event.relatedTarget) &&
                        !triggerRef.current?.contains(event.relatedTarget)
                    )
                        hide();
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        hide(true);
                    }
                }}
                popover={nativePopover ? 'auto' : undefined}
                ref={setPanel}
                role='dialog'
                style={floatingStyles}
                tabIndex={-1}
            >
                {children}
            </div>
        </span>
    );
}

function PopoverRoot({
    children,
    defaultOpen = false,
    onOpenChange,
    open: controlledOpen,
}: PopoverRootProps) {
    const [internalOpen, setInternalOpen] = useState(defaultOpen);
    const [placement, setPlacement] = useState<Placement>('bottom');
    const [sideOffset, setSideOffset] = useState(8);
    const open = controlledOpen ?? internalOpen;
    const triggerRef = useRef<HTMLElement | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const contentId = useId();
    const { floatingStyles, refs } = useFloating({
        middleware: [
            offset(sideOffset),
            flip({ padding: 16 }),
            shift({ padding: 16 }),
        ],
        open,
        placement,
        strategy: 'fixed',
        whileElementsMounted: open ? autoUpdate : undefined,
    });
    const setOpen = useCallback(
        (next: boolean) => {
            if (controlledOpen === undefined) setInternalOpen(next);
            onOpenChange?.(next);
        },
        [controlledOpen, onOpenChange],
    );
    const setPosition = useCallback(
        (nextPlacement: Placement, nextOffset: number) => {
            setPlacement(nextPlacement);
            setSideOffset(nextOffset);
        },
        [],
    );
    useEffect(() => {
        refs.setReference(triggerRef.current);
        refs.setFloating(contentRef.current);
        if (!open) return;
        const dismiss = (event: PointerEvent) => {
            if (
                !contentRef.current?.contains(event.target as Node) &&
                !triggerRef.current?.contains(event.target as Node)
            )
                setOpen(false);
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
                triggerRef.current?.focus();
            }
        };
        document.addEventListener('pointerdown', dismiss);
        document.addEventListener('keydown', escape);
        return () => {
            document.removeEventListener('pointerdown', dismiss);
            document.removeEventListener('keydown', escape);
        };
    }, [open, refs, setOpen]);
    return (
        <PopoverContext.Provider
            value={{
                contentId,
                contentRef,
                floatingStyles,
                open,
                setOpen,
                setPosition,
                triggerRef,
            }}
        >
            <span className={styles.root}>{children}</span>
        </PopoverContext.Provider>
    );
}

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
const assignRef = <T,>(ref: Ref<T> | undefined, value: T | null) => {
    if (typeof ref === 'function') ref(value);
    else if (ref) ref.current = value;
};
const composeHandlers =
    <E extends SyntheticEvent>(
        childHandler: ((event: E) => void) | undefined,
        ownHandler: (event: E) => void,
    ) =>
    (event: E) => {
        childHandler?.(event);
        if (!event.defaultPrevented) ownHandler(event);
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
};
export const PopoverAnchor = forwardRef<HTMLElement, PopoverAnchorProps>(
    function PopoverAnchor(
        { asChild = false, children, className, ...props },
        forwardedRef,
    ) {
        const context = usePopover();
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

type PopoverSide = 'bottom' | 'left' | 'right' | 'top';
export type PopoverContentProps = HTMLAttributes<HTMLDivElement> & {
    align?: 'center' | 'end' | 'start';
    showArrow?: boolean;
    side?: PopoverSide;
    sideOffset?: number;
};
export const PopoverContent = forwardRef<HTMLDivElement, PopoverContentProps>(
    function PopoverContent(
        {
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
        const { setPosition } = context;
        const [mounted, setMounted] = useState(false);
        useEffect(() => {
            setMounted(true);
            setPosition(
                (side + (align === 'center' ? '' : '-' + align)) as Placement,
                sideOffset,
            );
        }, [align, setPosition, side, sideOffset]);
        if (!mounted || !context.open) return null;
        return createPortal(
            <div
                {...props}
                className={[styles.content, className]
                    .filter(Boolean)
                    .join(' ')}
                id={context.contentId}
                ref={(node) => {
                    context.contentRef.current = node;
                    if (typeof forwardedRef === 'function') forwardedRef(node);
                    else if (forwardedRef) forwardedRef.current = node;
                }}
                role={props.role ?? 'dialog'}
                style={{ ...context.floatingStyles, ...props.style }}
            >
                {children}
                {showArrow ? (
                    <span aria-hidden='true' className={styles.arrow} />
                ) : null}
            </div>,
            document.body,
        );
    },
);

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
        const close = () => context.setOpen(false);
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
