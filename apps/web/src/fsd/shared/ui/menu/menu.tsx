'use client';

import {
    autoUpdate,
    flip,
    offset,
    shift,
    useFloating,
} from '@floating-ui/react';
import {
    type KeyboardEvent,
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
} from 'react';

import styles from './menu-common.module.css';

import { MenuItemButton } from './menu-item';
import type { MenuItem, MenuProps } from './types';

export function Menu({
    items,
    label,
    trigger,
    iconOnly = false,
    allowDisabledItems = false,
    heading,
    triggerClassName: customTriggerClassName,
    menuClassName,
    placement = 'bottom-end',
    variant = 'default',
    showChevron = false,
}: MenuProps) {
    const id = useId();

    const root = useRef<HTMLDivElement>(null);

    const triggerRef = useRef<HTMLButtonElement>(null);

    const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

    const [open, setOpen] = useState(false);

    const disabled =
        !allowDisabledItems && items.every((item) => item.disabled);

    const { floatingStyles, refs } = useFloating({
        middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
        onOpenChange: setOpen,
        open,
        placement,
        strategy: 'fixed',
        whileElementsMounted: open ? autoUpdate : undefined,
    });

    useEffect(() => {
        if (!open) return;

        const first = itemRefs.current.find((item) => item && !item.disabled);

        if (first) first.focus();
        else refs.floating.current?.focus();

        function dismiss(event: PointerEvent) {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        }

        document.addEventListener('pointerdown', dismiss);

        return () => document.removeEventListener('pointerdown', dismiss);
    }, [open, refs.floating]);

    useEffect(() => {
        if (disabled && open) setOpen(false);
    }, [disabled, open]);

    function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
        if (event.key === 'Escape') {
            event.preventDefault();

            setOpen(false);

            triggerRef.current?.focus();

            return;
        }

        if (event.key === 'Tab') {
            setOpen(false);

            return;
        }

        const enabled = itemRefs.current.filter(
            (item): item is HTMLButtonElement =>
                Boolean(item && !item.disabled),
        );

        const currentItem = itemRefs.current[index];

        if (!currentItem || enabled.length === 0) return;

        const current = enabled.indexOf(currentItem);

        function resolveNext() {
            if (event.key === 'ArrowDown') {
                return (current + 1) % enabled.length;
            }

            if (event.key === 'ArrowUp') {
                return (current - 1 + enabled.length) % enabled.length;
            }

            if (event.key === 'Home') {
                return 0 as const;
            }

            if (event.key === 'End') {
                return enabled.length - 1;
            }

            return null;
        }

        const next = resolveNext();

        if (next === null) return;

        event.preventDefault();

        enabled[next]?.focus();
    }

    const triggerClassName = [
        styles.trigger,
        iconOnly ? styles.iconOnly : '',
        variant === 'secondary' ? styles.secondary : '',
        customTriggerClassName,
    ]
        .filter(Boolean)
        .join(' ');

    const setReference = refs.setReference;

    const registerTrigger = useCallback(
        (node: HTMLButtonElement | null) => {
            triggerRef.current = node;

            setReference(node);
        },
        [setReference],
    );

    const registerItem = useCallback(
        (index: number, node: HTMLButtonElement | null) => {
            itemRefs.current[index] = node;
        },
        [],
    );

    function toggle() {
        setOpen((current) => !current);
    }

    function closeAndRestoreFocus() {
        setOpen(false);

        triggerRef.current?.focus();
    }

    function handleMenuKey(event: KeyboardEvent<HTMLDivElement>) {
        if (event.defaultPrevented) return;

        if (event.key === 'Escape') {
            event.preventDefault();

            closeAndRestoreFocus();
        } else if (event.key === 'Tab') setOpen(false);
    }

    function renderItem(item: MenuItem, index: number) {
        return (
            <MenuItemButton
                key={item.label}
                item={item}
                index={index}
                onClose={closeAndRestoreFocus}
                onMove={move}
                onRegister={registerItem}
            />
        );
    }

    return (
        <div className={styles.root} ref={root}>
            <button
                aria-controls={id}
                aria-expanded={open}
                aria-haspopup='menu'
                aria-label={label}
                className={triggerClassName}
                disabled={disabled}
                onClick={toggle}
                ref={registerTrigger}
                type='button'
            >
                {trigger}
                {showChevron && (
                    <svg
                        className={styles.chevron}
                        data-open={open || undefined}
                        aria-hidden='true'
                        width='16'
                        height='16'
                        viewBox='0 0 24 24'
                        fill='none'
                        stroke='currentColor'
                        strokeWidth='2'
                    >
                        <path d='m6 9 6 6 6-6' />
                    </svg>
                )}
            </button>
            {open ? (
                <div
                    className={[styles.menu, menuClassName]
                        .filter(Boolean)
                        .join(' ')}
                    id={id}
                    ref={refs.setFloating}
                    role='menu'
                    tabIndex={-1}
                    onKeyDown={handleMenuKey}
                    style={floatingStyles}
                >
                    {heading && (
                        <div role='presentation' className={styles.heading}>
                            {heading}
                        </div>
                    )}
                    {items.map(renderItem)}
                </div>
            ) : null}
        </div>
    );
}
