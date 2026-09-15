'use client';

import {
    Coins,
    CreditCard,
    Download,
    Mail,
    ShieldCheck,
    Trash2,
    User,
    UserRound,
    WalletCards,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type {
    AccountDeletionScheduleResponse,
    AuthUser,
} from '@languon/contracts';

import { useSessionStore } from '@/fsd/entities/session';
import {
    AccountDeletionAction,
    AccountHandleSettings,
} from '@/fsd/features/account-controls';
import { SecuritySettings, useAuth } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Avatar,
    Badge,
    Button,
    ButtonLink,
    Card,
    LoadingState,
    showToast,
    Tabs,
} from '@/fsd/shared/ui';

import styles from './profile-page.module.css';

type ProfileTab = 'account' | 'billing' | 'credits' | 'security';

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
        if (deletionReceipt)
            return (
                <main className={styles.centered}>
                    <Card className={styles.signedOut} variant='outlined'>
                        <Trash2
                            aria-hidden='true'
                            className={styles.emptyIcon}
                        />
                        <h1>{t('profile.deleteScheduledTitle')}</h1>
                        <p>
                            {t('profile.deleteScheduledDescription', {
                                date: new Intl.DateTimeFormat(undefined, {
                                    dateStyle: 'long',
                                }).format(new Date(deletionReceipt.purgeAt)),
                            })}
                        </p>
                    </Card>
                </main>
            );
        return (
            <main className={styles.centered}>
                <Card className={styles.signedOut} variant='outlined'>
                    <UserRound
                        aria-hidden='true'
                        className={styles.emptyIcon}
                    />
                    <h1>{t('profile.signInTitle')}</h1>
                    <p>{t('profile.signInDescription')}</p>
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

function AuthenticatedProfile({
    activeTab,
    onScheduled,
    user,
}: {
    activeTab: ProfileTab;
    onScheduled(receipt: AccountDeletionScheduleResponse): void;
    user: AuthUser;
}) {
    const { href, t } = useI18n();
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
                />
            ),
            icon: <User />,
            label: t('profile.tab.account'),
            value: 'account',
        },
        {
            content: (
                <SecurityTab
                    email={user.primaryEmail}
                    onComingSoon={comingSoon}
                />
            ),
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
            content: <CreditsTab onComingSoon={comingSoon} />,
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
                <h1>{t('profile.title')}</h1>
                <p>{t('profile.description')}</p>
            </div>

            <Card className={styles.summary} padding='none' variant='outlined'>
                <div className={styles.identity}>
                    <Avatar name={user.handle ?? user.primaryEmail} size='lg' />
                    <div className={styles.identityText}>
                        <div className={styles.identityTitle}>
                            <h2>
                                {user.handle
                                    ? `@${user.handle}`
                                    : t('profile.account')}
                            </h2>
                        </div>
                        <p>{user.primaryEmail}</p>
                    </div>
                </div>
                <dl className={styles.summaryFacts}>
                    <div>
                        <dt>{t('profile.plan')}</dt>
                        <dd>{t('profile.notAvailable')}</dd>
                    </div>
                    <div>
                        <dt>{t('profile.creditsLeft')}</dt>
                        <dd>{t('profile.notAvailable')}</dd>
                    </div>
                </dl>
            </Card>

            <Tabs
                aria-label={t('profile.sections')}
                className={styles.tabs!}
                items={tabs}
                onValueChange={(value) => {
                    if (!isProfileTab(value)) return;
                    const nextParams = new URLSearchParams(
                        searchParams.toString(),
                    );
                    if (value === 'account') nextParams.delete('tab');
                    else nextParams.set('tab', value);
                    const query = nextParams.toString();
                    router.replace(
                        href(`/profile${query ? `?${query}` : ''}`),
                        { scroll: false },
                    );
                }}
                value={activeTab}
                variant='underline'
            />
        </main>
    );
}

function AccountTab({
    onComingSoon,
    onScheduled,
    requestWithSession,
}: ComingSoonProps & {
    onScheduled(receipt: AccountDeletionScheduleResponse): void;
    requestWithSession<T>(
        operation: (accessToken: string) => Promise<T>,
    ): Promise<T>;
}) {
    const { t } = useI18n();
    return (
        <div className={styles.sections}>
            <SettingsSection
                description={t('profile.profileDescription')}
                title={t('profile.profileTitle')}
            >
                <AccountHandleSettings
                    requestWithSession={requestWithSession}
                />
                <div className={styles.profilePlaceholder}>
                    <Avatar size='lg' />
                    <div>
                        <p className={styles.emptyTitle}>
                            {t('profile.profileEmpty')}
                        </p>
                        <p className={styles.muted}>
                            {t('profile.profileEmptyDescription')}
                        </p>
                    </div>
                    <Button
                        onClick={() => onComingSoon(t('profile.profileTitle'))}
                        size='compact'
                        variant='secondary'
                    >
                        {t('profile.setUp')}
                    </Button>
                </div>
            </SettingsSection>
            <SettingsSection
                description={t('profile.dataDescription')}
                title={t('profile.dataTitle')}
            >
                <ActionRow
                    description={t('profile.exportDescription')}
                    icon={<Download />}
                    label={t('profile.exportTitle')}
                    onClick={() => onComingSoon(t('profile.exportTitle'))}
                    button={t('profile.requestExport')}
                />
            </SettingsSection>
            <SettingsSection
                danger
                description={t('profile.deleteDescription')}
                title={t('profile.deleteTitle')}
            >
                <ActionRow
                    danger
                    description={t('profile.deleteConfirmDescription')}
                    icon={<Trash2 />}
                    label={t('profile.deleteAccount')}
                    children={
                        <AccountDeletionAction
                            onScheduled={onScheduled}
                            requestWithSession={requestWithSession}
                        />
                    }
                />
            </SettingsSection>
        </div>
    );
}

