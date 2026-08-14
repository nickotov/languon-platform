'use client';

import Link from 'next/link';

import { useSessionStore } from '@/fsd/entities/session/model/session-store';
import { useI18n } from '@/fsd/shared/i18n';
import { useAuth } from '../model/auth-provider';

export function HomeSessionActions() {
    const { href, t } = useI18n();
    const status = useSessionStore((state) => state.status);
    const user = useSessionStore((state) => state.user);
    const { capabilities } = useAuth();

    if (status === 'bootstrapping') {
        return (
            <p className='loading-state' role='status'>
                {t('home.restoring')}
            </p>
        );
    }

    if (status === 'authenticated') {
        return (
            <div className='home__account'>
                <p>
                    {t('home.signedInAs', { email: user?.primaryEmail ?? '' })}
                </p>
                <Link className='primary-button' href={href('/security')}>
                    {t('home.security')}
                </Link>
            </div>
        );
    }

    return (
        <nav className='home__actions' aria-label={t('home.accountNavigation')}>
            {capabilities?.email.signUp ? (
                <Link className='primary-button' href={href('/signup')}>
                    {t('home.getStarted')}
                </Link>
            ) : null}
            <Link className='secondary-button' href={href('/login')}>
                {t('home.signIn')}
            </Link>
        </nav>
    );
}
