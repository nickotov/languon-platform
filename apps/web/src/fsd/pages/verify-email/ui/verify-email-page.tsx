'use client';

import Link from 'next/link';

import { AuthShell, VerifyEmailForm } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';
import { preserveCapabilityReturnFragment } from '@/fsd/shared/lib/capability-return';
import { safeReturnPath } from '@/fsd/shared/lib/return-path';

export function VerifyEmailPage(props: {
    flowId?: string | undefined;
    resendAvailableAt?: string | undefined;
    returnTo?: string | undefined;
}) {
    const { href, t } = useI18n();
    const destination = safeReturnPath(props.returnTo);
    const signInTarget = preserveCapabilityReturnFragment(
        `/login?${new URLSearchParams({ returnTo: destination }).toString()}`,
        destination,
    );
    return (
        <AuthShell
            description={t('verify.intro')}
            eyebrow={t('verify.eyebrow')}
            footer={
                props.flowId ? (
                    <Link href={href(signInTarget)}>
                        {t('auth.returnToSignIn')}
                    </Link>
                ) : (
                    <Link href={href('/signup')}>{t('verify.startAgain')}</Link>
                )
            }
            title={t('verify.title')}
        >
            <VerifyEmailForm {...props} />
        </AuthShell>
    );
}
