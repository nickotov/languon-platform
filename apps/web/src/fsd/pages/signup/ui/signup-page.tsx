'use client';

import { AuthShell, SignupForm } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';

export function SignupPage({ returnTo }: { returnTo?: string | undefined }) {
    const { t } = useI18n();
    return (
        <AuthShell eyebrow={t('signup.eyebrow')} title={t('signup.title')}>
            <SignupForm returnTo={returnTo} />
        </AuthShell>
    );
}
