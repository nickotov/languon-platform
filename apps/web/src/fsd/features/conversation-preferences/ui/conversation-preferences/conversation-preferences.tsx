'use client';
import type { ChangeEvent } from 'react';
import type { ChatPreferences } from '@languon/contracts';
import { useQuery } from '@tanstack/react-query';
import { dictionaryApi, languageLabel } from '@/fsd/entities/dictionary';
import { conversationCopy } from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import { Select } from '@/fsd/shared/ui';
import styles from './conversation-preferences.module.css';

export function ConversationPreferences({
    value,
    onChange,
    disabled = false,
}: {
    value: ChatPreferences;
    onChange(value: ChatPreferences): void;
    disabled?: boolean;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    const languages = useQuery({
        queryKey: ['dictionary-languages'],
        queryFn: ({ signal }) => dictionaryApi.listLanguages(signal),
        staleTime: Infinity,
    });
    const options = [
        { value: 'auto', label: copy.automatic },
        ...(languages.data?.languages ?? []).map((language) => ({
            value: language.tag,
            label: languageLabel(
                languages.data!.languages,
                language.tag,
                locale,
            ),
        })),
    ];
    if (
        value.replyLanguage !== 'auto' &&
        !options.some((option) => option.value === value.replyLanguage)
    )
        options.push({
            value: value.replyLanguage,
            label: value.replyLanguage,
        });
    function language(event: ChangeEvent<HTMLSelectElement>) {
        onChange({ ...value, replyLanguage: event.target.value });
    }
    function tone(event: ChangeEvent<HTMLSelectElement>) {
        onChange({
            ...value,
            tone: event.target.value as ChatPreferences['tone'],
        });
    }
    function level(event: ChangeEvent<HTMLSelectElement>) {
        onChange({
            ...value,
            explanationLevel: event.target
                .value as ChatPreferences['explanationLevel'],
        });
    }
    const tones = [
        { value: 'neutral', label: copy.neutral },
        { value: 'conversational', label: copy.conversational },
        { value: 'academic', label: copy.academic },
    ];
    const levels = [
        { value: 'auto', label: copy.automatic },
        { value: 'beginner', label: copy.beginner },
        { value: 'detailed', label: copy.detailed },
    ];
    return (
        <div className={styles.controls}>
            <Select
                label={copy.language}
                value={value.replyLanguage}
                options={options}
                onChange={language}
                disabled={disabled}
            />
            <Select
                label={copy.tone}
                value={value.tone}
                options={tones}
                onChange={tone}
                disabled={disabled}
            />
            <Select
                label={copy.level}
                value={value.explanationLevel}
                options={levels}
                onChange={level}
                disabled={disabled}
            />
        </div>
    );
}
