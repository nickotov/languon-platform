'use client';

import { type HTMLAttributes } from 'react';
import styles from '../../../../styles/popover-common.module.css';

export function PopoverHeader({
    className,
    ...props
}: HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            {...props}
            className={[styles.header, className].filter(Boolean).join(' ')}
        />
    );
}
