'use client';

import type {
    DictionaryCard,
    DictionaryCardOverrides,
    DictionaryCardValues,
    DictionaryEnableOverride,
    OwnedDictionary,
} from '@languon/contracts';
import { type FormEvent, useEffect, useState } from 'react';

import {
    authorshipMessageKey,
    languageDirection,
    languageForRole,
    languageLabel,
} from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Badge,
    Button,
    Card,
    Field,
    Input,
    InlineAlert,
    Select,
    Textarea,
} from '@/fsd/shared/ui';

import styles from './dictionary-card-form.module.css';
import { previewCardEffectiveSettings } from '../../lib/preview-card-effective-settings';
import { hasLoadedSourceDuplicate } from '../../lib/duplicate-source';

const EMPTY_VALUES: DictionaryCardValues = {
    definition: null,
    example: null,
    exampleTranslation: null,
    source: '',
    transcription: null,
    translation: '',
};
const EMPTY_OVERRIDES: DictionaryCardOverrides = {
    definitionEnabled: null,
    definitionLanguage: null,
    exampleEnabled: null,
    exampleLanguage: null,
    exampleTranslationEnabled: null,
    transcriptionCustomLabel: null,
    transcriptionEnabled: null,
    transcriptionNotation: null,
};

export interface DictionaryCardDraft {
    overrides: DictionaryCardOverrides;
    values: DictionaryCardValues;
}

