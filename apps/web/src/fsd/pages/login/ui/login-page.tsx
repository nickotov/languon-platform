'use client';

import { AuthShell, LoginForm } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';

export function LoginPage(props: {
    passwordReset?: string | undefined;
    returnTo?: string | undefined;
}) {
    const { t } = useI18n();
    return (
        <AuthShell eyebrow={t('login.eyebrow')} title={t('login.title')}>
            <LoginForm {...props} />
        </AuthShell>
    );
}
