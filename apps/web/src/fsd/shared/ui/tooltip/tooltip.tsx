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

export function Tooltip({
    children,
    content,
    placement = 'top',
}: {
    children: ReactElement<TriggerProps>;
    content: ReactNode;
    placement?: Placement;
}) {
    const id = useId();
    const panelRef = useRef<HTMLDivElement | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [nativePopover, setNativePopover] = useState(false);
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
        setNativePopover(
            Boolean(
                'showPopover' in HTMLElement.prototype &&
                typeof CSS !== 'undefined' &&
                CSS.supports?.('selector(:popover-open)'),
            ),
        );
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
        timer.current = setTimeout(show, 500);
    }

    function hide() {
        if (timer.current) clearTimeout(timer.current);
        if (nativePopover) panelRef.current?.hidePopover();
        setOpen(false);
    }

    const describedBy = open
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
            onMouseEnter={showAfterDelay}
            onMouseLeave={hide}
            ref={refs.setReference}
        >
            {trigger}
            {mounted
                ? createPortal(
                      <div
                          className={styles.tooltip}
                          hidden={!nativePopover && !open}
                          id={id}
                          onMouseEnter={show}
                          popover={nativePopover ? 'manual' : undefined}
                          ref={setPanel}
                          role='tooltip'
                          style={floatingStyles}
                      >
                          {content}
                      </div>,
                      document.body,
                  )
                : null}
        </span>
    );
}
