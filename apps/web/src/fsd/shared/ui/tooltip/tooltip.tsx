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
    type FocusEvent,
    type KeyboardEvent,
    type ReactElement,
    type ReactNode,
    useEffect,
    useId,
    useRef,
    useState,
} from 'react';
import { createPortal } from 'react-dom';

import styles from './tooltip.module.css';

type TriggerProps = {
    'aria-describedby'?: string;
    onBlur?(event: FocusEvent): void;
    onFocus?(event: FocusEvent): void;
    onKeyDown?(event: KeyboardEvent): void;
};

export type TooltipProps = {
    children: ReactElement<TriggerProps>;
    className?: string;
    content: ReactNode;
    delay?: number;
    disabled?: boolean;
    open?: boolean;
    placement?: Placement;
    withArrow?: boolean;
};

export function Tooltip({
    children,
    className,
    content,
    delay = 500,
    disabled = false,
    open: forcedOpen,
    placement = 'top',
    withArrow = true,
}: TooltipProps) {
    const id = useId();
    const panelRef = useRef<HTMLDivElement | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const nativePopover = false;
    const [mounted, setMounted] = useState(false);
    const [open, setOpen] = useState(false);
    const { floatingStyles, refs } = useFloating({
        middleware: [offset(8), flip({ padding: 16 }), shift({ padding: 16 })],
        onOpenChange: setOpen,
        open,
        placement,
        strategy: 'fixed',
        whileElementsMounted: open ? autoUpdate : undefined,
    });

    useEffect(() => {
        setMounted(true);
        return () => {
            if (timer.current) clearTimeout(timer.current);
        };
    }, []);

    useEffect(() => {
        if (!open) return;
        function dismissWithEscape(event: globalThis.KeyboardEvent) {
            if (event.key !== 'Escape') return;
            if (timer.current) clearTimeout(timer.current);
            if (nativePopover) panelRef.current?.hidePopover();
            setOpen(false);
        }
        document.addEventListener('keydown', dismissWithEscape);
        return () => document.removeEventListener('keydown', dismissWithEscape);
    }, [nativePopover, open]);

    function setPanel(node: HTMLDivElement | null) {
        panelRef.current = node;
        refs.setFloating(node);
    }

    function show() {
        if (timer.current) clearTimeout(timer.current);
        if (nativePopover) panelRef.current?.showPopover();
        setOpen(true);
    }

    function showAfterDelay() {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(show, delay);
    }

    function hide() {
        if (timer.current) clearTimeout(timer.current);
        if (nativePopover) panelRef.current?.hidePopover();
        setOpen(false);
    }

    if (disabled || !content) return children;

    const visible = forcedOpen ?? open;
    const describedBy = visible
        ? [children.props['aria-describedby'], id].filter(Boolean).join(' ')
        : children.props['aria-describedby'];
    const triggerProps: Partial<TriggerProps> = {
        onBlur(event: FocusEvent) {
            children.props.onBlur?.(event);
            hide();
        },
        onFocus(event: FocusEvent) {
            children.props.onFocus?.(event);
            show();
        },
        onKeyDown(event: KeyboardEvent) {
            children.props.onKeyDown?.(event);
            if (event.key === 'Escape') hide();
        },
    };
    if (describedBy) triggerProps['aria-describedby'] = describedBy;
    const trigger = cloneElement(children, triggerProps);

    return (
        <span
            className={styles.root}
            onMouseEnter={forcedOpen === undefined ? showAfterDelay : undefined}
            onMouseLeave={forcedOpen === undefined ? hide : undefined}
            ref={refs.setReference}
        >
            {trigger}
            {mounted
                ? createPortal(
                      <div
                          className={[styles.tooltip, className]
                              .filter(Boolean)
                              .join(' ')}
                          hidden={!nativePopover && !visible}
                          id={id}
                          onMouseEnter={show}
                          popover={nativePopover ? 'manual' : undefined}
                          ref={setPanel}
                          role='tooltip'
                          style={floatingStyles}
                      >
                          {content}
                          {withArrow ? (
                              <span
                                  aria-hidden='true'
                                  className={styles.arrow}
                              />
                          ) : null}
                      </div>,
                      document.body,
                  )
                : null}
        </span>
    );
}
