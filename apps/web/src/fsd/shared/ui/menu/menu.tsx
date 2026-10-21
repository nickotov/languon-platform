'use client';

import { Popover, PopoverAnchor, PopoverContent } from '../popover/popover';
import {
    type KeyboardEvent,
    Fragment,
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
} from 'react';

import styles from './menu-common.module.css';

import { MenuItemButton } from './menu-item';
import { Tooltip } from '../tooltip/tooltip';
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
    showTooltip = false,
    tooltipPlacement = 'top',
}: MenuProps) {
    const id = useId();
    const panelRef = useRef<HTMLDivElement>(null);

    const triggerRef = useRef<HTMLButtonElement>(null);

    const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

    const [open, setOpen] = useState(false);

    const disabled =
        !allowDisabledItems && items.every((item) => item.disabled);

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
        // A selected action may open a dialog in this commit. Give its native
        // opener capture the persistent trigger rather than a departing item.
        triggerRef.current?.focus({ preventScroll: true });
        setOpen(false);

        queueMicrotask(() =>
            triggerRef.current?.focus({ preventScroll: true }),
        );
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
            <Fragment key={item.label}>
                {item.separatorBefore ? (
                    <div role='separator' className={styles.separator} />
                ) : null}
                {item.headingBefore ? (
                    <div role='presentation' className={styles.heading}>
                        {item.headingBefore}
                    </div>
                ) : null}
                <MenuItemButton
                    item={item}
                    index={index}
                    onClose={closeAndRestoreFocus}
                    onMove={move}
                    onRegister={registerItem}
                />
            </Fragment>
        );
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <div className={styles.root}>
                <Tooltip
                    content={label}
                    disabled={!showTooltip}
                    placement={tooltipPlacement}
                >
                    <PopoverAnchor asChild>
                        <button
                            aria-controls={id}
                            aria-expanded={open}
                            aria-haspopup='menu'
                            aria-label={label}
                            className={triggerClassName}
                            disabled={disabled}
                            onClick={toggle}
                            ref={triggerRef}
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
                    </PopoverAnchor>
                </Tooltip>
                {open ? (
                    <PopoverContent
                        side={
                            placement.split('-')[0] as
                                'top' | 'bottom' | 'left' | 'right'
                        }
                        align={
                            (placement.split('-')[1] ?? 'center') as
                                'start' | 'end' | 'center'
                        }
                        sideOffset={4}
                        className={[styles.menu, menuClassName]
                            .filter(Boolean)
                            .join(' ')}
                        id={id}
                        ref={panelRef}
                        onFocus={(event) => {
                            if (event.target === event.currentTarget) {
                                itemRefs.current
                                    .find((item) => item && !item.disabled)
                                    ?.focus({ preventScroll: true });
                            }
                        }}
                        role='menu'
                        tabIndex={-1}
                        onKeyDown={handleMenuKey}
                    >
                        {heading && (
                            <div role='presentation' className={styles.heading}>
                                {heading}
                            </div>
                        )}
                        {items.map(renderItem)}
                    </PopoverContent>
                ) : null}
            </div>
        </Popover>
    );
}
