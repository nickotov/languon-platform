'use client';

import { forwardRef } from 'react';
import styles from '../../../../styles/popover-common.module.css';
import type { PopoverItemProps } from '../types';

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
