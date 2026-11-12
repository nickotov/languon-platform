'use client';
import Link from 'next/link';
import { useI18n } from '@/fsd/shared/i18n';
import { preserveCapabilityReturnFragment } from '@/fsd/shared/lib/capability-return';
import { safeReturnPath } from '@/fsd/shared/lib/return-path';
import { useAuth } from '../../model/auth-provider';
import styles from '../styles/auth-ui-common.module.css';

export function AuthLinks({
    mode,
    returnTo,
}: {
    mode: 'login' | 'signup';
    returnTo?: string | undefined;
}) {
    const { href, t } = useI18n();

    const { capabilities } = useAuth();

    const destination = safeReturnPath(returnTo);

    const path = mode === 'login' ? '/signup' : '/login';

    function resolveTarget() {
        if (destination === '/') {
            return path;
        }

        return `${path}?${new URLSearchParams({ returnTo: destination }).toString()}`;
    }

    const target = resolveTarget();

    if (mode === 'login' && capabilities?.email.signUp === false) {
        return null;
    }

    return (
        <p className={styles.switch}>
            {mode === 'login'
                ? `${t('auth.newToLanguon')} `
                : `${t('auth.alreadyAccount')} `}
            <Link
                className={styles.authLink}
                href={href(
                    preserveCapabilityReturnFragment(target, destination),
                )}
            >
                {mode === 'login' ? t('auth.createAccount') : t('auth.signIn')}
            </Link>
        </p>
    );
}
