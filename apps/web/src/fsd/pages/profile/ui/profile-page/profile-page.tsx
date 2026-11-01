'use client';

import { Trash2, UserRound } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { AccountDeletionScheduleResponse } from '@languon/contracts';
import { useSessionStore } from '@/fsd/entities/session';
import { useI18n } from '@/fsd/shared/i18n';
import { ButtonLink, Card, LoadingState } from '@/fsd/shared/ui';
import { isProfileTab, type ProfileTab } from '../../lib/profile-tab';
import { AuthenticatedProfile } from './authenticated-profile';
import styles from './profile-page.module.css';

export function ProfilePageFallback() {
    const { t } = useI18n();

    return (
        <main className={styles.centered}>
            <LoadingState>{t('profile.loading')}</LoadingState>
        </main>
    );
}

export function ProfilePage() {
    const { href, t } = useI18n();

    const searchParams = useSearchParams();

    const requestedTab = searchParams.get('tab');

    const activeTab: ProfileTab = isProfileTab(requestedTab)
        ? requestedTab
        : 'account';

    const status = useSessionStore((state) => state.status);

    const user = useSessionStore((state) => state.user);

    const [deletionReceipt, setDeletionReceipt] =
        useState<AccountDeletionScheduleResponse | null>(null);

    if (status === 'bootstrapping') {
        return (
            <main className={styles.centered}>
                <LoadingState>{t('profile.loading')}</LoadingState>
            </main>
        );
    }

    if (status === 'signed-out' || !user) {
        if (deletionReceipt) {
            return (
                <main className={styles.centered}>
                    <Card className={styles.signedOut} variant='outlined'>
                        <Trash2
                            aria-hidden='true'
                            className={styles.emptyIcon}
                        />
                        <h1 className={styles.signedOutTitle}>
                            {t('profile.deleteScheduledTitle')}
                        </h1>
                        <p className={styles.signedOutDescription}>
                            {t('profile.deleteScheduledDescription', {
                                date: new Intl.DateTimeFormat(undefined, {
                                    dateStyle: 'long',
                                }).format(new Date(deletionReceipt.purgeAt)),
                            })}
                        </p>
                    </Card>
                </main>
            );
        }

        return (
            <main className={styles.centered}>
                <Card className={styles.signedOut} variant='outlined'>
                    <UserRound
                        aria-hidden='true'
                        className={styles.emptyIcon}
                    />
                    <h1 className={styles.signedOutTitle}>
                        {t('profile.signInTitle')}
                    </h1>
                    <p className={styles.signedOutDescription}>
                        {t('profile.signInDescription')}
                    </p>
                    <ButtonLink
                        href={href(
                            activeTab === 'account'
                                ? '/login?returnTo=/profile'
                                : `/login?returnTo=${encodeURIComponent(`/profile?tab=${activeTab}`)}`,
                        )}
                    >
                        {t('profile.signIn')}
                    </ButtonLink>
                </Card>
            </main>
        );
    }

    return (
        <AuthenticatedProfile
            activeTab={activeTab}
            onScheduled={setDeletionReceipt}
            user={user}
        />
    );
}
