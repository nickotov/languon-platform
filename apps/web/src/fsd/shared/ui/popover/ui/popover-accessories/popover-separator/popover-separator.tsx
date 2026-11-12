'use client';

import { type HTMLAttributes } from 'react';
import styles from '../../../../styles/popover-common.module.css';

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
