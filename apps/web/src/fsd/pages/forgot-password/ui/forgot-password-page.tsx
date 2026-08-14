'use client';

import { AuthShell, ForgotPasswordForm } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';

export function ForgotPasswordPage() {
    const { t } = useI18n();
    return (
        <AuthShell eyebrow={t('forgot.eyebrow')} title={t('forgot.title')}>
            <ForgotPasswordForm />
        </AuthShell>
    );
}
