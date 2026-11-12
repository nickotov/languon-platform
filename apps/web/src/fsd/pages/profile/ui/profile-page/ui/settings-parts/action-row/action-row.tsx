'use client';

import type { ReactNode } from 'react';
import { Button } from '@/fsd/shared/ui';
import styles from '../../../../styles/profile-page-common.module.css';

export function ActionRow({
    button,
    children,
    danger = false,
    description,
    icon,
    label,
    onClick,
}: {
    button?: string;
    children?: ReactNode;
    danger?: boolean;
    description: string;
    icon: ReactNode;
    label: string;
    onClick?: () => void;
}) {
    return (
        <div className={styles.actionRow}>
            <span aria-hidden='true' className={styles.rowIcon}>
                {icon}
            </span>
            <div className={styles.rowCopy}>
                <h3 className={styles.rowTitle}>{label}</h3>
                <p className={styles.rowDescription}>{description}</p>
            </div>
            {children ??
                (button && onClick ? (
                    <Button
                        className={styles.rowAction}
                        onClick={onClick}
                        size='compact'
                        variant={danger ? 'danger' : 'secondary'}
                    >
                        {button}
                    </Button>
                ) : null)}
        </div>
    );
}
