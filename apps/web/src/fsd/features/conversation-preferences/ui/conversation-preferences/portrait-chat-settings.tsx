'use client';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { ChatPreferences } from '@languon/contracts';
import type { ConversationSessionRequest } from '@/fsd/entities/conversation';
import { usePortraitState } from '@/fsd/entities/learner-portrait';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    ButtonLink,
    InlineAlert,
    LoadingState,
    Switch,
} from '@/fsd/shared/ui';
import { inheritPortraitField } from '../../lib/portrait-preferences';
import { portraitSettingsCopy } from '../../lib/portrait-settings-copy';
import styles from './portrait-chat-settings.module.css';

export function PortraitChatSettings({
    ownerId,
    requestWithSession,
    value,
    onChange,
    onFreshChat,
    disabled,
}: {
    ownerId: string;
    requestWithSession: ConversationSessionRequest;
    value: ChatPreferences;
    onChange(value: ChatPreferences): void;
    onFreshChat(): void;
    disabled: boolean;
}) {
    const { locale, href } = useI18n();
    const copy = portraitSettingsCopy(locale);
    const state = usePortraitState({ ownerId, requestWithSession });
    const [showPrivacy, setShowPrivacy] = useState(false);
    const globalOn = state.data?.useEnabled === true;
    const checked = globalOn && value.portrait?.enabled !== false;
    const existingNotAdopted =
        checked && !value.portrait?.inheritedFields.length;
    const settingsHref = href('/portrait');
    function toggle(enabled: boolean) {
        onChange({
            ...value,
            portrait: {
                enabled,
                inheritedFields: value.portrait?.inheritedFields ?? [],
            },
        });
        setShowPrivacy(!enabled);
    }
    function adopt() {
        onChange(inheritPortraitField(value));
    }
    function fresh() {
        onFreshChat();
        setShowPrivacy(false);
    }
    function retry() {
        void state.refetch();
    }
    return (
        <section className={styles.section}>
            <h3 className={styles.heading}>
                <Sparkles size={16} aria-hidden='true' />
                {copy.title}
            </h3>
            {state.isPending && <LoadingState>{copy.loading}</LoadingState>}
            {state.isError && (
                <InlineAlert
                    tone='error'
                    title={copy.error}
                    actions={
                        <Button
                            size='compact'
                            variant='secondary'
                            onClick={retry}
                        >
                            {copy.retry}
                        </Button>
                    }
                />
            )}
            {state.data && !state.data.approved && (
                <InlineAlert
                    title={copy.empty}
                    actions={
                        <ButtonLink
                            size='compact'
                            variant='secondary'
                            href={settingsHref}
                        >
                            {copy.create}
                        </ButtonLink>
                    }
                >
                    {copy.emptyHelp}
                </InlineAlert>
            )}
            {state.data?.approved && (
                <>
                    <Switch
                        label={copy.use}
                        aria-label={copy.use}
                        description={globalOn ? copy.on : copy.off}
                        checked={checked}
                        disabled={disabled || !globalOn}
                        onCheckedChange={toggle}
                    />
                    {!globalOn && (
                        <InlineAlert
                            title={copy.global}
                            actions={
                                <ButtonLink
                                    size='compact'
                                    variant='secondary'
                                    href={settingsHref}
                                >
                                    {copy.settings}
                                </ButtonLink>
                            }
                        >
                            {copy.globalHelp}
                        </InlineAlert>
                    )}
                    {existingNotAdopted && (
                        <InlineAlert
                            tone='tip'
                            title={copy.legacy}
                            actions={
                                <Button
                                    size='compact'
                                    onClick={adopt}
                                    disabled={disabled}
                                >
                                    {copy.adopt}
                                </Button>
                            }
                        >
                            {copy.legacyHelp}
                        </InlineAlert>
                    )}
                    {showPrivacy && value.portrait?.enabled === false && (
                        <InlineAlert
                            title={copy.excluded}
                            actions={
                                <Button
                                    size='compact'
                                    variant='secondary'
                                    onClick={fresh}
                                    disabled={disabled}
                                >
                                    {copy.fresh}
                                </Button>
                            }
                        >
                            {copy.privacy}
                        </InlineAlert>
                    )}
                </>
            )}
        </section>
    );
}
