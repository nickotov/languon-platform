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
    type KeyboardEvent,
    type ReactNode,
    useEffect,
    useId,
    useRef,
    useState,
} from 'react';

import styles from './popover.module.css';

export function Popover({
    children,
    label,
    placement = 'bottom-end',
    trigger,
}: {
    children: ReactNode;
    label: string;
    placement?: Placement;
    trigger: ReactNode;
}) {
    const id = useId();
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const [nativePopover, setNativePopover] = useState(false);
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
        function syncNativeState(event: Event) {
            const nextOpen = (event as ToggleEvent).newState === 'open';
            setOpen(nextOpen);
            if (nextOpen) panelRef.current?.focus();
        }
        panel.addEventListener('toggle', syncNativeState);
        return () => panel.removeEventListener('toggle', syncNativeState);
    }, []);

    useEffect(() => {
        if (!open || nativePopover !== false) return;
        function dismissFallback(event: PointerEvent) {
            if (
                !panelRef.current?.contains(event.target as Node) &&
                !triggerRef.current?.contains(event.target as Node)
            ) {
                setOpen(false);
            }
        }
        document.addEventListener('pointerdown', dismissFallback);
        return () =>
            document.removeEventListener('pointerdown', dismissFallback);
    }, [nativePopover, open]);

    useEffect(() => {
        if (open && !nativePopover) panelRef.current?.focus();
    }, [nativePopover, open]);

    function setPanel(node: HTMLDivElement | null) {
        panelRef.current = node;
        refs.setFloating(node);
    }

    function setTrigger(node: HTMLButtonElement | null) {
        triggerRef.current = node;
        refs.setReference(node);
    }

    function show() {
        if (!panelRef.current) return;
        setOpen(true);
    }

    function hide({ restoreFocus = false } = {}) {
        if (nativePopover) panelRef.current?.hidePopover();
        setOpen(false);
        if (restoreFocus) triggerRef.current?.focus();
    }

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        hide({ restoreFocus: true });
    }

    return (
        <span className={styles.root}>
            <button
                aria-controls={id}
                aria-expanded={open}
                aria-haspopup='dialog'
                aria-label={label}
                className={styles.trigger}
                onClick={
                    nativePopover ? undefined : () => (open ? hide() : show())
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
                    ) {
                        hide();
                    }
                }}
                onKeyDown={handleKeyDown}
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
