'use client';

import { Download, ImageUp, Trash2 } from 'lucide-react';
import type { AccountDeletionScheduleResponse } from '@languon/contracts';
import {
    AccountDeletionAction,
    AccountHandleSettings,
} from '@/fsd/features/account-controls';
import { LanguageSwitcher } from '@/fsd/features/change-locale';
import { ConversationDefaults } from '@/fsd/features/conversation-preferences';
import { PortraitEntryCard } from '@/fsd/features/portrait-entry';
import { ModelPreferenceSection } from '@/fsd/features/text-ai-preferences';
import { useI18n } from '@/fsd/shared/i18n';
import { Avatar, Button, Input, Select } from '@/fsd/shared/ui';
import { ActionRow, SettingsSection } from '../settings-parts';
import type { ComingSoonProps } from '../../types';
import styles from '../../../styles/profile-page-common.module.css';

export function AccountTab({
    onComingSoon,
    onScheduled,
    requestWithSession,
    onModelDirtyChange,
    onChatDirtyChange,
    onOpenCredits,
}: ComingSoonProps & {
    onModelDirtyChange(dirty: boolean): void;
    onChatDirtyChange(dirty: boolean): void;
    onOpenCredits(): void;
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
                <div className={styles.photoRow}>
                    <Avatar size='lg' />
                    <div className={styles.photoCopy}>
                        <Button
                            leadingIcon={<ImageUp size={16} />}
                            onClick={() => onComingSoon(t('profile.photo'))}
                            size='compact'
                            variant='secondary'
                        >
                            {t('profile.changePhoto')}
                        </Button>
                        <p className={styles.muted}>
                            {t('profile.photoComingSoon')}
                        </p>
                    </div>
                </div>
                <div className={styles.profileGrid}>
                    <Input
                        disabled
                        label={t('profile.fullName')}
                        placeholder={t('profile.comingSoon')}
                    />
                    <LanguageSwitcher form />
                    <Select
                        disabled
                        label={t('profile.learningLanguage')}
                        options={[
                            { label: t('profile.comingSoon'), value: '' },
                        ]}
                        value=''
                    />
                    <Select
                        disabled
                        label={t('profile.timeZone')}
                        options={[
                            { label: t('profile.comingSoon'), value: '' },
                        ]}
                        value=''
                    />
                </div>
                <AccountHandleSettings
                    className={styles.handleForm}
                    requestWithSession={requestWithSession}
                />
                <p className={styles.muted}>
                    {t('profile.otherDetailsComingSoon')}
                </p>
            </SettingsSection>
            <div id='learner-portrait'>
                <PortraitEntryCard
                    variant='settings'
                    requestWithSession={requestWithSession}
                />
            </div>
            <div id='ai-preferences'>
                <ModelPreferenceSection
                    onDirtyChange={onModelDirtyChange}
                    onOpenCredits={onOpenCredits}
                    requestWithSession={requestWithSession}
                />
            </div>
            <ConversationDefaults
                requestWithSession={requestWithSession}
                onDirtyChange={onChatDirtyChange}
            />
            <SettingsSection
                description={t('profile.dataDescription')}
                title={t('profile.dataTitle')}
            >
                <ActionRow
                    description={t('profile.exportDescription')}
                    icon={<Download className={styles.glyph} />}
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
                    icon={<Trash2 className={styles.glyph} />}
                    label={t('profile.deleteAccount')}
                    children={
                        <AccountDeletionAction
                            className={styles.rowAction}
                            onScheduled={onScheduled}
                            requestWithSession={requestWithSession}
                        />
                    }
                />
            </SettingsSection>
        </div>
    );
}
