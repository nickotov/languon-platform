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

import { languageDirection } from '@/fsd/entities/dictionary';
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
import { CandidateRow } from './candidate-row';
import {
    candidateForCommit,
    type CandidateDraft,
} from '../../lib/candidate-review';

const ACCEPTED_DOCUMENT_TYPES =
    '.txt,.md,.markdown,.docx,.pdf,.png,.jpg,.jpeg,.webp';

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
        if (!job?.proposal || initializedReviewJobId.current === job.id) {
            return;
        }

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

        if (!file) {
            return;
        }

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
    };

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
                    <div className={styles.inputIntro}>
                        <p
                            className={[
                                styles.eyebrow,
                                styles.inputDescription,
                            ].join(' ')}
                        >
                            {t('dictionary.document.eyebrow')}
                        </p>
                        <h3 className={styles.inputTitle}>
                            {t('dictionary.document.inputTitle')}
                        </h3>
                        <p className={styles.inputDescription}>
                            {t('dictionary.document.inputHelp')}
                        </p>
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
                            className={styles.actionButton}
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
                    <p className={styles.progressDescription}>
                        {t('dictionary.document.persistenceHelp')}
                    </p>
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
                        <div className={styles.reviewIntro}>
                            <h3 className={styles.reviewTitle}>
                                {t('dictionary.document.reviewTitle')}
                            </h3>
                            <p className={styles.reviewDescription}>
                                {t('dictionary.document.reviewHelp')}
                            </p>
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
                            onChange={updateCandidate}
                            onRemove={removeCandidate}
                            onSelectedChange={selectCandidate}
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
                            className={styles.reviewButton}
                            disabled={pendingAction}
                            onClick={() => void run(onDiscard)}
                            type='button'
                            variant='secondary'
                        >
                            {t('dictionary.document.discard')}
                        </Button>
                        <Button
                            className={styles.reviewButton}
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