export function DictionaryCardForm({
    card,
    dictionary,
    embedded = false,
    error,
    existingSources = [],
    languages,
    onCancel,
    onReloadConflict,
    onSave,
    pending,
    showHeading = true,
}: {
    card?: DictionaryCard | undefined;
    dictionary: OwnedDictionary;
    embedded?: boolean;
    error?: string | null;
    existingSources?: readonly string[];
    languages: Parameters<typeof languageLabel>[0];
    onCancel(): void;
    onReloadConflict?: (() => Promise<void> | void) | undefined;
    onSave(draft: DictionaryCardDraft): Promise<void>;
    pending: boolean;
    showHeading?: boolean;
}) {
    const { locale, t } = useI18n();
    const [draft, setDraft] = useState<DictionaryCardDraft>(() => ({
        overrides: card ? { ...card.overrides } : { ...EMPTY_OVERRIDES },
        values: card ? { ...card.values } : { ...EMPTY_VALUES },
    }));
    useEffect(
        () =>
            setDraft({
                overrides: card
                    ? { ...card.overrides }
                    : { ...EMPTY_OVERRIDES },
                values: card ? { ...card.values } : { ...EMPTY_VALUES },
            }),
        [card],
    );
    const effective = previewCardEffectiveSettings(
        dictionary.settings.values,
        draft.overrides,
    );
    const duplicate = hasLoadedSourceDuplicate(
        draft.values.source,
        existingSources,
    );

    function setValue<K extends keyof DictionaryCardValues>(
        key: K,
        value: DictionaryCardValues[K],
    ) {
        setDraft((current) => ({
            ...current,
            values: { ...current.values, [key]: value },
        }));
    }
    function setOverride<K extends keyof DictionaryCardOverrides>(
        key: K,
        value: DictionaryCardOverrides[K],
    ) {
        setDraft((current) => ({
            ...current,
            overrides: { ...current.overrides, [key]: value },
        }));
    }
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        try {
            await onSave(draft);
        } catch {
            // The owning mutation renders the recoverable error state.
        }
    }

    const sourceLabel = languageLabel(
        languages,
        dictionary.sourceLanguage,
        locale,
    );
    const targetLabel = languageLabel(
        languages,
        dictionary.targetLanguage,
        locale,
    );
    const sourceDirection = languageDirection(
        languages,
        dictionary.sourceLanguage,
    );
    const targetDirection = languageDirection(
        languages,
        dictionary.targetLanguage,
    );
    const definitionLanguage = languageForRole(
        effective.definitionLanguage,
        dictionary.sourceLanguage,
        dictionary.targetLanguage,
    );
    const exampleLanguage = languageForRole(
        effective.exampleLanguage,
        dictionary.sourceLanguage,
        dictionary.targetLanguage,
    );
    const exampleTranslationLanguage = languageForRole(
        effective.exampleTranslationLanguage,
        dictionary.sourceLanguage,
        dictionary.targetLanguage,
    );

    return (
        <Card
            className={[styles.card, embedded ? styles.embedded : '']
                .filter(Boolean)
                .join(' ')}
        >
            {showHeading || card ? (
                <header className={styles.header}>
                    {showHeading ? (
                        <h2>
                            {card
                                ? t('dictionary.card.editTitle')
                                : t('dictionary.card.createTitle')}
                        </h2>
                    ) : null}
                    {card ? (
                        <Badge>
                            {t(authorshipMessageKey(card.authorship))}
                        </Badge>
                    ) : null}
                </header>
            ) : null}
            <form
                className={styles.form}
                onSubmit={(event) => void submit(event)}
            >
                <Field
                    label={`${t('dictionary.field.source')} · ${sourceLabel}`}
                    required
                >
                    <Input
                        dir={sourceDirection}
                        lang={dictionary.sourceLanguage}
                        maxLength={200}
                        onChange={(event) =>
                            setValue('source', event.currentTarget.value)
                        }
                        required
                        value={draft.values.source}
                    />
                </Field>
                {duplicate ? (
                    <InlineAlert tone='warning'>
                        {t('dictionary.card.duplicateWarning')}
                    </InlineAlert>
                ) : null}
                <Field
                    label={`${t('dictionary.field.translation')} · ${targetLabel}`}
                    required
                >
                    <Input
                        dir={targetDirection}
                        lang={dictionary.targetLanguage}
                        maxLength={200}
                        onChange={(event) =>
                            setValue('translation', event.currentTarget.value)
                        }
                        required
                        value={draft.values.translation}
                    />
                </Field>
                {effective.transcriptionEnabled ? (
                    <Field label={t('dictionary.field.transcription')}>
                        <Input
                            dir={sourceDirection}
                            lang={dictionary.sourceLanguage}
                            maxLength={200}
                            onChange={(event) =>
                                setValue(
                                    'transcription',
                                    event.currentTarget.value || null,
                                )
                            }
                            value={draft.values.transcription ?? ''}
                        />
                    </Field>
                ) : (
                    <InactiveValue
                        label={t('dictionary.field.transcription')}
                        direction={sourceDirection}
                        lang={dictionary.sourceLanguage}
                        value={draft.values.transcription}
                    />
                )}
                {effective.definitionEnabled ? (
                    <Field
                        label={`${t('dictionary.field.definition')} · ${languageLabel(
                            languages,
                            definitionLanguage,
                            locale,
                        )}`}
                    >
                        <Textarea
                            dir={languageDirection(
                                languages,
                                definitionLanguage,
                            )}
                            lang={definitionLanguage}
                            maxLength={2000}
                            onChange={(event) =>
                                setValue(
                                    'definition',
                                    event.currentTarget.value || null,
                                )
                            }
                            value={draft.values.definition ?? ''}
                        />
                    </Field>
                ) : (
                    <InactiveValue
                        label={t('dictionary.field.definition')}
                        direction={languageDirection(
                            languages,
                            definitionLanguage,
                        )}
                        lang={definitionLanguage}
                        value={draft.values.definition}
                    />
                )}
                {effective.exampleEnabled ? (
                    <Field
                        label={`${t('dictionary.field.example')} · ${languageLabel(
                            languages,
                            exampleLanguage,
                            locale,
                        )}`}
                    >
                        <Textarea
                            dir={languageDirection(languages, exampleLanguage)}
                            lang={exampleLanguage}
                            maxLength={2000}
                            onChange={(event) =>
                                setValue(
                                    'example',
                                    event.currentTarget.value || null,
                                )
                            }
                            value={draft.values.example ?? ''}
                        />
                    </Field>
                ) : (
                    <InactiveValue
                        label={t('dictionary.field.example')}
                        direction={languageDirection(
                            languages,
                            exampleLanguage,
                        )}
                        lang={exampleLanguage}
                        value={draft.values.example}
                    />
                )}
                {effective.exampleTranslationEnabled ? (
                    <Field
                        label={`${t('dictionary.field.exampleTranslation')} · ${languageLabel(
                            languages,
                            exampleTranslationLanguage,
                            locale,
                        )}`}
                    >
                        <Textarea
                            dir={languageDirection(
                                languages,
                                exampleTranslationLanguage,
                            )}
                            lang={exampleTranslationLanguage}
                            maxLength={2000}
                            onChange={(event) =>
                                setValue(
                                    'exampleTranslation',
                                    event.currentTarget.value || null,
                                )
                            }
                            value={draft.values.exampleTranslation ?? ''}
                        />
                    </Field>
                ) : (
                    <InactiveValue
                        label={t('dictionary.field.exampleTranslation')}
                        direction={languageDirection(
                            languages,
                            exampleTranslationLanguage,
                        )}
                        lang={exampleTranslationLanguage}
                        value={draft.values.exampleTranslation}
                    />
                )}

                <details className={styles.advanced}>
                    <summary>{t('dictionary.card.advanced')}</summary>
                    <p>{t('dictionary.card.advancedHelp')}</p>
                    <OverrideSelect
                        label={t('dictionary.field.transcription')}
                        onChange={(value) =>
                            setOverride('transcriptionEnabled', value)
                        }
                        value={draft.overrides.transcriptionEnabled}
                    />
                    <Field label={t('dictionary.settings.notation')}>
                        <Select
                            onChange={(event) =>
                                setOverride(
                                    'transcriptionNotation',
                                    (event.currentTarget.value ||
                                        null) as DictionaryCardOverrides['transcriptionNotation'],
                                )
                            }
                            value={draft.overrides.transcriptionNotation ?? ''}
                        >
                            <option value=''>
                                {t('dictionary.override.inherit')}
                            </option>
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
                    <Field label={t('dictionary.settings.customNotation')}>
                        <Input
                            maxLength={40}
                            onChange={(event) =>
                                setOverride(
                                    'transcriptionCustomLabel',
                                    event.currentTarget.value || null,
                                )
                            }
                            value={
                                draft.overrides.transcriptionCustomLabel ?? ''
                            }
                        />
                    </Field>
                    <OverrideSelect
                        label={t('dictionary.field.definition')}
                        onChange={(value) =>
                            setOverride('definitionEnabled', value)
                        }
                        value={draft.overrides.definitionEnabled}
                    />
                    <RoleOverride
                        label={t('dictionary.settings.definitionLanguage')}
                        onChange={(value) =>
                            setOverride('definitionLanguage', value)
                        }
                        value={draft.overrides.definitionLanguage}
                    />
                    <OverrideSelect
                        label={t('dictionary.field.example')}
                        onChange={(value) =>
                            setOverride('exampleEnabled', value)
                        }
                        value={draft.overrides.exampleEnabled}
                    />
                    <RoleOverride
                        label={t('dictionary.settings.exampleLanguage')}
                        onChange={(value) =>
                            setOverride('exampleLanguage', value)
                        }
                        value={draft.overrides.exampleLanguage}
                    />
                    <OverrideSelect
                        allowEnabled={effective.exampleEnabled}
                        label={t('dictionary.field.exampleTranslation')}
                        onChange={(value) =>
                            setOverride('exampleTranslationEnabled', value)
                        }
                        value={draft.overrides.exampleTranslationEnabled}
                    />
                </details>
                {error ? (
                    <div role='alert'>
                        <p>{error}</p>
                        {onReloadConflict ? (
                            <Button
                                onClick={() => void onReloadConflict()}
                                type='button'
                                variant='secondary'
                            >
                                {t('dictionary.conflict.reload')}
                            </Button>
                        ) : null}
                    </div>
                ) : null}
                <div className={styles.actions}>
                    <Button
                        disabled={pending}
                        onClick={onCancel}
                        type='button'
                        variant='quiet'
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button loading={pending} type='submit'>
                        {t('dictionary.card.save')}
                    </Button>
                </div>
            </form>
        </Card>
    );
}

