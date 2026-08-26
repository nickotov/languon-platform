'use client';

import type {
    DictionaryCard,
    DictionaryCardOverrides,
    DictionaryCardValues,
    DictionaryGenerationCandidate,
    DictionaryGenerationField,
    DictionarySingleCardGenerationJob,
    LanguageCatalogEntry,
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
    InlineAlert,
    Input,
    Progress,
    Select,
    Textarea,
} from '@/fsd/shared/ui';

import styles from './dictionary-generation-panel.module.css';

const FIELD_KEYS = [
    'source',
    'translation',
    'transcription',
    'definition',
    'example',
    'exampleTranslation',
] as const satisfies readonly DictionaryGenerationField[];

export function DictionaryGenerationPanel({
    available,
    card,
    conflict,
    currentCard,
    dictionary,
    error,
    job,
    languages,
    onAccept,
    onCancel,
    onClose,
    onDiscard,
    onReloadCompare,
    onRegenerate,
    onStart,
    pendingAction,
}: {
    available: boolean;
    card?: DictionaryCard | undefined;
    conflict?: boolean | undefined;
    currentCard?: DictionaryCard | undefined;
    dictionary: OwnedDictionary;
    error?: string | null | undefined;
    job?: DictionarySingleCardGenerationJob | undefined;
    languages: readonly LanguageCatalogEntry[];
    onAccept(candidate: DictionaryGenerationCandidate): Promise<void>;
    onCancel(): Promise<void>;
    onClose(): void;
    onDiscard(): Promise<void>;
    onReloadCompare(): Promise<void>;
    onRegenerate(instruction?: string): Promise<void>;
    onStart(instruction?: string): Promise<void>;
    pendingAction: boolean;
}) {
    const { t } = useI18n();
    const [instruction, setInstruction] = useState('');
    const [candidate, setCandidate] =
        useState<DictionaryGenerationCandidate | null>(
            job?.proposal?.candidate ?? null,
        );
    useEffect(() => {
        setCandidate(job?.proposal?.candidate ?? null);
    }, [job?.id, job?.proposal]);

    async function submit(
        event: FormEvent<HTMLFormElement>,
        action: (value?: string) => Promise<void>,
    ) {
        event.preventDefault();
        try {
            await action(instruction.trim() || undefined);
        } catch {
            // The owning mutation keeps the actionable error visible.
        }
    }
    async function runAction(action: () => Promise<void>) {
        try {
            await action();
        } catch {
            // The owning mutation keeps the actionable error visible.
        }
    }

    const titleId = `dictionary-generation-${job?.id ?? card?.id ?? 'new'}`;
    return (
        <section aria-labelledby={titleId} className={styles.section}>
            <header className={styles.header}>
                <div>
                    <p className={styles.eyebrow}>
                        {t('dictionary.generation.eyebrow')}
                    </p>
                    <h2 id={titleId}>{t('dictionary.generation.title')}</h2>
                </div>
                <Button
                    disabled={pendingAction}
                    onClick={onClose}
                    type='button'
                    variant='quiet'
                >
                    {t('dictionary.generation.close')}
                </Button>
            </header>

            {error ? <InlineAlert tone='danger'>{error}</InlineAlert> : null}
            {!available ? (
                <InlineAlert tone='info'>
                    {t('dictionary.generation.error.unavailable')}
                </InlineAlert>
            ) : null}
            {conflict ? (
                <InlineAlert tone='danger'>
                    <strong>{t('dictionary.generation.conflictTitle')}</strong>
                    <p>{t('dictionary.generation.conflictHelp')}</p>
                    <Button
                        onClick={() => void runAction(onReloadCompare)}
                        type='button'
                        variant='secondary'
                    >
                        {t('dictionary.generation.reloadCompare')}
                    </Button>
                </InlineAlert>
            ) : null}
            {conflict && currentCard ? (
                <Card className={styles.original}>
                    <header className={styles.cardHeader}>
                        <h3>{t('dictionary.generation.current')}</h3>
                        <Badge tone='warning'>
                            {t('dictionary.generation.currentVersion', {
                                version: currentCard.version,
                            })}
                        </Badge>
                    </header>
                    <ValueList
                        dictionary={dictionary}
                        effectiveSettings={currentCard.effectiveSettings}
                        languages={languages}
                        values={currentCard.values}
                    />
                </Card>
            ) : null}

            {!job ? (
                <GenerationInstructionForm
                    disabled={!available || !card || pendingAction}
                    instruction={instruction}
                    onInstructionChange={setInstruction}
                    onSubmit={(event) => void submit(event, onStart)}
                    pending={pendingAction}
                    submitLabel={t('dictionary.generation.start')}
                />
            ) : null}

            {job && (job.state === 'queued' || job.state === 'running') ? (
                <Card className={styles.progressCard}>
                    <strong>
                        {t(`dictionary.generation.stage.${job.progress.stage}`)}
                    </strong>
                    <p>{t('dictionary.generation.persistenceHelp')}</p>
                    <Progress
                        label={t('dictionary.generation.progressLabel')}
                        value={job.progress.percent}
                    />
                    <Button
                        disabled={job.cancellationRequested}
                        loading={pendingAction}
                        onClick={() => void runAction(onCancel)}
                        type='button'
                        variant='secondary'
                    >
                        {job.cancellationRequested
                            ? t('dictionary.generation.cancelling')
                            : t('dictionary.generation.cancel')}
                    </Button>
                </Card>
            ) : null}

            {job?.state === 'review' &&
            job.originalSnapshot &&
            job.proposal &&
            candidate ? (
                <>
                    {job.proposal.warnings.length ? (
                        <InlineAlert tone='warning'>
                            <strong>
                                {t('dictionary.generation.warnings')}
                            </strong>
                            <ul>
                                {job.proposal.warnings.map((warning, index) => (
                                    <li key={`${index}-${warning}`}>
                                        {warning}
                                    </li>
                                ))}
                            </ul>
                        </InlineAlert>
                    ) : null}
                    <div className={styles.comparison}>
                        <OriginalCard
                            dictionary={dictionary}
                            job={job}
                            languages={languages}
                        />
                        <ProposalCard
                            candidate={candidate}
                            job={job}
                            languages={languages}
                            onChange={setCandidate}
                        />
                    </div>
                    <div className={styles.reviewActions}>
                        <Button
                            disabled={pendingAction}
                            onClick={() => void runAction(onDiscard)}
                            type='button'
                            variant='danger'
                        >
                            {t('dictionary.generation.discard')}
                        </Button>
                        <GenerationInstructionForm
                            disabled={!available || pendingAction}
                            instruction={instruction}
                            onInstructionChange={setInstruction}
                            onSubmit={(event) =>
                                void submit(event, onRegenerate)
                            }
                            pending={pendingAction}
                            submitLabel={t('dictionary.generation.regenerate')}
                        />
                        <Button
                            disabled={
                                conflict ||
                                candidate.values.source.trim() === '' ||
                                candidate.values.translation.trim() === '' ||
                                ((candidate.overrides.transcriptionNotation ??
                                    job.originalSnapshot.effectiveSettings
                                        .transcriptionNotation) === 'custom' &&
                                    (candidate.overrides
                                        .transcriptionCustomLabel ??
                                        job.originalSnapshot.effectiveSettings
                                            .transcriptionCustomLabel) === null)
                            }
                            loading={pendingAction}
                            onClick={() =>
                                void runAction(() => onAccept(candidate))
                            }
                            type='button'
                        >
                            {t('dictionary.generation.accept')}
                        </Button>
                    </div>
                </>
            ) : null}

            {job &&
            ['accepted', 'discarded', 'cancelled', 'expired'].includes(
                job.state,
            ) ? (
                <>
                    <InlineAlert
                        tone={job.state === 'accepted' ? 'success' : 'info'}
                    >
                        {t(terminalStateMessageKey(job.state))}
                    </InlineAlert>
                    {card ? (
                        <GenerationInstructionForm
                            disabled={!available || pendingAction}
                            instruction={instruction}
                            onInstructionChange={setInstruction}
                            onSubmit={(event) => void submit(event, onStart)}
                            pending={pendingAction}
                            submitLabel={t('dictionary.generation.startNew')}
                        />
                    ) : null}
                </>
            ) : null}

            {job?.state === 'failed' ? (
                <InlineAlert tone='danger'>
                    <strong>{t('dictionary.generation.state.failed')}</strong>
                    <p>{job.failure?.message}</p>
                    {job.failure?.retryable ? (
                        <GenerationInstructionForm
                            disabled={!available || pendingAction}
                            instruction={instruction}
                            onInstructionChange={setInstruction}
                            onSubmit={(event) =>
                                void submit(event, onRegenerate)
                            }
                            pending={pendingAction}
                            submitLabel={t('dictionary.generation.retry')}
                        />
                    ) : null}
                </InlineAlert>
            ) : null}
        </section>
    );
}

