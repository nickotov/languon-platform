'use client';

import type { ReactNode } from 'react';
import { Card } from '@/fsd/shared/ui';
import styles from '../../../../styles/profile-page-common.module.css';

export function SettingsSection({
    children,
    danger = false,
    description,
    title,
}: {
    children: ReactNode;
    danger?: boolean;
    description: string;
    title: string;
}) {
    return (
        <Card
            className={danger ? styles.dangerSection : styles.section}
            padding='none'
            variant='outlined'
        >
            <header className={styles.sectionHeader}>
                <h2
                    className={
                        danger
                            ? `${styles.sectionTitle} ${styles.dangerTitle}`
                            : styles.sectionTitle
                    }
                >
                    {title}
                </h2>
                <p className={styles.sectionDescription}>{description}</p>
            </header>
            <div className={styles.sectionBody}>{children}</div>
        </Card>
    );
}
