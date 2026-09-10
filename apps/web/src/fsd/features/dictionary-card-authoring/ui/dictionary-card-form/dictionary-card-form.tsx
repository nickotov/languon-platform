'use client';

import type {
    DictionaryCard,
    DictionaryCardOverrides,
    DictionaryCardValues,
    DictionaryCardAuthoringField,
    DictionaryCardAuthoringGenerationJob,
    DictionaryCardAuthoringProposal,
    DictionaryCardAuthoringSelectedSuggestion,
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
    Progress,
    Select,
    Textarea,
} from '@/fsd/shared/ui';

import styles from './dictionary-card-form.module.css';
import { previewCardEffectiveSettings } from '../../lib/preview-card-effective-settings';
import { hasLoadedSourceDuplicate } from '../../lib/duplicate-source';
import { discardedSuggestionIdsForPredecessor } from '../../lib/authoring-job-cleanup';

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

export type DictionaryCardAuthoringAction =
    | { kind: 'cancel' }
    | {
          discardedSuggestionIds: string[];
          draft: DictionaryCardDraft;
          kind: 'generate';
          scope:
              | { kind: 'all' }
              | { kind: 'field'; field: DictionaryCardAuthoringField };
          successor: boolean;
      };

export interface DictionaryCardAuthoringAI {
    available: boolean;
    error?: string | null;
    job?: DictionaryCardAuthoringGenerationJob | null;
    onAction(action: DictionaryCardAuthoringAction): Promise<void>;
    pending: boolean;
    proposal?: DictionaryCardAuthoringProposal | null;
    successorActive?: boolean;
}