function GenerationInstructionForm({
    disabled,
    instruction,
    onInstructionChange,
    onSubmit,
    pending,
    submitLabel,
}: {
    disabled: boolean;
    instruction: string;
    onInstructionChange(value: string): void;
    onSubmit(event: FormEvent<HTMLFormElement>): void;
    pending: boolean;
    submitLabel: string;
}) {
    const { t } = useI18n();
    return (
        <form className={styles.instructionForm} onSubmit={onSubmit}>
            <Field
                hint={t('dictionary.generation.instructionHelp')}
                label={t('dictionary.generation.instruction')}
                optionalLabel={t('dictionary.field.optional')}
            >
                <Textarea
                    disabled={disabled}
                    maxLength={1000}
                    onChange={(event) =>
                        onInstructionChange(event.currentTarget.value)
                    }
                    rows={3}
                    value={instruction}
                />
            </Field>
            <Button disabled={disabled} loading={pending} type='submit'>
                {submitLabel}
            </Button>
        </form>
    );
}

function OriginalCard({
    dictionary,
    job,
    languages,
}: {
    dictionary: OwnedDictionary;
    job: DictionarySingleCardGenerationJob;
    languages: readonly LanguageCatalogEntry[];
}) {
    const { t } = useI18n();
    const original = job.originalSnapshot!;
    return (
        <Card className={styles.original}>
            <header className={styles.cardHeader}>
                <h3>{t('dictionary.generation.original')}</h3>
                <Badge>{t(authorshipMessageKey(original.authorship))}</Badge>
            </header>
            <p className={styles.version}>
                {t('dictionary.generation.version', {
                    version: job.expectedCardVersion,
                })}
            </p>
            <ValueList
                dictionary={dictionary}
                effectiveSettings={original.effectiveSettings}
                languages={languages}
                values={original.values}
            />
        </Card>
    );
}

