'use client';

import type {
    DictionaryGenerationCandidate,
    DictionaryGenerationField,
    LanguageCatalogEntry,
    OwnedDictionary,
} from '@languon/contracts';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import { languageDirection } from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Badge,
    Button,
    Card,
    Checkbox,
    DialogActions,
    Field,
    InlineAlert,
    Progress,
    Textarea,
} from '@/fsd/shared/ui';

import styles from './dictionary-batch-generation-panel.module.css';
import { CandidateRow } from './candidate-row';
import {
    candidateForCommit,
    type CandidateDraft,
    type BatchReviewJob,
    type BatchReviewFailure,
} from '../../lib/candidate-review';

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
        ) {
            return;
        }

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

    function resolveRetryableFailures() {
        if (job?.state === 'review' && job.proposal) {
            return job.proposal.failures.filter((failure) => failure.retryable);
        }

        return [];
    }

    const retryableFailures = resolveRetryableFailures();

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
        function resolveValues() {
            if (field === 'source' || field === 'translation') {
                return value;
            }

            if (value.trim()) {
                return value;
            }

            return null;
        }

        setDrafts((current) =>
            current.map((draft) => {
                if (draft.rowIndex === rowIndex) {
                    return {
                        ...draft,
                        candidate: {
                            ...draft.candidate,
                            values: {
                                ...draft.candidate.values,
                                [field]: resolveValues(),
                            },
                        },
                    };
                }

                return draft;
            }),
        );
    }

    function removeCandidate(rowIndex: number) {
        setDrafts((current) =>
            current.filter((row) => row.rowIndex !== rowIndex),
        );
    }

    function selectCandidate(rowIndex: number, selected: boolean) {
        setSelectedRows((current) => toggledSet(current, rowIndex, selected));
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
                    <div className={styles.inputIntro}>
                        <p
                            className={[
                                styles.eyebrow,
                                styles.inputDescription,
                            ].join(' ')}
                        >
                            {t('dictionary.batch.eyebrow')}
                        </p>
                        <h3 className={styles.inputTitle}>
                            {t('dictionary.batch.inputTitle')}
                        </h3>
                        <p className={styles.inputDescription}>
                            {t('dictionary.batch.inputHelp')}
                        </p>
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
                            className={styles.actionButton}
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
                    <p className={styles.progressDescription}>
                        {t('dictionary.batch.persistenceHelp')}
                    </p>
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
                        <div className={styles.reviewIntro}>
                            <h3 className={styles.reviewTitle}>
                                {t('dictionary.batch.reviewTitle')}
                            </h3>
                            <p className={styles.reviewDescription}>
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
                                    onChange={updateCandidate}
                                    onRemove={removeCandidate}
                                    onSelectedChange={selectCandidate}
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
                            <h3
                                className={styles.failuresTitle}
                                id={`batch-failures-${job.id}`}
                            >
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
                                                className={styles.failureInput}
                                                dir={languageDirection(
                                                    languages,
                                                    dictionary.sourceLanguage,
                                                )}
                                                lang={dictionary.sourceLanguage}
                                            >
                                                {failure.input}
                                            </strong>
                                        )}
                                        <span className={styles.failureMessage}>
                                            {failure.message}
                                        </span>
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

                    <DialogActions
                        align='between'
                        className={styles.reviewActions}
                    >
                        <Button
                            className={styles.reviewButton}
                            disabled={pendingAction}
                            onClick={() => void run(onDiscard)}
                            type='button'
                            variant='danger'
                        >
                            {t('dictionary.batch.discard')}
                        </Button>
                        <Button
                            className={styles.reviewButton}
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
                    </DialogActions>
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

    if (included) {
        next.add(value);
    } else {
        next.delete(value);
    }

    return next;
}