export function DictionaryCardForm({
    card,
    ai,
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
    ai?: DictionaryCardAuthoringAI | undefined;
    dictionary: OwnedDictionary;
    embedded?: boolean;
    error?: string | null;
    existingSources?: readonly string[];
    languages: Parameters<typeof languageLabel>[0];
    onCancel(): void;
    onReloadConflict?: (() => Promise<void> | void) | undefined;
    onSave(
        draft: DictionaryCardDraft,
        selectedSuggestions: DictionaryCardAuthoringSelectedSuggestion[],
    ): Promise<void>;
    pending: boolean;
    showHeading?: boolean;
}) {
    const { locale, t } = useI18n();
    const [draft, setDraft] = useState<DictionaryCardDraft>(() => ({
        overrides: card ? { ...card.overrides } : { ...EMPTY_OVERRIDES },
        values: card ? { ...card.values } : { ...EMPTY_VALUES },
    }));
    const [hiddenSuggestionIds, setHiddenSuggestionIds] = useState<Set<string>>(
        () => new Set(),
    );
    const [selectedSuggestions, setSelectedSuggestions] = useState<
        Partial<Record<DictionaryCardAuthoringField, string>>
    >({});
    useEffect(() => {
        setDraft({
            overrides: card ? { ...card.overrides } : { ...EMPTY_OVERRIDES },
            values: card ? { ...card.values } : { ...EMPTY_VALUES },
        });
        setHiddenSuggestionIds(new Set());
        setSelectedSuggestions({});
    }, [card]);
    useEffect(() => {
        if (!ai?.proposal) return;
        const predecessorIds = new Set(
            ai.proposal.suggestions.map((suggestion) => suggestion.id),
        );
        setHiddenSuggestionIds((current) => {
            const retained = [...current].filter((id) =>
                predecessorIds.has(id),
            );
            return retained.length === current.size
                ? current
                : new Set(retained);
        });
    }, [ai?.proposal]);
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
        preserveSelection = false,
    ) {
        setDraft((current) => ({
            ...current,
            values: { ...current.values, [key]: value },
        }));
        if (preserveSelection) return;
        setSelectedSuggestions((current) => {
            if (key === 'source') return {};
            const field = key as DictionaryCardAuthoringField;
            if (!current[field]) return current;
            const next = { ...current };
            delete next[field];
            return next;
        });
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
            await onSave(
                draft,
                stale
                    ? []
                    : Object.entries(selectedSuggestions)
                          .map(([field, suggestionId]) => ({
                              field: field as DictionaryCardAuthoringField,
                              suggestionId,
                          }))
                          .filter(({ field }) =>
                              field === 'translation'
                                  ? true
                                  : field === 'transcription'
                                    ? effective.transcriptionEnabled
                                    : field === 'definition'
                                      ? effective.definitionEnabled
                                      : field === 'example'
                                        ? effective.exampleEnabled
                                        : effective.exampleTranslationEnabled,
                          ),
            );
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
    const validSource = isValidCardAuthoringSource(draft.values.source);
    const stale = Boolean(
        ai?.proposal && ai.proposal.source !== draft.values.source.trim(),
    );
    const active = ai?.job?.state === 'queued' || ai?.job?.state === 'running';

    function acceptSuggestion(
        field: DictionaryCardAuthoringField,
        suggestionId: string,
        value: string,
    ) {
        if (stale) return;
        setValue(field, value, true);
        setSelectedSuggestions((current) => ({
            ...current,
            [field]: suggestionId,
        }));
    }

    function discardSuggestion(
        field: DictionaryCardAuthoringField,
        suggestionId: string,
    ) {
        setHiddenSuggestionIds((current) => new Set(current).add(suggestionId));
        setSelectedSuggestions((current) => {
            if (current[field] !== suggestionId) return current;
            const next = { ...current };
            delete next[field];
            return next;
        });
    }

    async function generate(
        scope:
            | { kind: 'all' }
            | { kind: 'field'; field: DictionaryCardAuthoringField },
    ) {
        if (!ai || !validSource || active) return;
        try {
            await ai.onAction({
                discardedSuggestionIds: discardedSuggestionIdsForPredecessor(
                    hiddenSuggestionIds,
                    ai.proposal,
                ),
                draft,
                kind: 'generate',
                scope,
                successor: Boolean(ai.proposal) && !stale,
            });
        } catch {
            // The owning orchestration renders a safe recoverable error.
        }
    }

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
                        onChange={(event) =>
                            setValue(
                                'source',
                                [...event.currentTarget.value]
                                    .slice(0, 200)
                                    .join(''),
                            )
                        }
                        required
                        value={draft.values.source}
                    />
                </Field>
                {!card && ai && validSource ? (
                    <section
                        aria-label={t('dictionary.authoring.aiSection')}
                        className={styles.aiControls}
                    >
                        <div className={styles.aiActionRow}>
                            <Button
                                disabled={!ai.available || active || ai.pending}
                                loading={ai.pending && !active}
                                onClick={() => void generate({ kind: 'all' })}
                                type='button'
                                variant='secondary'
                            >
                                {ai.proposal && !stale
                                    ? t('dictionary.authoring.regenerateAll')
                                    : t('dictionary.authoring.generate')}
                            </Button>
                            <small>
                                {t('dictionary.authoring.generateHelp')}
                            </small>
                        </div>
                        {active && ai.job ? (
                            <div className={styles.aiProgress}>
                                <div aria-live='polite' role='status'>
                                    {t(
                                        ai.job.progress.stage === 'queued'
                                            ? 'dictionary.authoring.stage.queued'
                                            : ai.job.progress.stage ===
                                                'validating'
                                              ? 'dictionary.authoring.stage.validating'
                                              : 'dictionary.authoring.stage.generating',
                                    )}
                                </div>
                                <Progress
                                    label={t('dictionary.authoring.progress')}
                                    value={ai.job.progress.percent}
                                />
                                <Button
                                    disabled={ai.job.cancellationRequested}
                                    onClick={() =>
                                        void ai
                                            .onAction({ kind: 'cancel' })
                                            .catch(() => undefined)
                                    }
                                    size='small'
                                    type='button'
                                    variant='quiet'
                                >
                                    {ai.job.cancellationRequested
                                        ? t('dictionary.authoring.cancelling')
                                        : t('dictionary.authoring.cancel')}
                                </Button>
                            </div>
                        ) : null}
                        {!ai.available ? (
                            <InlineAlert>
                                {t('dictionary.authoring.unavailable')}
                            </InlineAlert>
                        ) : null}
                        {stale ? (
                            <InlineAlert tone='warning'>
                                {t('dictionary.authoring.stale')}
                            </InlineAlert>
                        ) : null}
                        {ai.error ? (
                            <InlineAlert tone='danger'>{ai.error}</InlineAlert>
                        ) : null}
                    </section>
                ) : null}
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
                        maxLength={400}
                        onChange={(event) =>
                            setValue('translation', event.currentTarget.value)
                        }
                        required
                        value={draft.values.translation}
                    />
                </Field>
                <FieldSuggestions
                    ai={ai}
                    direction={targetDirection}
                    disabled={stale}
                    field='translation'
                    hidden={hiddenSuggestionIds}
                    lang={dictionary.targetLanguage}
                    onAccept={acceptSuggestion}
                    onDiscard={discardSuggestion}
                    onRegenerate={(field) =>
                        void generate({ kind: 'field', field })
                    }
                    regenerationDisabled={stale || active}
                    selectedId={selectedSuggestions.translation}
                />
                {effective.transcriptionEnabled ? (
                    <>
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
                        <FieldSuggestions
                            ai={ai}
                            direction={sourceDirection}
                            disabled={stale}
                            field='transcription'
                            hidden={hiddenSuggestionIds}
                            lang={dictionary.sourceLanguage}
                            onAccept={acceptSuggestion}
                            onDiscard={discardSuggestion}
                            onRegenerate={(field) =>
                                void generate({ kind: 'field', field })
                            }
                            regenerationDisabled={stale || active}
                            selectedId={selectedSuggestions.transcription}
                        />
                    </>
                ) : (
                    <InactiveValue
                        label={t('dictionary.field.transcription')}
                        direction={sourceDirection}
                        lang={dictionary.sourceLanguage}
                        value={draft.values.transcription}
                    />
                )}
                {effective.definitionEnabled ? (
                    <>
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
                        <FieldSuggestions
                            ai={ai}
                            direction={languageDirection(
                                languages,
                                definitionLanguage,
                            )}
                            disabled={stale}
                            field='definition'
                            hidden={hiddenSuggestionIds}
                            lang={definitionLanguage}
                            onAccept={acceptSuggestion}
                            onDiscard={discardSuggestion}
                            onRegenerate={(field) =>
                                void generate({ kind: 'field', field })
                            }
                            regenerationDisabled={stale || active}
                            selectedId={selectedSuggestions.definition}
                        />
                    </>
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
                    <>
                        <Field
                            label={`${t('dictionary.field.example')} · ${languageLabel(
                                languages,
                                exampleLanguage,
                                locale,
                            )}`}
                        >
                            <Textarea
                                dir={languageDirection(
                                    languages,
                                    exampleLanguage,
                                )}
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
                        <FieldSuggestions
                            ai={ai}
                            direction={languageDirection(
                                languages,
                                exampleLanguage,
                            )}
                            disabled={stale}
                            field='example'
                            hidden={hiddenSuggestionIds}
                            lang={exampleLanguage}
                            onAccept={acceptSuggestion}
                            onDiscard={discardSuggestion}
                            onRegenerate={(field) =>
                                void generate({ kind: 'field', field })
                            }
                            regenerationDisabled={stale || active}
                            selectedId={selectedSuggestions.example}
                        />
                    </>
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
                    <>
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
                        <FieldSuggestions
                            ai={ai}
                            direction={languageDirection(
                                languages,
                                exampleTranslationLanguage,
                            )}
                            disabled={stale}
                            field='exampleTranslation'
                            hidden={hiddenSuggestionIds}
                            lang={exampleTranslationLanguage}
                            onAccept={acceptSuggestion}
                            onDiscard={discardSuggestion}
                            onRegenerate={(field) =>
                                void generate({ kind: 'field', field })
                            }
                            regenerationDisabled={stale || active}
                            selectedId={selectedSuggestions.exampleTranslation}
                        />
                    </>
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
                    <Button
                        disabled={ai?.successorActive}
                        loading={pending}
                        type='submit'
                    >
                        {t('dictionary.card.save')}
                    </Button>
                </div>
            </form>
        </Card>
    );
}

function FieldSuggestions({
    ai,
    direction,
    disabled,
    field,
    hidden,
    lang,
    onAccept,
    onDiscard,
    onRegenerate,
    regenerationDisabled,
    selectedId,
}: {
    ai?: DictionaryCardAuthoringAI | undefined;
    direction: 'ltr' | 'rtl';
    disabled: boolean;
    field: DictionaryCardAuthoringField;
    hidden: ReadonlySet<string>;
    lang: string;
    onAccept(
        field: DictionaryCardAuthoringField,
        id: string,
        value: string,
    ): void;
    onDiscard(field: DictionaryCardAuthoringField, id: string): void;
    onRegenerate(field: DictionaryCardAuthoringField): void;
    regenerationDisabled: boolean;
    selectedId?: string | undefined;
}) {
    const { t } = useI18n();
    const suggestions =
        ai?.proposal?.suggestions.filter(
            (suggestion) =>
                suggestion.field === field && !hidden.has(suggestion.id),
        ) ?? [];
    if (suggestions.length === 0) return null;
    const fieldLabel = t(`dictionary.field.${field}`);
    const atLimit = suggestions.length >= 6;
    return (
        <section
            aria-label={t('dictionary.authoring.suggestionsFor', {
                field: fieldLabel,
            })}
            className={styles.suggestions}
        >
            <div className={styles.suggestionHeading}>
                <strong>{t('dictionary.authoring.suggestions')}</strong>
            </div>
            {atLimit ? (
                <small>{t('dictionary.authoring.limitReached')}</small>
            ) : null}
            <ul className={styles.suggestionList}>
                {suggestions.map((suggestion) => {
                    const selected = selectedId === suggestion.id;
                    return (
                        <li
                            className={styles.suggestion}
                            data-selected={selected || undefined}
                            key={suggestion.id}
                        >
                            <p dir={direction} lang={lang}>
                                {suggestion.value}
                            </p>
                            <div className={styles.suggestionActions}>
                                <Button
                                    aria-label={t(
                                        'dictionary.authoring.acceptNamed',
                                        { field: fieldLabel },
                                    )}
                                    disabled={disabled}
                                    onClick={() =>
                                        onAccept(
                                            field,
                                            suggestion.id,
                                            suggestion.value,
                                        )
                                    }
                                    size='small'
                                    type='button'
                                    variant={selected ? 'secondary' : 'primary'}
                                >
                                    {selected
                                        ? t('dictionary.authoring.accepted')
                                        : t('dictionary.authoring.accept')}
                                </Button>
                                <Button
                                    aria-label={t(
                                        'dictionary.authoring.discardNamed',
                                        { field: fieldLabel },
                                    )}
                                    disabled={disabled}
                                    onClick={() =>
                                        onDiscard(field, suggestion.id)
                                    }
                                    size='small'
                                    type='button'
                                    variant='quiet'
                                >
                                    {t('dictionary.authoring.discard')}
                                </Button>
                                <Button
                                    aria-label={t(
                                        'dictionary.authoring.regenerateFieldNamed',
                                        { field: fieldLabel },
                                    )}
                                    disabled={
                                        regenerationDisabled ||
                                        ai?.pending ||
                                        atLimit
                                    }
                                    onClick={() => onRegenerate(field)}
                                    size='small'
                                    type='button'
                                    variant='quiet'
                                >
                                    {t('dictionary.authoring.regenerateField')}
                                </Button>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

function isValidCardAuthoringSource(source: string) {
    const trimmed = source.trim();
    return (
        trimmed.length > 0 &&
        [...trimmed].length <= 200 &&
        ![...trimmed].some((character) => {
            const code = character.codePointAt(0)!;
            return (
                code <= 8 ||
                code === 11 ||
                code === 12 ||
                (code >= 14 && code <= 31) ||
                (code >= 127 && code <= 159)
            );
        })
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
