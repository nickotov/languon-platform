'use client';

import type { ReactNode } from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { Badge, Button } from '@/fsd/shared/ui';
import styles from '../../../../styles/profile-page-common.module.css';
import { SettingsSection } from '../settings-section/settings-section';

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
