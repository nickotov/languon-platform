'use client';

import { useSessionStore } from '@/fsd/entities/session';
import { useI18n } from '@/fsd/shared/i18n';
import { ButtonLink, LoadingState } from '@/fsd/shared/ui';
import { useAuth } from '../model/auth-provider';
import styles from './auth-ui.module.css';

export function HomeSessionActions() {
    const { href, t } = useI18n();
    const status = useSessionStore((state) => state.status);
    const user = useSessionStore((state) => state.user);
    const { capabilities } = useAuth();

    if (status === 'bootstrapping') {
        return <LoadingState>{t('home.restoring')}</LoadingState>;
    }

    if (status === 'authenticated') {
        return (
            <div className={styles.stack}>
                <p>
                    {t('home.signedInAs', { email: user?.primaryEmail ?? '' })}
                </p>
                <ButtonLink href={href('/dictionaries')}>
                    {t('home.dictionaries')}
                </ButtonLink>
                <ButtonLink href={href('/security')}>
                    {t('home.security')}
                </ButtonLink>
            </div>
        );
    }

    return (
        <nav
            className={styles.actions}
            aria-label={t('home.accountNavigation')}
        >
            {capabilities?.email.signUp ? (
                <ButtonLink href={href('/signup')}>
                    {t('home.getStarted')}
                </ButtonLink>
            ) : null}
            <ButtonLink href={href('/login')} variant='secondary'>
                {t('home.signIn')}
            </ButtonLink>
        </nav>
    );
}
