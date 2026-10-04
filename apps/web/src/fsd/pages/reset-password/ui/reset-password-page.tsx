'use client';

import {
    AuthFooterLink,
    AuthShell,
    ResetPasswordForm,
} from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';

export function ResetPasswordPage({ flowId }: { flowId?: string | undefined }) {
    const { href, t } = useI18n();

    return (
        <AuthShell
            description={t('reset.intro')}
            eyebrow={t('reset.eyebrow')}
            footer={
                flowId ? (
                    <AuthFooterLink href={href('/login')}>
                        {t('forgot.back')}
                    </AuthFooterLink>
                ) : (
                    <AuthFooterLink href={href('/forgot-password')}>
                        {t('reset.requestNew')}
                    </AuthFooterLink>
                )
            }
            title={t('reset.title')}
        >
            <ResetPasswordForm flowId={flowId} />
        </AuthShell>
    );
}
