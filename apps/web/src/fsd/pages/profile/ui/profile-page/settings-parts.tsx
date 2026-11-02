'use client';

import type { ReactNode } from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { Badge, Button, Card } from '@/fsd/shared/ui';
import styles from './profile-page.module.css';

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

export function EmptySettings({
    button,
    description,
    icon,
    onClick,
    title,
}: {
    button?: string;
    description: string;
    icon: ReactNode;
    onClick?: () => void;
    title: string;
}) {
    const { t } = useI18n();

    return (
        <SettingsSection description={description} title={title}>
            <div className={styles.emptyBlock}>
                <span aria-hidden='true' className={styles.emptyIcon}>
                    {icon}
                </span>
                <div className={styles.emptyCopy}>
                    <Badge size='sm' tone='info'>
                        {t('profile.comingSoon')}
                    </Badge>
                    <p className={styles.emptyDescription}>{description}</p>
                </div>
                {button && onClick ? (
                    <Button
                        className={styles.emptyAction}
                        onClick={onClick}
                        size='compact'
                        variant='secondary'
                    >
                        {button}
                    </Button>
                ) : null}
            </div>
        </SettingsSection>
    );
}
