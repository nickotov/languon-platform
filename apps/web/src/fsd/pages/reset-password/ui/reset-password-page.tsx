'use client';

import { AuthShell, ResetPasswordForm } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';

export function ResetPasswordPage({ flowId }: { flowId?: string | undefined }) {
    const { t } = useI18n();
    return (
        <AuthShell eyebrow={t('reset.eyebrow')} title={t('reset.title')}>
            <ResetPasswordForm flowId={flowId} />
        </AuthShell>
    );
}
