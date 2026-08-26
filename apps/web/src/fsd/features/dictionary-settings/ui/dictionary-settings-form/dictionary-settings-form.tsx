'use client';

import type {
    DictionarySettingsValues,
    LanguageCatalogEntry,
    OwnedDictionary,
    UpdateDictionaryRequest,
} from '@languon/contracts';
import { type FormEvent, useEffect, useState } from 'react';

import { languageLabel } from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    Card,
    Checkbox,
    Field,
    Input,
    Select,
    Textarea,
} from '@/fsd/shared/ui';

import styles from './dictionary-settings-form.module.css';

export type SaveDictionarySettings = Omit<
    UpdateDictionaryRequest,
    'expectedDictionaryVersion' | 'expectedSettingsVersion'
>;

function changedSettings(
    original: DictionarySettingsValues,
    current: DictionarySettingsValues,
): NonNullable<SaveDictionarySettings['settings']> {
    const patch: Partial<DictionarySettingsValues> = {};
    for (const key of Object.keys(current) as Array<
        keyof DictionarySettingsValues
    >) {
        if (current[key] !== original[key]) {
            Object.assign(patch, { [key]: current[key] });
        }
    }
    return patch;
}

function valuesFrom(dictionary: OwnedDictionary) {
    return {
        description: dictionary.description ?? '',
        name: dictionary.name,
        settings: { ...dictionary.settings.values },
        sourceLanguage: dictionary.sourceLanguage,
        targetLanguage: dictionary.targetLanguage,
    };
}

