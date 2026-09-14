'use client';

import { AuthShell, SecuritySettings } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';

export function SecurityPage() {
    const { t } = useI18n();
    return (
        <AuthShell
            eyebrow={t('security.eyebrow')}
            title={t('security.title')}
            variant='account'
        >
            <SecuritySettings />
        </AuthShell>
    );
}
