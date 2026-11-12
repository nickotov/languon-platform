'use client';

import { Coins, CreditCard, WalletCards } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { EmptySettings } from '../../settings-parts';
import type { ComingSoonProps } from '../../../types';
import styles from '../../../../styles/profile-page-common.module.css';

export function BillingTab({ onComingSoon }: ComingSoonProps) {
    const { t } = useI18n();

    return (
        <div className={styles.sections}>
            <EmptySettings
                icon={<CreditCard className={styles.glyph} />}
                title={t('profile.subscriptionTitle')}
                description={t('profile.subscriptionEmpty')}
                button={t('profile.comparePlans')}
                onClick={() => onComingSoon(t('profile.subscriptionTitle'))}
            />
            <EmptySettings
                icon={<WalletCards className={styles.glyph} />}
                title={t('profile.paymentTitle')}
                description={t('profile.paymentEmpty')}
                button={t('profile.addPayment')}
                onClick={() => onComingSoon(t('profile.paymentTitle'))}
            />
            <EmptySettings
                icon={<Coins className={styles.glyph} />}
                title={t('profile.extraCreditsTitle')}
                description={t('profile.extraCreditsEmpty')}
                button={t('profile.buyCredits')}
                onClick={() => onComingSoon(t('profile.extraCreditsTitle'))}
            />
        </div>
    );
}
