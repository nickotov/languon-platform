'use client';

import { Mail } from 'lucide-react';
import { SecuritySettings } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';
import { Badge, Button, showToast } from '@/fsd/shared/ui';
import { ActionRow, SettingsSection } from './settings-parts';
import styles from './profile-page.module.css';

export function SecurityTab({ email }: { email: string }) {
    const { t } = useI18n();

    const requestEmailChange = () =>
        showToast({
            content: t('profile.emailChangeNotSent'),
            dismissLabel: t('profile.dismiss'),
            tone: 'info',
        });

    return (
        <div className={styles.sections}>
            <SettingsSection
                description={t('profile.emailDescription')}
                title={t('profile.emailTitle')}
            >
                <ActionRow
                    description={email}
                    icon={<Mail className={styles.glyph} />}
                    label={t('profile.primaryEmail')}
                    children={
                        <Badge size='sm' tone='success'>
                            {t('profile.verified')}
                        </Badge>
                    }
                />
                <div className={styles.emailChange}>
                    <p
                        className={`${styles.muted} ${styles.emailChangeDescription}`}
                    >
                        {t('profile.emailChangeComingSoon')}
                    </p>
                    <Button
                        onClick={requestEmailChange}
                        size='compact'
                        variant='secondary'
                    >
                        {t('profile.requestEmailChange')}
                    </Button>
                </div>
            </SettingsSection>
            <SecuritySettings embedded />
        </div>
    );
}
