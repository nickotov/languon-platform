'use client';

import { Coins, CreditCard, ShieldCheck, User } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import type {
    AccountDeletionScheduleResponse,
    AuthUser,
} from '@languon/contracts';
import { useAuth } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';
import { preferenceCopy } from '@/fsd/features/text-ai-preferences';
import { Avatar, Dialog, Button, Card, showToast, Tabs } from '@/fsd/shared/ui';
import { useModelPreferenceNavigation } from '../../../../hooks/use-model-preference-navigation';
import { isProfileTab, type ProfileTab } from '../../../../lib/profile-tab';
import { AccountTab } from '../account-tab/account-tab';
import { SecurityTab } from '../security-tab/security-tab';
import { BillingTab, CreditsTab } from '../billing-tabs';
import styles from '../../../styles/profile-page-common.module.css';

export function AuthenticatedProfile({
    activeTab,
    onScheduled,
    user,
}: {
    activeTab: ProfileTab;
    onScheduled(receipt: AccountDeletionScheduleResponse): void;
    user: AuthUser;
}) {
    const { href, t, locale } = useI18n();
    const preferenceNavigation = useModelPreferenceNavigation();
    const [modelDirty, setModelDirty] = useState(false);
    const [chatDirty, setChatDirty] = useState(false);
    useEffect(
        () => preferenceNavigation.setDirty(modelDirty || chatDirty),
        [modelDirty, chatDirty, preferenceNavigation.setDirty],
    );

    const modelCopy = preferenceCopy(locale);

    const router = useRouter();

    const searchParams = useSearchParams();

    const { clearLocalSession, requestWithSession } = useAuth();

    const comingSoon = (area: string) => {
        showToast({
            content: t('profile.comingSoonToast', { area }),
            dismissLabel: t('profile.dismiss'),
            tone: 'info',
        });
    };

    function navigateTab(value: ProfileTab) {
        const nextParams = new URLSearchParams(searchParams.toString());
        if (value === 'account') {
            nextParams.delete('tab');
        } else {
            nextParams.set('tab', value);
        }

        const query = nextParams.toString();
        router.replace(href(`/profile${query ? `?${query}` : ''}`), {
            scroll: false,
        });
    }

    function handleTabChange(value: string) {
        if (!isProfileTab(value) || value === activeTab) {
            return;
        }

        preferenceNavigation.request(() => navigateTab(value));
    }

    function openCredits() {
        handleTabChange('credits');
    }

    const tabs = [
        {
            content: (
                <AccountTab
                    onComingSoon={comingSoon}
                    onScheduled={(receipt) => {
                        onScheduled(receipt);

                        clearLocalSession();
                    }}
                    requestWithSession={requestWithSession}
                    onModelDirtyChange={setModelDirty}
                    onChatDirtyChange={setChatDirty}
                    onOpenCredits={openCredits}
                />
            ),
            icon: <User />,
            label: t('profile.tab.account'),
            value: 'account',
        },
        {
            content: <SecurityTab email={user.primaryEmail} />,
            icon: <ShieldCheck />,
            label: t('profile.tab.security'),
            value: 'security',
        },
        {
            content: <BillingTab onComingSoon={comingSoon} />,
            icon: <CreditCard />,
            label: t('profile.tab.billing'),
            value: 'billing',
        },
        {
            content: <CreditsTab />,
            icon: <Coins />,
            label: t('profile.tab.credits'),
            value: 'credits',
        },
    ] satisfies Array<{
        content: ReactNode;
        icon: ReactNode;
        label: string;
        value: ProfileTab;
    }>;

    return (
        <main className={styles.main}>
            <div className={styles.intro}>
                <h1 className={styles.introTitle}>{t('profile.title')}</h1>
                <p className={styles.introDescription}>
                    {t('profile.description')}
                </p>
            </div>

            <Card className={styles.summary} padding='none' variant='outlined'>
                <div className={styles.identity}>
                    <Avatar name={user.handle ?? user.primaryEmail} size='lg' />
                    <div className={styles.identityText}>
                        <div className={styles.identityTitle}>
                            <h2 className={styles.identityHeading}>
                                {user.handle
                                    ? `@${user.handle}`
                                    : t('profile.account')}
                            </h2>
                        </div>
                        <p className={styles.identityEmail}>
                            {user.primaryEmail}
                        </p>
                    </div>
                </div>
                <dl className={styles.summaryFacts}>
                    <div className={styles.summaryFact}>
                        <dt className={styles.summaryLabel}>
                            {t('profile.plan')}
                        </dt>
                        <dd className={styles.summaryValue}>
                            {t('profile.notAvailable')}
                        </dd>
                    </div>
                    <div className={styles.summaryFact}>
                        <dt className={styles.summaryLabel}>
                            {t('profile.creditsLeft')}
                        </dt>
                        <dd className={styles.summaryValue}>
                            {t('profile.notAvailable')}
                        </dd>
                    </div>
                </dl>
            </Card>

            <Tabs
                aria-label={t('profile.sections')}
                className={styles.tabs!}
                listClassName={styles.tabList}
                items={tabs}
                onValueChange={handleTabChange}
                value={activeTab}
                variant='underline'
            />
            <Dialog
                closeLabel={modelCopy.close}
                description={modelCopy.leaveDescription}
                onClose={preferenceNavigation.keepEditing}
                open={preferenceNavigation.open}
                role='alertdialog'
                title={modelCopy.leaveTitle}
                footer={
                    <>
                        <Button
                            onClick={preferenceNavigation.keepEditing}
                            variant='secondary'
                        >
                            {modelCopy.keepEditing}
                        </Button>
                        <Button onClick={preferenceNavigation.discard}>
                            {modelCopy.discard}
                        </Button>
                    </>
                }
            />
        </main>
    );
}