function SecurityTab({
    email,
    onComingSoon,
}: ComingSoonProps & { email: string }) {
    const { t } = useI18n();
    const requestEmailChange = () =>
        showToast({
            content: t('profile.emailChangeNotSent'),
            dismissLabel: t('profile.dismiss'),
            tone: 'info',
        });
    return (
        <div className={styles.sections}>
            <SettingsSection
                description={t('profile.emailDescription')}
                title={t('profile.emailTitle')}
            >
                <ActionRow
                    description={email}
                    icon={<Mail />}
                    label={t('profile.primaryEmail')}
                />
                <div className={styles.emailChange}>
                    <p className={styles.muted}>
                        {t('profile.emailChangeComingSoon')}
                    </p>
                    <Button
                        onClick={requestEmailChange}
                        size='compact'
                        variant='secondary'
                    >
                        {t('profile.requestEmailChange')}
                    </Button>
                </div>
            </SettingsSection>
            <SecuritySettings embedded />
            <SettingsSection
                description={t('profile.methodsDescription')}
                title={t('profile.methodsTitle')}
            >
                <ActionRow
                    description={t('profile.noMethods')}
                    icon={<ShieldCheck />}
                    label={t('profile.connectedMethods')}
                    onClick={() => onComingSoon(t('profile.methodsTitle'))}
                    button={t('profile.addMethod')}
                />
            </SettingsSection>
        </div>
    );
}

function isProfileTab(value: string | null): value is ProfileTab {
    return (
        value === 'account' ||
        value === 'security' ||
        value === 'billing' ||
        value === 'credits'
    );
}

function BillingTab({ onComingSoon }: ComingSoonProps) {
    const { t } = useI18n();
    return (
        <div className={styles.sections}>
            <EmptySettings
                icon={<CreditCard />}
                title={t('profile.subscriptionTitle')}
                description={t('profile.subscriptionEmpty')}
                button={t('profile.comparePlans')}
                onClick={() => onComingSoon(t('profile.subscriptionTitle'))}
            />
            <EmptySettings
                icon={<WalletCards />}
                title={t('profile.paymentTitle')}
                description={t('profile.paymentEmpty')}
                button={t('profile.addPayment')}
                onClick={() => onComingSoon(t('profile.paymentTitle'))}
            />
            <EmptySettings
                icon={<Coins />}
                title={t('profile.extraCreditsTitle')}
                description={t('profile.extraCreditsEmpty')}
                button={t('profile.buyCredits')}
                onClick={() => onComingSoon(t('profile.extraCreditsTitle'))}
            />
        </div>
    );
}

function CreditsTab({ onComingSoon }: ComingSoonProps) {
    const { t } = useI18n();
    return (
        <div className={styles.sections}>
            <EmptySettings
                icon={<Coins />}
                title={t('profile.balanceTitle')}
                description={t('profile.balanceEmpty')}
                button={t('profile.buyCredits')}
                onClick={() => onComingSoon(t('profile.balanceTitle'))}
            />
            <EmptySettings
                icon={<WalletCards />}
                title={t('profile.usageTitle')}
                description={t('profile.usageEmpty')}
            />
            <EmptySettings
                icon={<Download />}
                title={t('profile.historyTitle')}
                description={t('profile.historyEmpty')}
            />
        </div>
    );
}

type ComingSoonProps = { onComingSoon(area: string): void };

function SettingsSection({
    children,
    danger = false,
    description,
    title,
}: {
    children: ReactNode;
    danger?: boolean;
    description: string;
    title: string;
}) {
    return (
        <Card
            className={danger ? styles.dangerSection : styles.section}
            padding='none'
            variant='outlined'
        >
            <header className={styles.sectionHeader}>
                <h2>{title}</h2>
                <p>{description}</p>
            </header>
            <div className={styles.sectionBody}>{children}</div>
        </Card>
    );
}

function ActionRow({
    button,
    children,
    danger = false,
    description,
    icon,
    label,
    onClick,
}: {
    button?: string;
    children?: ReactNode;
    danger?: boolean;
    description: string;
    icon: ReactNode;
    label: string;
    onClick?: () => void;
}) {
    return (
        <div className={styles.actionRow}>
            <span aria-hidden='true' className={styles.rowIcon}>
                {icon}
            </span>
            <div className={styles.rowCopy}>
                <h3>{label}</h3>
                <p>{description}</p>
            </div>
            {children ??
                (button && onClick ? (
                    <Button
                        onClick={onClick}
                        size='compact'
                        variant={danger ? 'danger' : 'secondary'}
                    >
                        {button}
                    </Button>
                ) : null)}
        </div>
    );
}

function EmptySettings({
    button,
    description,
    icon,
    onClick,
    title,
}: {
    button?: string;
    description: string;
    icon: ReactNode;
    onClick?: () => void;
    title: string;
}) {
    const { t } = useI18n();
    return (
        <SettingsSection description={description} title={title}>
            <div className={styles.emptyBlock}>
                <span aria-hidden='true' className={styles.emptyIcon}>
                    {icon}
                </span>
                <div>
                    <Badge size='sm' tone='info'>
                        {t('profile.comingSoon')}
                    </Badge>
                    <p>{description}</p>
                </div>
                {button && onClick ? (
                    <Button
                        onClick={onClick}
                        size='compact'
                        variant='secondary'
                    >
                        {button}
                    </Button>
                ) : null}
            </div>
        </SettingsSection>
    );
}
