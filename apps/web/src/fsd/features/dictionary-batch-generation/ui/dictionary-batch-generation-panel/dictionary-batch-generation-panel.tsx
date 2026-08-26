'use client';

import type {
    DictionaryGenerationCandidate,
    DictionaryGenerationField,
    DictionaryImportPairsGenerationJob,
    DictionaryImportPairsGenerationProposal,
    DictionaryPastedTermsGenerationJob,
    DictionaryPastedTermsGenerationRowFailure,
    LanguageCatalogEntry,
    OwnedDictionary,
} from '@languon/contracts';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';

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

import styles from './dictionary-batch-generation-panel.module.css';

type CandidateDraft = {
    candidate: DictionaryGenerationCandidate;
    input: string;
    rowIndex: number;
};

type BatchReviewJob =
    DictionaryImportPairsGenerationJob | DictionaryPastedTermsGenerationJob;
type BatchReviewFailure =
    | DictionaryImportPairsGenerationProposal['failures'][number]
    | DictionaryPastedTermsGenerationRowFailure;

const EDITABLE_FIELDS = [
    'source',
    'translation',
    'transcription',
    'definition',
    'example',
    'exampleTranslation',
] as const satisfies readonly DictionaryGenerationField[];

export function DictionaryBatchGenerationPanel({
    available,
    conflict = false,
    dictionary,
    error,
    job,
    languages,
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
    job?: BatchReviewJob;
    languages: readonly LanguageCatalogEntry[];
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
    onRetryFailures(failures: readonly BatchReviewFailure[]): Promise<void>;
    onStart(input: { context?: string; text: string }): Promise<void>;
    pendingAction: boolean;
}) {
    const { t } = useI18n();
    const [text, setText] = useState('');
    const [context, setContext] = useState('');
    const [drafts, setDrafts] = useState<CandidateDraft[]>([]);
    const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
    const [selectedFailures, setSelectedFailures] = useState<Set<number>>(
        new Set(),
    );
    const initializedReviewJobId = useRef<string | null>(null);

    useEffect(() => {
        if (
            job?.state !== 'review' ||
            !job.proposal ||
            initializedReviewJobId.current === job.id
        )
            return;
        initializedReviewJobId.current = job.id;
        setDrafts(
            job.proposal.candidates.map((row) => ({
                candidate: row.candidate,
                input: 'input' in row ? row.input : row.source,
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

    const selectedDrafts = useMemo(
        () => drafts.filter((draft) => selectedRows.has(draft.rowIndex)),
        [drafts, selectedRows],
    );
    const retryableFailures =
        job?.state === 'review' && job.proposal
            ? job.proposal.failures.filter((failure) => failure.retryable)
            : [];
    const selectedRetryFailures = retryableFailures.filter((failure) =>
        selectedFailures.has(failure.rowIndex),
    );

    async function run(action: () => Promise<void>) {
        try {
            await action();
        } catch {
            // The editor-owned mutation keeps the actionable error visible.
        }
    }

    function submitInput(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        void run(() =>
            onStart({
                ...(context.trim() ? { context: context.trim() } : {}),
                text: text.trim(),
            }),
        );
    }

    function updateCandidate(
        rowIndex: number,
        field: DictionaryGenerationField,
        value: string,
    ) {
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
    }

    return (
        <section className={styles.section}>
            {error ? <InlineAlert tone='danger'>{error}</InlineAlert> : null}
            {!available ? (
                <InlineAlert tone='info'>
                    {t('dictionary.batch.error.unavailable')}
                </InlineAlert>
            ) : null}
            {conflict ? (
                <InlineAlert tone='warning'>
                    <strong>{t('dictionary.batch.conflictTitle')}</strong>
                    <p>{t('dictionary.batch.conflictHelp')}</p>
                    <Button
                        disabled={pendingAction}
                        onClick={() => void run(onReloadConflict)}
                        size='small'
                        type='button'
                        variant='secondary'
                    >
                        {t('dictionary.batch.reloadVersions')}
                    </Button>
                </InlineAlert>
            ) : null}

            {!job ? (
                <form className={styles.inputForm} onSubmit={submitInput}>
                    <div>
                        <p className={styles.eyebrow}>
                            {t('dictionary.batch.eyebrow')}
                        </p>
                        <h3>{t('dictionary.batch.inputTitle')}</h3>
                        <p>{t('dictionary.batch.inputHelp')}</p>
                    </div>
                    <Field
                        hint={t('dictionary.batch.termsHelp')}
                        label={t('dictionary.batch.terms')}
                        required
                    >
                        <Textarea
                            dir={languageDirection(
                                languages,
                                dictionary.sourceLanguage,
                            )}
                            disabled={pendingAction}
                            lang={dictionary.sourceLanguage}
                            onChange={(event) =>
                                setText(event.currentTarget.value)
                            }
                            rows={10}
                            value={text}
                        />
                    </Field>
                    <Field
                        hint={t('dictionary.batch.contextHelp')}
                        label={t('dictionary.batch.context')}
                        optionalLabel={t('dictionary.batch.optional')}
                    >
                        <Textarea
                            dir={languageDirection(
                                languages,
                                dictionary.sourceLanguage,
                            )}
                            disabled={pendingAction}
                            lang={dictionary.sourceLanguage}
                            onChange={(event) =>
                                setContext(event.currentTarget.value)
                            }
                            rows={3}
                            value={context}
                        />
                    </Field>
                    <div className={styles.actions}>
                        <Button
                            disabled={!available || text.trim() === ''}
                            loading={pendingAction}
                            type='submit'
                        >
                            {t('dictionary.batch.generate')}
                        </Button>
                    </div>
                </form>
            ) : null}

            {job && (job.state === 'queued' || job.state === 'running') ? (
                <Card className={styles.progressCard}>
                    <strong>
                        {t(`dictionary.generation.stage.${job.progress.stage}`)}
                    </strong>
                    <p>{t('dictionary.batch.persistenceHelp')}</p>
                    <Progress
                        label={t('dictionary.batch.progressLabel')}
                        value={job.progress.percent}
                    />
                    <Button
                        disabled={job.cancellationRequested}
                        loading={pendingAction}
                        onClick={() => void run(onCancel)}
                        type='button'
                        variant='secondary'
                    >
                        {job.cancellationRequested
                            ? t('dictionary.generation.cancelling')
                            : t('dictionary.generation.cancel')}
                    </Button>
                </Card>
            ) : null}

            {job?.state === 'review' && job.proposal ? (
                <div className={styles.review}>
                    <header className={styles.reviewHeader}>
                        <div>
                            <h3>{t('dictionary.batch.reviewTitle')}</h3>
                            <p>
                                {t('dictionary.batch.reviewHelp', {
                                    count: selectedDrafts.length,
                                })}
                            </p>
                        </div>
                        <Badge tone='info'>
                            {t('dictionary.batch.selectedCount', {
                                count: selectedDrafts.length,
                            })}
                        </Badge>
                    </header>

                    {drafts.length ? (
                        <div className={styles.rows}>
                            {drafts.map((draft) => (
                                <CandidateRow
                                    dictionary={dictionary}
                                    draft={draft}
                                    job={job}
                                    key={draft.rowIndex}
                                    languages={languages}
                                    onChange={(field, value) =>
                                        updateCandidate(
                                            draft.rowIndex,
                                            field,
                                            value,
                                        )
                                    }
                                    onRemove={() =>
                                        setDrafts((current) =>
                                            current.filter(
                                                (row) =>
                                                    row.rowIndex !==
                                                    draft.rowIndex,
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
                        </div>
                    ) : (
                        <InlineAlert tone='info'>
                            {t('dictionary.batch.noCandidates')}
                        </InlineAlert>
                    )}

                    {job.proposal.failures.length ? (
                        <section
                            aria-labelledby={`batch-failures-${job.id}`}
                            className={styles.failures}
                        >
                            <h3 id={`batch-failures-${job.id}`}>
                                {t('dictionary.batch.failuresTitle')}
                            </h3>
                            <div className={styles.failureList}>
                                {job.proposal.failures.map((failure) => (
                                    <div
                                        className={styles.failure}
                                        key={failure.rowIndex}
                                    >
                                        {failure.retryable ? (
                                            <Checkbox
                                                aria-label={t(
                                                    'dictionary.batch.retryRow',
                                                    {
                                                        position:
                                                            failure.rowIndex +
                                                            1,
                                                    },
                                                )}
                                                checked={selectedFailures.has(
                                                    failure.rowIndex,
                                                )}
                                                disabled={pendingAction}
                                                onChange={(event) =>
                                                    setSelectedFailures(
                                                        (current) =>
                                                            toggledSet(
                                                                current,
                                                                failure.rowIndex,
                                                                event
                                                                    .currentTarget
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
                                                    lang={
                                                        dictionary.sourceLanguage
                                                    }
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
                                        )}
                                        <span>{failure.message}</span>
                                        {job.proposal?.warnings
                                            .filter(
                                                (warning) =>
                                                    warning.rowIndex ===
                                                    failure.rowIndex,
                                            )
                                            .map((warning) => (
                                                <InlineAlert
                                                    key={warning.code}
                                                    tone='warning'
                                                >
                                                    {warning.message}
                                                </InlineAlert>
                                            ))}
                                    </div>
                                ))}
                            </div>
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
                                    {t('dictionary.batch.retrySelected')}
                                </Button>
                            ) : null}
                        </section>
                    ) : null}

                    <div className={styles.reviewActions}>
                        <Button
                            disabled={pendingAction}
                            onClick={() => void run(onDiscard)}
                            type='button'
                            variant='danger'
                        >
                            {t('dictionary.batch.discard')}
                        </Button>
                        <Button
                            disabled={
                                conflict ||
                                selectedDrafts.length === 0 ||
                                selectedDrafts.some(
                                    (draft) =>
                                        draft.candidate.values.source.trim() ===
                                            '' ||
                                        draft.candidate.values.translation.trim() ===
                                            '',
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
                            {t('dictionary.batch.commit', {
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
                    {t(batchTerminalMessageKey(job.state))}
                </InlineAlert>
            ) : null}

            {job?.state === 'accepted'
                ? job.outcome?.warnings.map((warning) => (
                      <InlineAlert
                          key={`${warning.rowIndex}:${warning.code}`}
                          tone='warning'
                      >
                          {warning.message}
                      </InlineAlert>
                  ))
                : null}

            {job?.state === 'failed' ? (
                <InlineAlert tone='danger'>
                    <strong>{t('dictionary.batch.state.failed')}</strong>
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
                    {t('dictionary.batch.close')}
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
    job: BatchReviewJob;
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
                    {t('dictionary.batch.includeRow', {
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
                    {t('dictionary.batch.removeRow')}
                </Button>
            </header>
            <p className={styles.inputTerm}>
                {t('dictionary.batch.inputTerm')}{' '}
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
                    return (
                        <Field
                            key={field}
                            label={t(`dictionary.field.${field}`)}
                            required={
                                field === 'source' || field === 'translation'
                            }
                        >
                            {field === 'definition' ||
                            field === 'example' ||
                            field === 'exampleTranslation' ? (
                                <Textarea
                                    dir={languageDirection(languages, language)}
                                    disabled={pending || !selected}
                                    lang={language}
                                    onChange={(event) =>
                                        onChange(
                                            field,
                                            event.currentTarget.value,
                                        )
                                    }
                                    rows={2}
                                    value={value}
                                />
                            ) : (
                                <Input
                                    dir={languageDirection(languages, language)}
                                    disabled={pending || !selected}
                                    lang={language}
                                    onChange={(event) =>
                                        onChange(
                                            field,
                                            event.currentTarget.value,
                                        )
                                    }
                                    value={value}
                                />
                            )}
                        </Field>
                    );
                })}
            </div>
            {proposalRow?.fieldFeedback.length ? (
                <details className={styles.feedback}>
                    <summary>{t('dictionary.batch.feedback')}</summary>
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
    if (field === 'translation') {
        return dictionary.targetLanguage;
    }
    if (field === 'definition') {
        return languageForRole(
            candidate.overrides.definitionLanguage ??
                dictionary.settings.values.definitionLanguage,
            dictionary.sourceLanguage,
            dictionary.targetLanguage,
        );
    }
    if (field === 'example') {
        return languageForRole(
            candidate.overrides.exampleLanguage ??
                dictionary.settings.values.exampleLanguage,
            dictionary.sourceLanguage,
            dictionary.targetLanguage,
        );
    }
    if (field === 'exampleTranslation') {
        const exampleRole =
            candidate.overrides.exampleLanguage ??
            dictionary.settings.values.exampleLanguage;
        return languageForRole(
            exampleRole === 'source' ? 'target' : 'source',
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
    if (field === 'transcription') {
        return overrides.transcriptionEnabled ?? settings.transcriptionEnabled;
    }
    if (field === 'definition') {
        return overrides.definitionEnabled ?? settings.definitionEnabled;
    }
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

function batchTerminalMessageKey(state: BatchReviewJob['state']) {
    switch (state) {
        case 'accepted':
            return 'dictionary.batch.state.accepted';
        case 'cancelled':
            return 'dictionary.batch.state.cancelled';
        case 'discarded':
            return 'dictionary.batch.state.discarded';
        case 'expired':
            return 'dictionary.batch.state.expired';
        default:
            return 'dictionary.batch.state.failed';
    }
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
