'use client';

import { useI18n } from '@/fsd/shared/i18n';
import { LoadingState } from '@/fsd/shared/ui';
import styles from '../../../styles/profile-page-common.module.css';

export function ProfilePageFallback() {
    const { t } = useI18n();

    return (
        <main className={styles.centered}>
            <LoadingState>{t('profile.loading')}</LoadingState>
        </main>
    );
}