function ProposalCard({
    candidate,
    job,
    languages,
    onChange,
}: {
    candidate: DictionaryGenerationCandidate;
    job: DictionarySingleCardGenerationJob;
    languages: readonly LanguageCatalogEntry[];
    onChange(candidate: DictionaryGenerationCandidate): void;
}) {
    const { locale, t } = useI18n();
    const feedbackByField = new Map(
        job.proposal!.fieldFeedback.map((entry) => [entry.field, entry]),
    );
    const exampleEnabled =
        candidate.overrides.exampleEnabled === 'enabled'
            ? true
            : candidate.overrides.exampleEnabled === 'disabled'
              ? false
              : job.originalSnapshot!.effectiveSettings.exampleEnabled;
    const transcriptionNotation =
        candidate.overrides.transcriptionNotation ??
        job.originalSnapshot!.effectiveSettings.transcriptionNotation;

    function setValue<K extends keyof DictionaryCardValues>(
        field: K,
        value: DictionaryCardValues[K],
    ) {
        onChange({
            ...candidate,
            values: { ...candidate.values, [field]: value },
        });
    }
    function setOverride<K extends keyof DictionaryCardOverrides>(
        field: K,
        value: DictionaryCardOverrides[K],
    ) {
        onChange({
            ...candidate,
            overrides: { ...candidate.overrides, [field]: value },
        });
    }

    return (
        <Card className={styles.proposal}>
            <header className={styles.cardHeader}>
                <h3>{t('dictionary.generation.proposal')}</h3>
                <Badge tone='info'>{t('dictionary.generation.editable')}</Badge>
            </header>
            <div className={styles.fields}>
                {FIELD_KEYS.map((field) => {
                    const feedback = feedbackByField.get(field);
                    const value = candidate.values[field] ?? '';
                    const lang = fieldLanguage(field, candidate.overrides, job);
                    const label = `${fieldLabel(field, t)} · ${languageLabel(
                        languages,
                        lang,
                        locale,
                    )}`;
                    const changed =
                        value !== (job.originalSnapshot!.values[field] ?? '');
                    const Control =
                        field === 'source' ||
                        field === 'translation' ||
                        field === 'transcription'
                            ? Input
                            : Textarea;
                    return (
                        <div className={styles.proposalField} key={field}>
                            <Field
                                label={label}
                                required={
                                    field === 'source' ||
                                    field === 'translation'
                                }
                            >
                                <Control
                                    dir={languageDirection(languages, lang)}
                                    lang={lang}
                                    maxLength={
                                        field === 'source' ||
                                        field === 'translation' ||
                                        field === 'transcription'
                                            ? 200
                                            : 2000
                                    }
                                    onChange={(event) =>
                                        setValue(
                                            field,
                                            event.currentTarget.value ||
                                                (field === 'source' ||
                                                field === 'translation'
                                                    ? ''
                                                    : null),
                                        )
                                    }
                                    required={
                                        field === 'source' ||
                                        field === 'translation'
                                    }
                                    value={value}
                                />
                            </Field>
                            <span className={styles.changeMarker}>
                                {changed
                                    ? t('dictionary.generation.changed')
                                    : t('dictionary.generation.unchanged')}
                            </span>
                            {feedback ? (
                                <div className={styles.feedback}>
                                    <p>
                                        <strong>
                                            {t('dictionary.generation.reason')}
                                        </strong>{' '}
                                        {feedback.reason}
                                    </p>
                                    {feedback.alternatives.length ? (
                                        <div>
                                            <strong>
                                                {t(
                                                    'dictionary.generation.alternatives',
                                                )}
                                            </strong>
                                            <ul>
                                                {feedback.alternatives.map(
                                                    (alternative) => (
                                                        <li key={alternative}>
                                                            <Button
                                                                onClick={() =>
                                                                    setValue(
                                                                        field,
                                                                        alternative,
                                                                    )
                                                                }
                                                                size='small'
                                                                type='button'
                                                                variant='quiet'
                                                            >
                                                                <span
                                                                    dir={languageDirection(
                                                                        languages,
                                                                        lang,
                                                                    )}
                                                                    lang={lang}
                                                                >
                                                                    {
                                                                        alternative
                                                                    }
                                                                </span>
                                                            </Button>
                                                        </li>
                                                    ),
                                                )}
                                            </ul>
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </div>
            <details className={styles.advanced}>
                <summary>{t('dictionary.card.advanced')}</summary>
                <p>{t('dictionary.card.advancedHelp')}</p>
                <div className={styles.overrideGrid}>
                    {(
                        [
                            'transcriptionEnabled',
                            'definitionEnabled',
                            'exampleEnabled',
                            'exampleTranslationEnabled',
                        ] as const
                    ).map((field) => (
                        <Field key={field} label={overrideLabel(field, t)}>
                            <Select
                                onChange={(event) =>
                                    setOverride(
                                        field,
                                        event.currentTarget.value === ''
                                            ? null
                                            : (event.currentTarget.value as
                                                  'enabled' | 'disabled'),
                                    )
                                }
                                value={candidate.overrides[field] ?? ''}
                            >
                                <option value=''>
                                    {t('dictionary.override.inherit')}
                                </option>
                                <option
                                    disabled={
                                        field === 'exampleTranslationEnabled' &&
                                        !exampleEnabled
                                    }
                                    value='enabled'
                                >
                                    {t('dictionary.override.enabled')}
                                </option>
                                <option value='disabled'>
                                    {t('dictionary.override.disabled')}
                                </option>
                            </Select>
                        </Field>
                    ))}
                    <Field label={t('dictionary.settings.definitionLanguage')}>
                        <Select
                            onChange={(event) =>
                                setOverride(
                                    'definitionLanguage',
                                    event.currentTarget.value === ''
                                        ? null
                                        : (event.currentTarget.value as
                                              'source' | 'target'),
                                )
                            }
                            value={candidate.overrides.definitionLanguage ?? ''}
                        >
                            <option value=''>
                                {t('dictionary.override.inherit')}
                            </option>
                            <option value='source'>
                                {t('dictionary.role.source')}
                            </option>
                            <option value='target'>
                                {t('dictionary.role.target')}
                            </option>
                        </Select>
                    </Field>
                    <Field label={t('dictionary.settings.exampleLanguage')}>
                        <Select
                            onChange={(event) =>
                                setOverride(
                                    'exampleLanguage',
                                    event.currentTarget.value === ''
                                        ? null
                                        : (event.currentTarget.value as
                                              'source' | 'target'),
                                )
                            }
                            value={candidate.overrides.exampleLanguage ?? ''}
                        >
                            <option value=''>
                                {t('dictionary.override.inherit')}
                            </option>
                            <option value='source'>
                                {t('dictionary.role.source')}
                            </option>
                            <option value='target'>
                                {t('dictionary.role.target')}
                            </option>
                        </Select>
                    </Field>
                    <Field label={t('dictionary.settings.notation')}>
                        <Select
                            onChange={(event) =>
                                setOverride(
                                    'transcriptionNotation',
                                    event.currentTarget.value === ''
                                        ? null
                                        : (event.currentTarget.value as
                                              | 'ipa'
                                              | 'romanization'
                                              | 'custom'),
                                )
                            }
                            value={
                                candidate.overrides.transcriptionNotation ?? ''
                            }
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
                    {transcriptionNotation === 'custom' ? (
                        <Field
                            label={t('dictionary.settings.customNotation')}
                            optionalLabel={t('dictionary.field.optional')}
                        >
                            <Input
                                maxLength={40}
                                onChange={(event) =>
                                    setOverride(
                                        'transcriptionCustomLabel',
                                        event.currentTarget.value || null,
                                    )
                                }
                                placeholder={
                                    job.originalSnapshot!.effectiveSettings
                                        .transcriptionCustomLabel ?? undefined
                                }
                                value={
                                    candidate.overrides
                                        .transcriptionCustomLabel ?? ''
                                }
                            />
                        </Field>
                    ) : null}
                </div>
            </details>
        </Card>
    );
}

function ValueList({
    dictionary,
    effectiveSettings,
    languages,
    values,
}: {
    dictionary: OwnedDictionary;
    effectiveSettings: NonNullable<
        DictionarySingleCardGenerationJob['originalSnapshot']
    >['effectiveSettings'];
    languages: readonly LanguageCatalogEntry[];
    values: DictionaryCardValues;
}) {
    const { locale, t } = useI18n();
    return (
        <dl className={styles.valueList}>
            {FIELD_KEYS.map((field) => {
                const lang = originalFieldLanguage(
                    field,
                    dictionary,
                    effectiveSettings,
                );
                return (
                    <div key={field}>
                        <dt>
                            {fieldLabel(field, t)} ·{' '}
                            {languageLabel(languages, lang, locale)}
                        </dt>
                        <dd
                            dir={languageDirection(languages, lang)}
                            lang={lang}
                        >
                            {values[field] ??
                                t('dictionary.generation.notProvided')}
                        </dd>
                    </div>
                );
            })}
        </dl>
    );
}

type Translate = ReturnType<typeof useI18n>['t'];

function fieldLabel(field: DictionaryGenerationField, t: Translate): string {
    const keys = {
        definition: 'dictionary.field.definition',
        example: 'dictionary.field.example',
        exampleTranslation: 'dictionary.field.exampleTranslation',
        source: 'dictionary.field.source',
        transcription: 'dictionary.field.transcription',
        translation: 'dictionary.field.translation',
    } as const;
    return t(keys[field]);
}

function terminalStateMessageKey(
    state: DictionarySingleCardGenerationJob['state'],
) {
    const keys = {
        accepted: 'dictionary.generation.state.accepted',
        cancelled: 'dictionary.generation.state.cancelled',
        discarded: 'dictionary.generation.state.discarded',
        expired: 'dictionary.generation.state.expired',
    } as const;
    return keys[state as keyof typeof keys];
}

function overrideLabel(
    field:
        | 'definitionEnabled'
        | 'exampleEnabled'
        | 'exampleTranslationEnabled'
        | 'transcriptionEnabled',
    t: Translate,
): string {
    const keys = {
        definitionEnabled: 'dictionary.field.definition',
        exampleEnabled: 'dictionary.field.example',
        exampleTranslationEnabled: 'dictionary.field.exampleTranslation',
        transcriptionEnabled: 'dictionary.field.transcription',
    } as const;
    return t(keys[field]);
}

function fieldLanguage(
    field: DictionaryGenerationField,
    overrides: DictionaryCardOverrides,
    job: DictionarySingleCardGenerationJob,
) {
    if (field === 'source' || field === 'transcription')
        return job.sourceLanguage;
    if (field === 'translation') return job.targetLanguage;
    const original = job.originalSnapshot!;
    if (field === 'definition') {
        return languageForRole(
            overrides.definitionLanguage ??
                original.effectiveSettings.definitionLanguage,
            job.sourceLanguage,
            job.targetLanguage,
        );
    }
    const exampleRole =
        overrides.exampleLanguage ?? original.effectiveSettings.exampleLanguage;
    return languageForRole(
        field === 'example'
            ? exampleRole
            : exampleRole === 'source'
              ? 'target'
              : 'source',
        job.sourceLanguage,
        job.targetLanguage,
    );
}

function originalFieldLanguage(
    field: DictionaryGenerationField,
    dictionary: OwnedDictionary,
    effectiveSettings: NonNullable<
        DictionarySingleCardGenerationJob['originalSnapshot']
    >['effectiveSettings'],
) {
    if (field === 'source' || field === 'transcription')
        return dictionary.sourceLanguage;
    if (field === 'translation') return dictionary.targetLanguage;
    if (field === 'definition') {
        return languageForRole(
            effectiveSettings.definitionLanguage,
            dictionary.sourceLanguage,
            dictionary.targetLanguage,
        );
    }
    return languageForRole(
        field === 'example'
            ? effectiveSettings.exampleLanguage
            : effectiveSettings.exampleTranslationLanguage,
        dictionary.sourceLanguage,
        dictionary.targetLanguage,
    );
}
