'use client';

import {
    AuthFooterLink,
    AuthShell,
    ForgotPasswordForm,
} from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';

export function ForgotPasswordPage() {
    const { href, t } = useI18n();
    return (
        <AuthShell
            description={t('forgot.intro')}
            eyebrow={t('forgot.eyebrow')}
            footer={
                <AuthFooterLink href={href('/login')}>
                    {t('forgot.back')}
                </AuthFooterLink>
            }
            title={t('forgot.title')}
        >
            <ForgotPasswordForm />
        </AuthShell>
    );
}
