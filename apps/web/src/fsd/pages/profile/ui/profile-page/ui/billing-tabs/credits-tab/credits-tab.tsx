'use client';

import { Download, WalletCards } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { CreditBalance } from '../../../../credit-balance/credit-balance';
import { EmptySettings } from '../../settings-parts';
import styles from '../../../../styles/profile-page-common.module.css';

export function CreditsTab() {
    const { t } = useI18n();

    return (
        <div className={styles.sections}>
            <CreditBalance />
            <EmptySettings
                icon={<WalletCards className={styles.glyph} />}
                title={t('profile.usageTitle')}
                description={t('profile.usageEmpty')}
            />
            <EmptySettings
                icon={<Download className={styles.glyph} />}
                title={t('profile.historyTitle')}
                description={t('profile.historyEmpty')}
            />
        </div>
    );
}
