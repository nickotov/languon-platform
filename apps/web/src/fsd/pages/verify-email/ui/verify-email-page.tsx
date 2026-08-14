import { AuthShell, VerifyEmailForm } from '@/fsd/features/auth';

export function VerifyEmailPage(props: {
    flowId?: string | undefined;
    resendAvailableAt?: string | undefined;
    returnTo?: string | undefined;
}) {
    return (
        <AuthShell eyebrow='One quick step' title='Verify your email'>
            <VerifyEmailForm {...props} />
        </AuthShell>
    );
}