export function DictionarySettingsForm({
    dictionary,
    error,
    languages,
    onSave,
    pending,
}: {
    dictionary: OwnedDictionary;
    error?: string | null;
    languages: readonly LanguageCatalogEntry[];
    onSave(values: SaveDictionarySettings): Promise<void>;
    pending: boolean;
}) {
    const { locale, t } = useI18n();
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

    return (
        <Card className={styles.card}>
            <h2>{t('dictionary.settings.title')}</h2>
            <form
                className={styles.form}
                onSubmit={(event) => void submit(event)}
            >
                <div className={styles.twoColumns}>
                    <Field label={t('dictionary.field.name')} required>
                        <Input
                            maxLength={120}
                            onChange={(event) => {
                                const name = event.currentTarget.value;
                                setDraft((current) => ({
                                    ...current,
                                    name,
                                }));
                            }}
                            required
                            value={draft.name}
                        />
                    </Field>
                    <Field
                        label={t('dictionary.field.description')}
                        optionalLabel={t('dictionary.field.optional')}
                    >
                        <Textarea
                            maxLength={2000}
                            onChange={(event) => {
                                const description = event.currentTarget.value;
                                setDraft((current) => ({
                                    ...current,
                                    description,
                                }));
                            }}
                            value={draft.description}
                        />
                    </Field>
                </div>
                <div className={styles.twoColumns}>
                    <Field
                        {...(pairLocked
                            ? { hint: t('dictionary.settings.pairLocked') }
                            : {})}
                        label={t('dictionary.field.sourceLanguage')}
                        required
                    >
                        <Select
                            disabled={pairLocked}
                            onChange={(event) => {
                                const sourceLanguage = event.currentTarget
                                    .value as OwnedDictionary['sourceLanguage'];
                                setDraft((current) => ({
                                    ...current,
                                    sourceLanguage,
                                }));
                            }}
                            value={draft.sourceLanguage}
                        >
                            {languages.map((language) => (
                                <option key={language.tag} value={language.tag}>
                                    {languageLabel(
                                        languages,
                                        language.tag,
                                        locale,
                                    )}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field
                        {...(pairLocked
                            ? { hint: t('dictionary.settings.pairLocked') }
                            : {})}
                        label={t('dictionary.field.targetLanguage')}
                        required
                    >
                        <Select
                            disabled={pairLocked}
                            onChange={(event) => {
                                const targetLanguage = event.currentTarget
                                    .value as OwnedDictionary['targetLanguage'];
                                setDraft((current) => ({
                                    ...current,
                                    targetLanguage,
                                }));
                            }}
                            value={draft.targetLanguage}
                        >
                            {languages.map((language) => (
                                <option key={language.tag} value={language.tag}>
                                    {languageLabel(
                                        languages,
                                        language.tag,
                                        locale,
                                    )}
                                </option>
                            ))}
                        </Select>
                    </Field>
                </div>
                <fieldset className={styles.fieldset}>
                    <legend>{t('dictionary.settings.optionalFields')}</legend>
                    <Checkbox
                        checked={draft.settings.transcriptionEnabled}
                        onChange={(event) =>
                            setSetting(
                                'transcriptionEnabled',
                                event.currentTarget.checked,
                            )
                        }
                    >
                        {t('dictionary.field.transcription')}
                    </Checkbox>
                    {draft.settings.transcriptionEnabled ? (
                        <div className={styles.indented}>
                            <Field label={t('dictionary.settings.notation')}>
                                <Select
                                    onChange={(event) =>
                                        setSetting(
                                            'transcriptionNotation',
                                            event.currentTarget
                                                .value as DictionarySettingsValues['transcriptionNotation'],
                                        )
                                    }
                                    value={draft.settings.transcriptionNotation}
                                >
                                    <option value='ipa'>
                                        {t('dictionary.notation.ipa')}
                                    </option>
                                    <option value='romanization'>
                                        {t('dictionary.notation.romanization')}
                                    </option>
                                    <option value='custom'>
                                        {t('dictionary.notation.custom')}
                                    </option>
                                </Select>
                            </Field>
                            {draft.settings.transcriptionNotation ===
                            'custom' ? (
                                <Field
                                    label={t(
                                        'dictionary.settings.customNotation',
                                    )}
                                    required
                                >
                                    <Input
                                        maxLength={40}
                                        onChange={(event) =>
                                            setSetting(
                                                'transcriptionCustomLabel',
                                                event.currentTarget.value ||
                                                    null,
                                            )
                                        }
                                        required
                                        value={
                                            draft.settings
                                                .transcriptionCustomLabel ?? ''
                                        }
                                    />
                                </Field>
                            ) : null}
                        </div>
                    ) : null}
                    <Checkbox
                        checked={draft.settings.definitionEnabled}
                        onChange={(event) =>
                            setSetting(
                                'definitionEnabled',
                                event.currentTarget.checked,
                            )
                        }
                    >
                        {t('dictionary.field.definition')}
                    </Checkbox>
                    {draft.settings.definitionEnabled ? (
                        <RoleSelect
                            label={t('dictionary.settings.definitionLanguage')}
                            onChange={(value) =>
                                setSetting('definitionLanguage', value)
                            }
                            value={draft.settings.definitionLanguage}
                        />
                    ) : null}
                    <Checkbox
                        checked={draft.settings.exampleEnabled}
                        onChange={(event) =>
                            setSetting(
                                'exampleEnabled',
                                event.currentTarget.checked,
                            )
                        }
                    >
                        {t('dictionary.field.example')}
                    </Checkbox>
                    {draft.settings.exampleEnabled ? (
                        <>
                            <RoleSelect
                                label={t('dictionary.settings.exampleLanguage')}
                                onChange={(value) =>
                                    setSetting('exampleLanguage', value)
                                }
                                value={draft.settings.exampleLanguage}
                            />
                            <Checkbox
                                checked={
                                    draft.settings.exampleTranslationEnabled
                                }
                                onChange={(event) =>
                                    setSetting(
                                        'exampleTranslationEnabled',
                                        event.currentTarget.checked,
                                    )
                                }
                            >
                                {t('dictionary.field.exampleTranslation')}
                            </Checkbox>
                        </>
                    ) : null}
                    <p className={styles.hint}>
                        {t('dictionary.settings.inactiveHelp')}
                    </p>
                </fieldset>
                {error ? <p role='alert'>{error}</p> : null}
                <p aria-live='polite' className={styles.outcome}>
                    {outcome}
                </p>
                <div className={styles.actions}>
                    <Button
                        onClick={() => {
                            setDraft(valuesFrom(dictionary));
                            setOutcome(t('dictionary.settings.cancelled'));
                        }}
                        type='button'
                        variant='quiet'
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button loading={pending} type='submit'>
                        {t('dictionary.settings.save')}
                    </Button>
                </div>
            </form>
        </Card>
    );
}

function RoleSelect({
    label,
    onChange,
    value,
}: {
    label: string;
    onChange(value: 'source' | 'target'): void;
    value: 'source' | 'target';
}) {
    const { t } = useI18n();
    return (
        <div className={styles.indented}>
            <Field label={label}>
                <Select
                    onChange={(event) =>
                        onChange(
                            event.currentTarget.value as 'source' | 'target',
                        )
                    }
                    value={value}
                >
                    <option value='source'>
                        {t('dictionary.role.source')}
                    </option>
                    <option value='target'>
                        {t('dictionary.role.target')}
                    </option>
                </Select>
            </Field>
        </div>
    );
}
