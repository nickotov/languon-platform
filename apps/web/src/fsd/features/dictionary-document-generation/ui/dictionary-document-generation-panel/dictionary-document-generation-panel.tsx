'use client';

import type {
    DictionaryDocumentTermsGenerationJob,
    DictionaryGenerationCandidate,
    DictionaryGenerationField,
    DictionaryPastedTermsGenerationRowFailure,
    LanguageCatalogEntry,
    OwnedDictionary,
} from '@languon/contracts';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { languageDirection, languageForRole } from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Badge,
    Button,
    Card,
    Checkbox,
    Field,
    InlineAlert,
    Input,
    Progress,
    Textarea,
} from '@/fsd/shared/ui';

import styles from './dictionary-document-generation-panel.module.css';

const ACCEPTED_DOCUMENT_TYPES =
    '.txt,.md,.markdown,.docx,.pdf,.png,.jpg,.jpeg,.webp';
const EDITABLE_FIELDS = [
    'source',
    'translation',
    'transcription',
    'definition',
    'example',
    'exampleTranslation',
] satisfies readonly DictionaryGenerationField[];

type CandidateDraft = {
    candidate: DictionaryGenerationCandidate;
    input: string;
    rowIndex: number;
};

export function DictionaryDocumentGenerationPanel({
    available,
    conflict = false,
    dictionary,
    error,
    job,
    languages,
    nativeExtractionAvailable,
    ocrAvailable,
    onAccept,
    onCancel,
    onClose,
    onDiscard,
    onReloadConflict,
    onRetryFailures,
    onStart,
    pendingAction,
}: {
    available: boolean;
    conflict?: boolean;
    dictionary: OwnedDictionary;
    error?: string | null;
    job?: DictionaryDocumentTermsGenerationJob;
    languages: readonly LanguageCatalogEntry[];
    nativeExtractionAvailable: boolean;
    ocrAvailable: boolean;
    onAccept(
        selected: readonly {
            candidate: DictionaryGenerationCandidate;
            rowIndex: number;
        }[],
    ): Promise<void>;
    onCancel(): Promise<void>;
    onClose(): void;
    onDiscard(): Promise<void>;
    onReloadConflict(): Promise<void>;
    onRetryFailures(
        failures: readonly DictionaryPastedTermsGenerationRowFailure[],
    ): Promise<void>;
    onStart(input: { file: File; instruction?: string }): Promise<void>;
    pendingAction: boolean;
}) {
    const { t } = useI18n();
    const [file, setFile] = useState<File | null>(null);
    const [instruction, setInstruction] = useState('');
    const [drafts, setDrafts] = useState<CandidateDraft[]>([]);
    const [selectedRows, setSelectedRows] = useState<ReadonlySet<number>>(
        new Set(),
    );
    const [selectedFailures, setSelectedFailures] = useState<
        ReadonlySet<number>
    >(new Set());
    const initializedReviewJobId = useRef<string | null>(null);

    useEffect(() => {
        if (!job?.proposal || initializedReviewJobId.current === job.id) return;
        initializedReviewJobId.current = job.id;
        setDrafts(
            job.proposal.candidates.map((row) => ({
                candidate: row.candidate,
                input: row.input,
                rowIndex: row.rowIndex,
            })),
        );
        setSelectedRows(
            new Set(job.proposal.candidates.map((row) => row.rowIndex)),
        );
        setSelectedFailures(
            new Set(
                job.proposal.failures
                    .filter((failure) => failure.retryable)
                    .map((failure) => failure.rowIndex),
            ),
        );
    }, [job]);

    const selectedDrafts = drafts.filter((draft) =>
        selectedRows.has(draft.rowIndex),
    );
    const retryableFailures =
        job?.proposal?.failures.filter((failure) => failure.retryable) ?? [];
    const selectedRetryFailures = retryableFailures.filter((failure) =>
        selectedFailures.has(failure.rowIndex),
    );
    const run = async (action: () => Promise<void>) => {
        try {
            await action();
        } catch {
            // The owning composition exposes the localized persistent error.
        }
    };
    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!file) return;
        void run(() =>
            onStart({
                file,
                ...(instruction.trim()
                    ? { instruction: instruction.trim() }
                    : {}),
            }),
        );
    };
    const updateCandidate = (
        rowIndex: number,
        field: DictionaryGenerationField,
        value: string,
    ) => {
        setDrafts((current) =>
            current.map((draft) =>
                draft.rowIndex === rowIndex
                    ? {
                          ...draft,
                          candidate: {
                              ...draft.candidate,
                              values: {
                                  ...draft.candidate.values,
                                  [field]:
                                      field === 'source' ||
                                      field === 'translation'
                                          ? value
                                          : value.trim()
                                            ? value
                                            : null,
                              },
                          },
                      }
                    : draft,
            ),
        );
    };

    return (
        <section className={styles.section}>
            {error ? <InlineAlert tone='danger'>{error}</InlineAlert> : null}
            {!available ? (
                <InlineAlert tone='info'>
                    {t('dictionary.document.unavailable')}
                </InlineAlert>
            ) : null}
            {conflict ? (
                <InlineAlert tone='warning'>
                    <strong>{t('dictionary.document.conflictTitle')}</strong>
                    <p>{t('dictionary.document.conflictHelp')}</p>
                    <Button
                        disabled={pendingAction}
                        onClick={() => void run(onReloadConflict)}
                        size='small'
                        type='button'
                        variant='secondary'
                    >
                        {t('dictionary.document.reloadVersions')}
                    </Button>
                </InlineAlert>
            ) : null}

            {!job ? (
                <form className={styles.inputForm} onSubmit={submit}>
                    <div>
                        <p className={styles.eyebrow}>
                            {t('dictionary.document.eyebrow')}
                        </p>
                        <h3>{t('dictionary.document.inputTitle')}</h3>
                        <p>{t('dictionary.document.inputHelp')}</p>
                    </div>
                    <Field
                        hint={t('dictionary.document.fileHelp')}
                        label={t('dictionary.document.file')}
                        required
                    >
                        <Input
                            accept={ACCEPTED_DOCUMENT_TYPES}
                            disabled={pendingAction || !available}
                            onChange={(event) =>
                                setFile(event.currentTarget.files?.[0] ?? null)
                            }
                            type='file'
                        />
                    </Field>
                    <Field
                        hint={t('dictionary.document.instructionHelp')}
                        label={t('dictionary.document.instruction')}
                        optionalLabel={t('dictionary.document.optional')}
                    >
                        <Textarea
                            dir={languageDirection(
                                languages,
                                dictionary.sourceLanguage,
                            )}
                            disabled={pendingAction || !available}
                            lang={dictionary.sourceLanguage}
                            maxLength={1_000}
                            onChange={(event) =>
                                setInstruction(event.currentTarget.value)
                            }
                            rows={3}
                            value={instruction}
                        />
                    </Field>
                    <InlineAlert tone={ocrAvailable ? 'info' : 'warning'}>
                        {nativeExtractionAvailable
                            ? t('dictionary.document.nativeAvailable')
                            : t('dictionary.document.nativeUnavailable')}{' '}
                        {ocrAvailable
                            ? t('dictionary.document.ocrAvailable')
                            : t('dictionary.document.ocrUnavailable')}
                    </InlineAlert>
                    <div className={styles.actions}>
                        <Button
                            disabled={!file || pendingAction || !available}
                            loading={pendingAction}
                            type='submit'
                        >
                            {t('dictionary.document.start')}
                        </Button>
                    </div>
                </form>
            ) : null}

            {job &&
            ['awaiting-upload', 'queued', 'running'].includes(job.state) ? (
                <Card className={styles.progressCard}>
                    <strong>
                        {t(`dictionary.document.stage.${job.progress.stage}`)}
                    </strong>
                    <p>{t('dictionary.document.persistenceHelp')}</p>
                    <Progress
                        label={t('dictionary.document.progressLabel')}
                        value={job.progress.percent}
                    />
                    <Button
                        disabled={job.cancellationRequested || pendingAction}
                        loading={pendingAction}
                        onClick={() => void run(onCancel)}
                        type='button'
                        variant='secondary'
                    >
                        {job.cancellationRequested
                            ? t('dictionary.document.cancelling')
                            : t('dictionary.document.cancel')}
                    </Button>
                </Card>
            ) : null}

            {job?.state === 'review' && job.proposal ? (
                <div className={styles.review}>
                    <header className={styles.reviewHeader}>
                        <div>
                            <h3>{t('dictionary.document.reviewTitle')}</h3>
                            <p>{t('dictionary.document.reviewHelp')}</p>
                        </div>
                        <Badge tone='info'>
                            {t('dictionary.document.selectedCount', {
                                count: selectedDrafts.length,
                            })}
                        </Badge>
                    </header>
                    {drafts.map((draft) => (
                        <CandidateRow
                            dictionary={dictionary}
                            draft={draft}
                            job={job}
                            key={draft.rowIndex}
                            languages={languages}
                            onChange={(field, value) =>
                                updateCandidate(draft.rowIndex, field, value)
                            }
                            onRemove={() =>
                                setDrafts((current) =>
                                    current.filter(
                                        (row) =>
                                            row.rowIndex !== draft.rowIndex,
                                    ),
                                )
                            }
                            onSelectedChange={(selected) =>
                                setSelectedRows((current) =>
                                    toggledSet(
                                        current,
                                        draft.rowIndex,
                                        selected,
                                    ),
                                )
                            }
                            pending={pendingAction}
                            selected={selectedRows.has(draft.rowIndex)}
                        />
                    ))}
                    {job.proposal.failures.length ? (
                        <section className={styles.failures}>
                            <h3>{t('dictionary.document.failuresTitle')}</h3>
                            {job.proposal.failures.map((failure) => (
                                <InlineAlert
                                    key={failure.rowIndex}
                                    tone='warning'
                                >
                                    {failure.retryable ? (
                                        <Checkbox
                                            aria-label={t(
                                                'dictionary.document.retryRow',
                                                {
                                                    position:
                                                        failure.rowIndex + 1,
                                                },
                                            )}
                                            checked={selectedFailures.has(
                                                failure.rowIndex,
                                            )}
                                            disabled={pendingAction}
                                            onChange={(event) =>
                                                setSelectedFailures((current) =>
                                                    toggledSet(
                                                        current,
                                                        failure.rowIndex,
                                                        event.currentTarget
                                                            .checked,
                                                    ),
                                                )
                                            }
                                        >
                                            <span
                                                dir={languageDirection(
                                                    languages,
                                                    dictionary.sourceLanguage,
                                                )}
                                                lang={dictionary.sourceLanguage}
                                            >
                                                {failure.input}
                                            </span>
                                        </Checkbox>
                                    ) : (
                                        <strong
                                            dir={languageDirection(
                                                languages,
                                                dictionary.sourceLanguage,
                                            )}
                                            lang={dictionary.sourceLanguage}
                                        >
                                            {failure.input}
                                        </strong>
                                    )}{' '}
                                    {failure.message}
                                </InlineAlert>
                            ))}
                            {retryableFailures.length ? (
                                <Button
                                    disabled={
                                        !available ||
                                        !selectedRetryFailures.length
                                    }
                                    loading={pendingAction}
                                    onClick={() =>
                                        void run(() =>
                                            onRetryFailures(
                                                selectedRetryFailures,
                                            ),
                                        )
                                    }
                                    type='button'
                                    variant='secondary'
                                >
                                    {t('dictionary.document.retrySelected')}
                                </Button>
                            ) : null}
                        </section>
                    ) : null}
                    <div className={styles.reviewActions}>
                        <Button
                            disabled={pendingAction}
                            onClick={() => void run(onDiscard)}
                            type='button'
                            variant='secondary'
                        >
                            {t('dictionary.document.discard')}
                        </Button>
                        <Button
                            disabled={
                                pendingAction ||
                                selectedDrafts.length === 0 ||
                                selectedDrafts.some(
                                    (draft) =>
                                        !draft.candidate.values.source.trim() ||
                                        !draft.candidate.values.translation.trim(),
                                )
                            }
                            loading={pendingAction}
                            onClick={() =>
                                void run(() =>
                                    onAccept(
                                        selectedDrafts.map((draft) => ({
                                            candidate: candidateForCommit(
                                                dictionary,
                                                draft.candidate,
                                            ),
                                            rowIndex: draft.rowIndex,
                                        })),
                                    ),
                                )
                            }
                            type='button'
                        >
                            {t('dictionary.document.commit', {
                                count: selectedDrafts.length,
                            })}
                        </Button>
                    </div>
                </div>
            ) : null}

            {job &&
            ['accepted', 'discarded', 'cancelled', 'expired'].includes(
                job.state,
            ) ? (
                <InlineAlert
                    tone={job.state === 'accepted' ? 'success' : 'info'}
                >
                    {t(documentTerminalMessageKey(job.state))}
                </InlineAlert>
            ) : null}
            {job?.state === 'failed' ? (
                <InlineAlert tone='danger'>
                    <strong>{t('dictionary.document.state.failed')}</strong>
                    <p>{job.failure?.message}</p>
                </InlineAlert>
            ) : null}
            <div className={styles.closeActions}>
                <Button
                    disabled={pendingAction}
                    onClick={onClose}
                    type='button'
                    variant='quiet'
                >
                    {t('dictionary.document.close')}
                </Button>
            </div>
        </section>
    );
}

