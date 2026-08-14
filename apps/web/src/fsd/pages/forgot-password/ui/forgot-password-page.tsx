import { AuthShell, ForgotPasswordForm } from '@/fsd/features/auth';

export function ForgotPasswordPage() {
    return (
        <AuthShell eyebrow='Account recovery' title='Reset your password'>
            <ForgotPasswordForm />
        </AuthShell>
    );
}
