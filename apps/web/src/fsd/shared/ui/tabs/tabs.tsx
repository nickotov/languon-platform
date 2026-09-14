'use client';

import {
    type KeyboardEvent,
    type ReactNode,
    useId,
    useMemo,
    useRef,
    useState,
} from 'react';

import styles from './tabs.module.css';

export type TabItem = {
    badge?: ReactNode;
    content?: ReactNode;
    disabled?: boolean;
    icon?: ReactNode;
    label: ReactNode;
    value?: string;
};
export type TabsVariant = 'segmented' | 'underline';
export type TabsSize = 'md' | 'sm';
export type TabsProps = {
    'aria-label'?: string;
    children?: (activeValue: string) => ReactNode;
    className?: string;
    defaultValue?: string;
    fullWidth?: boolean;
    items: TabItem[];
    label?: string;
    onValueChange?: (value: string) => void;
    size?: TabsSize;
    value?: string;
    variant?: TabsVariant;
};

export function Tabs({
    'aria-label': ariaLabel,
    children,
    className,
    defaultValue,
    fullWidth = false,
    items,
    label,
    onValueChange,
    size = 'md',
    value,
    variant = 'underline',
}: TabsProps) {
    const normalized = useMemo(
        () =>
            items.map((item, index) => ({
                ...item,
                value: item.value ?? String(index),
            })),
        [items],
    );
    const firstEnabled = normalized.find((item) => !item.disabled)?.value ?? '';
    const [internalValue, setInternalValue] = useState(
        defaultValue ?? firstEnabled,
    );
    const activeValue = value ?? internalValue;
    const rootId = useId();
    const refs = useRef<Record<string, HTMLButtonElement | null>>({});
    const enabled = normalized
        .filter((item) => !item.disabled)
        .map((item) => item.value);
    const select = (next: string) => {
        if (value === undefined) setInternalValue(next);
        onValueChange?.(next);
    };
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (
            !['ArrowLeft', 'ArrowRight', 'End', 'Home'].includes(event.key) ||
            enabled.length === 0
        )
            return;
        event.preventDefault();
        const current = Math.max(0, enabled.indexOf(activeValue));
        const next =
            event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? enabled.length - 1
                  : event.key === 'ArrowRight'
                    ? (current + 1) % enabled.length
                    : (current - 1 + enabled.length) % enabled.length;
        const nextValue = enabled[next];
        if (!nextValue) return;
        select(nextValue);
        refs.current[nextValue]?.focus();
    };
    const activeItem = normalized.find((item) => item.value === activeValue);
    return (
        <div className={[styles.root, className].filter(Boolean).join(' ')}>
            <div
                aria-label={ariaLabel ?? label ?? 'Tabs'}
                className={[
                    styles.list,
                    styles[variant],
                    fullWidth ? styles.fullWidth : undefined,
                ]
                    .filter(Boolean)
                    .join(' ')}
                onKeyDown={handleKeyDown}
                role='tablist'
            >
                {normalized.map((item) => {
                    const active = item.value === activeValue;
                    return (
                        <button
                            aria-controls={`${rootId}-panel-${item.value}`}
                            aria-selected={active}
                            className={[
                                styles.tab,
                                styles[size],
                                active ? styles.active : undefined,
                            ]
                                .filter(Boolean)
                                .join(' ')}
                            disabled={item.disabled}
                            id={`${rootId}-tab-${item.value}`}
                            key={item.value}
                            onClick={() => select(item.value)}
                            ref={(node) => {
                                refs.current[item.value] = node;
                            }}
                            role='tab'
                            tabIndex={active ? 0 : -1}
                            type='button'
                        >
                            {item.icon ? (
                                <span
                                    aria-hidden='true'
                                    className={styles.icon}
                                >
                                    {item.icon}
                                </span>
                            ) : null}
                            <span>{item.label}</span>
                            {item.badge !== undefined ? (
                                <span className={styles.badge}>
                                    {item.badge}
                                </span>
                            ) : null}
                        </button>
                    );
                })}
            </div>
            {children || activeItem?.content !== undefined ? (
                <div
                    aria-labelledby={`${rootId}-tab-${activeValue}`}
                    className={styles.panel}
                    id={`${rootId}-panel-${activeValue}`}
                    role='tabpanel'
                    tabIndex={0}
                >
                    {children ? children(activeValue) : activeItem?.content}
                </div>
            ) : null}
        </div>
    );
}