function CandidateRow({
    dictionary,
    draft,
    job,
    languages,
    onChange,
    onRemove,
    onSelectedChange,
    pending,
    selected,
}: {
    dictionary: OwnedDictionary;
    draft: CandidateDraft;
    job: DictionaryDocumentTermsGenerationJob;
    languages: readonly LanguageCatalogEntry[];
    onChange(field: DictionaryGenerationField, value: string): void;
    onRemove(): void;
    onSelectedChange(selected: boolean): void;
    pending: boolean;
    selected: boolean;
}) {
    const { t } = useI18n();
    const proposalRow = job.proposal?.candidates.find(
        (row) => row.rowIndex === draft.rowIndex,
    );
    const warnings = job.proposal?.warnings.filter(
        (warning) => warning.rowIndex === draft.rowIndex,
    );

    return (
        <Card className={styles.row}>
            <header className={styles.rowHeader}>
                <Checkbox
                    checked={selected}
                    disabled={pending}
                    onChange={(event) =>
                        onSelectedChange(event.currentTarget.checked)
                    }
                >
                    {t('dictionary.document.includeRow', {
                        position: draft.rowIndex + 1,
                    })}
                </Checkbox>
                <Button
                    disabled={pending}
                    onClick={onRemove}
                    size='small'
                    type='button'
                    variant='quiet'
                >
                    {t('dictionary.document.removeRow')}
                </Button>
            </header>
            <p className={styles.inputTerm}>
                {t('dictionary.document.extractedTerm')}{' '}
                <span
                    dir={languageDirection(
                        languages,
                        dictionary.sourceLanguage,
                    )}
                    lang={dictionary.sourceLanguage}
                >
                    {draft.input}
                </span>
            </p>
            {warnings?.map((warning) => (
                <InlineAlert key={warning.code} tone='warning'>
                    {warning.message}
                </InlineAlert>
            ))}
            <div className={styles.fields}>
                {EDITABLE_FIELDS.filter((field) =>
                    fieldEnabled(field, dictionary, draft.candidate),
                ).map((field) => {
                    const language = fieldLanguage(
                        field,
                        dictionary,
                        draft.candidate,
                    );
                    const value = draft.candidate.values[field] ?? '';
                    const Control = [
                        'definition',
                        'example',
                        'exampleTranslation',
                    ].includes(field)
                        ? Textarea
                        : Input;
                    return (
                        <Field
                            key={field}
                            label={t(`dictionary.field.${field}`)}
                            required={
                                field === 'source' || field === 'translation'
                            }
                        >
                            <Control
                                dir={languageDirection(languages, language)}
                                disabled={pending || !selected}
                                lang={language}
                                onChange={(event) =>
                                    onChange(field, event.currentTarget.value)
                                }
                                value={value}
                            />
                        </Field>
                    );
                })}
            </div>
            {proposalRow?.fieldFeedback.length ? (
                <details className={styles.feedback}>
                    <summary>{t('dictionary.document.feedback')}</summary>
                    <ul>
                        {proposalRow.fieldFeedback.map((feedback) => (
                            <li key={feedback.field}>
                                <strong>
                                    {t(`dictionary.field.${feedback.field}`)}:
                                </strong>{' '}
                                {feedback.reason}
                            </li>
                        ))}
                    </ul>
                </details>
            ) : null}
        </Card>
    );
}