function InactiveValue({
    direction,
    label,
    lang,
    value,
}: {
    direction: 'ltr' | 'rtl';
    label: string;
    lang: string;
    value: string | null;
}) {
    const { t } = useI18n();
    if (!value) return null;
    return (
        <aside className={styles.inactive}>
            <strong>
                {t('dictionary.card.inactiveValue', { field: label })}
            </strong>
            <p dir={direction} lang={lang}>
                {value}
            </p>
            <small>{t('dictionary.card.inactiveHelp')}</small>
        </aside>
    );
}

function OverrideSelect({
    allowEnabled = true,
    label,
    onChange,
    value,
}: {
    allowEnabled?: boolean;
    label: string;
    onChange(value: DictionaryEnableOverride): void;
    value: DictionaryEnableOverride;
}) {
    const { t } = useI18n();
    return (
        <Field label={label}>
            <Select
                onChange={(event) =>
                    onChange(
                        (event.currentTarget.value ||
                            null) as DictionaryEnableOverride,
                    )
                }
                value={value ?? ''}
            >
                <option value=''>{t('dictionary.override.inherit')}</option>
                <option disabled={!allowEnabled} value='enabled'>
                    {t('dictionary.override.enabled')}
                </option>
                <option value='disabled'>
                    {t('dictionary.override.disabled')}
                </option>
            </Select>
        </Field>
    );
}

function RoleOverride({
    label,
    onChange,
    value,
}: {
    label: string;
    onChange(value: 'source' | 'target' | null): void;
    value: 'source' | 'target' | null;
}) {
    const { t } = useI18n();
    return (
        <Field label={label}>
            <Select
                onChange={(event) =>
                    onChange(
                        (event.currentTarget.value || null) as
                            'source' | 'target' | null,
                    )
                }
                value={value ?? ''}
            >
                <option value=''>{t('dictionary.override.inherit')}</option>
                <option value='source'>{t('dictionary.role.source')}</option>
                <option value='target'>{t('dictionary.role.target')}</option>
            </Select>
        </Field>
    );
}
