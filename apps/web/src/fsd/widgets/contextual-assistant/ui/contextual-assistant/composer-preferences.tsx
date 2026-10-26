import { SlidersHorizontal } from 'lucide-react';
import type { ChatPreferences, Conversation } from '@languon/contracts';
import {
    conversationCopy,
    type ConversationSessionRequest,
} from '@/fsd/entities/conversation';
import {
    ConversationPreferences,
    PortraitChatSettings,
} from '@/fsd/features/conversation-preferences';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/fsd/shared/ui';
import { usePortraitState } from '@/fsd/entities/learner-portrait';
import { TutorModeControl } from './tutor-mode-control';
import { portraitSettingsCopy } from '@/fsd/features/conversation-preferences';
import { workspaceCopy } from '../../lib/workspace-copy';
import styles from './portrait-composer-settings.module.css';

export function ComposerPreferences({
    value,
    onChange,
    onDefaults,
    disabled,
    defaultsSaved = false,
    portrait,
}: {
    value: ChatPreferences;
    onChange(value: ChatPreferences): void;
    onDefaults(): void;
    disabled: boolean;
    workspace?: boolean;
    defaultsSaved?: boolean;
    portrait?:
        | {
              ownerId: string;
              requestWithSession: ConversationSessionRequest;
              origins?: Conversation['preferenceOrigins'];
              onFreshChat(): void;
          }
        | undefined;
}) {
    const { locale } = useI18n();
    const copy = portraitSettingsCopy(locale);
    const workspace = workspaceCopy(locale);
    const conversation = conversationCopy(locale);
    const state = usePortraitState({
        ownerId: portrait?.ownerId ?? null,
        requestWithSession: portrait?.requestWithSession ?? unavailableRequest,
    });
    const items = state.data?.approved?.items;
    const resettableFields: Array<
        'replyLanguage' | 'tone' | 'detail' | 'wording' | 'approach'
    > = [];
    if (state.data?.useEnabled && value.portrait?.enabled !== false && items) {
        if (items.explanationLanguages?.length)
            resettableFields.push('replyLanguage');
        for (const field of ['tone', 'detail', 'wording', 'approach'] as const)
            if (items[field]) resettableFields.push(field);
    }
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type='button'
                    className={styles.trigger}
                    aria-label={workspace.settings}
                >
                    <SlidersHorizontal size={16} aria-hidden='true' />
                </button>
            </PopoverTrigger>
            <PopoverContent side='top' align='start' className={styles.panel}>
                <section className={styles.section}>
                    <TutorModeControl
                        value={value}
                        onChange={onChange}
                        disabled={disabled}
                    />
                    <p>{copy.mode}</p>
                </section>
                {portrait && (
                    <PortraitChatSettings
                        ownerId={portrait.ownerId}
                        requestWithSession={portrait.requestWithSession}
                        value={value}
                        onChange={onChange}
                        onFreshChat={portrait.onFreshChat}
                        disabled={disabled}
                    />
                )}
                <section className={styles.section}>
                    <div>
                        <h3>{copy.explanations}</h3>
                        <p>{copy.next}</p>
                    </div>
                    <ConversationPreferences
                        value={value}
                        onChange={onChange}
                        disabled={disabled}
                        origins={portrait?.origins}
                        showPortraitSources={Boolean(portrait)}
                        resettableFields={resettableFields}
                    />
                    <p>{copy.precedence}</p>
                </section>
                <Button
                    variant='secondary'
                    size='compact'
                    onClick={onDefaults}
                    disabled={disabled}
                >
                    {conversation.defaults}
                </Button>
                {defaultsSaved && <p role='status'>{conversation.saved}</p>}
            </PopoverContent>
        </Popover>
    );
}

async function unavailableRequest<T>(): Promise<T> {
    throw new Error('Conversation session unavailable.');
}
