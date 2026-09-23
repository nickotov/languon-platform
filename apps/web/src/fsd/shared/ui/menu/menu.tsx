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

import styles from './menu.module.css';

import { MenuItemButton } from './menu-item';
import type { MenuItem, MenuProps } from './types';

export function Menu({ items, label, trigger, iconOnly = false }: MenuProps) {
    const id = useId();
    const root = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const [open, setOpen] = useState(false);
    const disabled = items.every((item) => item.disabled);
    const { floatingStyles, refs } = useFloating({
        middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
        onOpenChange: setOpen,
        open,
        placement: 'bottom-end',
        strategy: 'fixed',
        whileElementsMounted: open ? autoUpdate : undefined,
    });

    useEffect(() => {
        if (!open) return;
        itemRefs.current.find((item) => item && !item.disabled)?.focus();

        function dismiss(event: PointerEvent) {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        }
        document.addEventListener('pointerdown', dismiss);
        return () => document.removeEventListener('pointerdown', dismiss);
    }, [open]);

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
        const next =
            event.key === 'ArrowDown'
                ? (current + 1) % enabled.length
                : event.key === 'ArrowUp'
                  ? (current - 1 + enabled.length) % enabled.length
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? enabled.length - 1
                      : null;
        if (next === null) return;
        event.preventDefault();
        enabled[next]?.focus();
    }

    const triggerClassName = [styles.trigger, iconOnly ? styles.iconOnly : '']
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
            </button>
            {open ? (
                <div
                    className={styles.menu}
                    id={id}
                    ref={refs.setFloating}
                    role='menu'
                    style={floatingStyles}
                >
                    {items.map(renderItem)}
                </div>
            ) : null}
        </div>
    );
}
