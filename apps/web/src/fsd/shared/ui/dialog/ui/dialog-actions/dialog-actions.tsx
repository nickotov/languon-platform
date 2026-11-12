'use client';

import styles from '../../../styles/dialog-common.module.css';
import type { DialogActionsProps } from '../../types';

export function DialogActions({
    align = 'end',
    className,
    ...props
}: DialogActionsProps) {
    return (
        <div
            {...props}
            className={[styles.actions, styles[`actions-${align}`], className]
                .filter(Boolean)
                .join(' ')}
        />
    );
}
