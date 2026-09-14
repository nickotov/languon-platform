'use client';

import { AuthLinks, AuthShell, SignupForm } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';

export function SignupPage({ returnTo }: { returnTo?: string | undefined }) {
    const { t } = useI18n();
    return (
        <AuthShell
            description={t('signup.intro')}
            eyebrow={t('signup.eyebrow')}
            footer={<AuthLinks mode='signup' returnTo={returnTo} />}
            title={t('signup.title')}
        >
            <SignupForm returnTo={returnTo} />
        </AuthShell>
    );
}
