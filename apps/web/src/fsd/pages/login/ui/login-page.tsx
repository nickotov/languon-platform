import { AuthShell, LoginForm } from '@/fsd/features/auth';

export function LoginPage(props: {
    passwordReset?: string | undefined;
    returnTo?: string | undefined;
}) {
    return (
        <AuthShell eyebrow='Your account' title='Sign in'>
            <LoginForm {...props} />
        </AuthShell>
    );
}