function fieldLanguage(
    field: DictionaryGenerationField,
    dictionary: OwnedDictionary,
    candidate: DictionaryGenerationCandidate,
) {
    if (field === 'translation') return dictionary.targetLanguage;
    if (field === 'definition') {
        return languageForRole(
            candidate.overrides.definitionLanguage ??
                dictionary.settings.values.definitionLanguage,
            dictionary.sourceLanguage,
            dictionary.targetLanguage,
        );
    }
    if (field === 'example' || field === 'exampleTranslation') {
        const exampleRole =
            candidate.overrides.exampleLanguage ??
            dictionary.settings.values.exampleLanguage;
        return languageForRole(
            field === 'example'
                ? exampleRole
                : exampleRole === 'source'
                  ? 'target'
                  : 'source',
            dictionary.sourceLanguage,
            dictionary.targetLanguage,
        );
    }
    return dictionary.sourceLanguage;
}

function fieldEnabled(
    field: DictionaryGenerationField,
    dictionary: OwnedDictionary,
    candidate: DictionaryGenerationCandidate,
) {
    const settings = dictionary.settings.values;
    const overrides = candidate.overrides;
    if (field === 'source' || field === 'translation') return true;
    if (field === 'transcription')
        return overrides.transcriptionEnabled ?? settings.transcriptionEnabled;
    if (field === 'definition')
        return overrides.definitionEnabled ?? settings.definitionEnabled;
    const exampleEnabled = overrides.exampleEnabled ?? settings.exampleEnabled;
    if (field === 'example') return exampleEnabled;
    return (
        exampleEnabled &&
        (overrides.exampleTranslationEnabled ??
            settings.exampleTranslationEnabled)
    );
}

