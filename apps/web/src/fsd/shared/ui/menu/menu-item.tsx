import { type KeyboardEvent, useCallback } from 'react';

import type { MenuItem } from './types';
import styles from './menu.module.css';

export function MenuItemButton({
    item,
    index,
    onClose,
    onMove,
    onRegister,
}: {
    item: MenuItem;
    index: number;
    onClose(): void;
    onMove(event: KeyboardEvent<HTMLButtonElement>, index: number): void;
    onRegister(index: number, node: HTMLButtonElement | null): void;
}) {
    const register = useCallback(
        (node: HTMLButtonElement | null) => {
            onRegister(index, node);
        },
        [index, onRegister],
    );

    function select() {
        item.onSelect();
        if (item.closeOnSelect !== false) onClose();
    }

    function move(event: KeyboardEvent<HTMLButtonElement>) {
        onMove(event, index);
    }

    const accessibleLabel = item.hint
        ? `${item.label} ${item.hint}`
        : undefined;

    return (
        <button
            className={styles.item}
            aria-label={accessibleLabel}
            data-tone={item.tone}
            disabled={item.disabled}
            onClick={select}
            onKeyDown={move}
            ref={register}
            role='menuitem'
            tabIndex={-1}
            type='button'
        >
            {item.icon ? (
                <span aria-hidden='true' className={styles.itemIcon}>
                    {item.icon}
                </span>
            ) : null}
            {item.label}
            {item.hint && <span className={styles.hint}> {item.hint}</span>}
        </button>
    );
}
