'use client';

import { AuthLinks, AuthShell, LoginForm } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';

export function LoginPage(props: {
    passwordReset?: string | undefined;
    returnTo?: string | undefined;
}) {
    const { t } = useI18n();
    return (
        <AuthShell
            description={t('login.intro')}
            eyebrow={t('login.eyebrow')}
            footer={<AuthLinks mode='login' returnTo={props.returnTo} />}
            title={t('login.title')}
        >
            <LoginForm {...props} />
        </AuthShell>
    );
}
