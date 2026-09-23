import type {
    DictionarySettingsValues,
    OwnedDictionary,
} from '@languon/contracts';
import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { changedSettings, valuesFrom } from '../lib/settings-draft';
import type { SettingsFormProps } from '../types';

export function useSettingsDraft({
    dictionary,
    onSave,
    onCancel,
}: SettingsFormProps) {
    const { t } = useI18n();
    const [draft, setDraft] = useState(() => valuesFrom(dictionary));
    const [outcome, setOutcome] = useState('');
    useEffect(() => setDraft(valuesFrom(dictionary)), [dictionary]);
    const pairLocked = dictionary.languagePairLocked;

    function setSetting<K extends keyof DictionarySettingsValues>(
        key: K,
        value: DictionarySettingsValues[K],
    ) {
        setDraft((current) => ({
            ...current,
            settings: { ...current.settings, [key]: value },
        }));
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setOutcome('');
        const settings = changedSettings(
            dictionary.settings.values,
            draft.settings,
        );
        try {
            await onSave({
                description: draft.description.trim() || null,
                name: draft.name,
                ...(Object.keys(settings).length > 0 ? { settings } : {}),
                sourceLanguage: draft.sourceLanguage,
                targetLanguage: draft.targetLanguage,
            });
            setOutcome(t('dictionary.settings.saved'));
        } catch {
            // The owning mutation renders the recoverable error state.
        }
    }

    function changeName(event: ChangeEvent<HTMLInputElement>) {
        const name = event.currentTarget.value;
        setDraft((current) => ({ ...current, name }));
    }

    function changeDescription(event: ChangeEvent<HTMLTextAreaElement>) {
        const description = event.currentTarget.value;
        setDraft((current) => ({ ...current, description }));
    }

    function changeSource(event: ChangeEvent<HTMLSelectElement>) {
        const sourceLanguage = event.currentTarget
            .value as OwnedDictionary['sourceLanguage'];
        setDraft((current) => ({ ...current, sourceLanguage }));
    }

    function changeTarget(event: ChangeEvent<HTMLSelectElement>) {
        const targetLanguage = event.currentTarget
            .value as OwnedDictionary['targetLanguage'];
        setDraft((current) => ({ ...current, targetLanguage }));
    }

    function cancel() {
        setDraft(valuesFrom(dictionary));
        setOutcome(t('dictionary.settings.cancelled'));
        onCancel?.();
    }

    function submitForm(event: FormEvent<HTMLFormElement>) {
        void submit(event);
    }

    return {
        draft,
        outcome,
        pairLocked,
        setSetting,
        changeName,
        changeDescription,
        changeSource,
        changeTarget,
        cancel,
        submitForm,
    };
}