function candidateForCommit(
    dictionary: OwnedDictionary,
    candidate: DictionaryGenerationCandidate,
): DictionaryGenerationCandidate {
    return {
        ...candidate,
        values: {
            ...candidate.values,
            transcription: fieldEnabled('transcription', dictionary, candidate)
                ? candidate.values.transcription
                : null,
            definition: fieldEnabled('definition', dictionary, candidate)
                ? candidate.values.definition
                : null,
            example: fieldEnabled('example', dictionary, candidate)
                ? candidate.values.example
                : null,
            exampleTranslation: fieldEnabled(
                'exampleTranslation',
                dictionary,
                candidate,
            )
                ? candidate.values.exampleTranslation
                : null,
        },
    };
}

function toggledSet(
    current: ReadonlySet<number>,
    value: number,
    included: boolean,
) {
    const next = new Set(current);
    if (included) next.add(value);
    else next.delete(value);
    return next;
}

function documentTerminalMessageKey(
    state: DictionaryDocumentTermsGenerationJob['state'],
) {
    switch (state) {
        case 'accepted':
            return 'dictionary.document.state.accepted';
        case 'cancelled':
            return 'dictionary.document.state.cancelled';
        case 'discarded':
            return 'dictionary.document.state.discarded';
        case 'expired':
            return 'dictionary.document.state.expired';
        default:
            return 'dictionary.document.state.failed';
    }
}
