'use client';

import { AuthShell, VerifyEmailForm } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';

export function VerifyEmailPage(props: {
    flowId?: string | undefined;
    resendAvailableAt?: string | undefined;
    returnTo?: string | undefined;
}) {
    const { t } = useI18n();
    return (
        <AuthShell eyebrow={t('verify.eyebrow')} title={t('verify.title')}>
            <VerifyEmailForm {...props} />
        </AuthShell>
    );
}
