'use client';

import type {
    DictionaryImportTarget,
    ImportDictionaryRequest,
    PreviewDictionaryImportRequest,
    PreviewDictionaryImportResponse,
} from '@languon/contracts';
import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react';

import { useI18n } from '@/fsd/shared/i18n';
import type { LanguageCatalogEntry } from '@languon/contracts';
import {
    Button,
    Checkbox,
    Field,
    InlineAlert,
    Input,
    Select,
    Switch,
    Textarea,
} from '@/fsd/shared/ui';

import {
    DictionaryImportFileError,
    readDictionaryImportFile,
} from '../../lib/read-import-file';
import styles from '../styles/dictionary-import-panel-common.module.css';
import { ImportPreviewRows } from './ui/import-preview-rows/import-preview-rows';

export function DictionaryImportPanel({
    aiAvailable,
    error,
    onCommit,
    onPreview,
    optionalFieldsEnabled,
    pending,
    preview,
    sourceLanguage,
    target,
    targetLanguage,
    languages,
    showHeading = true,
}: {
    aiAvailable: boolean;
    error?: string | null;
    onCommit(request: ImportDictionaryRequest): Promise<void>;
    onPreview(request: PreviewDictionaryImportRequest): Promise<void>;
    optionalFieldsEnabled: boolean;
    pending: boolean;
    preview?: PreviewDictionaryImportResponse | null;
    languages: readonly LanguageCatalogEntry[];
    sourceLanguage: string;
    target: DictionaryImportTarget;
    targetLanguage: string;
    showHeading?: boolean;
}) {
    const { t } = useI18n();

    const [content, setContent] = useState('');

    const [delimiter, setDelimiter] = useState<'comma' | 'tab'>('tab');

    const [hasHeader, setHasHeader] = useState(false);

    const [sourceColumnIndex, setSourceColumnIndex] = useState(0);

    const [targetColumnIndex, setTargetColumnIndex] = useState(1);

    const [enrich, setEnrich] = useState(false);

    const [instruction, setInstruction] = useState('');

    const [selected, setSelected] = useState<Set<number>>(new Set());

    const [fileError, setFileError] = useState<string | null>(null);

    const [previewFingerprint, setPreviewFingerprint] = useState<string | null>(
        null,
    );

    const options = {
        delimiter,
        hasHeader,
        sourceColumnIndex,
        targetColumnIndex,
    } as const;

    const request = { content, options, target };

    const requestFingerprint = JSON.stringify(request);

    const visiblePreview =
        previewFingerprint === requestFingerprint ? preview : null;

    useEffect(() => {
        if (!visiblePreview) {
            setSelected(new Set());

            return;
        }

        setSelected(new Set(visiblePreview.rows.map((row) => row.rowIndex)));
    }, [visiblePreview]);

    const canUseAi =
        aiAvailable &&
        optionalFieldsEnabled &&
        Boolean(visiblePreview) &&
        visiblePreview!.rows.length > 0;

    const useAi = enrich && canUseAi;

    const targetReady = target.kind !== 'new' || target.name.trim().length > 0;

    async function loadFile(event: ChangeEvent<HTMLInputElement>) {
        const file = event.currentTarget.files?.[0];

        if (!file) {
            return;
        }

        setFileError(null);

        try {
            setContent(await readDictionaryImportFile(file));

            if (file.name.toLowerCase().endsWith('.csv')) {
                setDelimiter('comma');
            }

            if (file.name.toLowerCase().endsWith('.tsv')) {
                setDelimiter('tab');
            }
        } catch (cause) {
            setFileError(
                cause instanceof DictionaryImportFileError &&
                    cause.reason === 'too_large'
                    ? t('dictionary.interchange.fileTooLarge')
                    : t('dictionary.interchange.fileInvalidUtf8'),
            );
        }
    }

    async function submitPreview(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        try {
            await onPreview(request);

            setPreviewFingerprint(requestFingerprint);
        } catch {
            // The owning mutation renders its localized error state.
        }
    }

    function commit() {
        function resolveEnrichment(): ImportDictionaryRequest['enrichment'] {
            if (useAi) {
                return {
                    instruction: instruction.trim() || null,
                    mode: 'ai',
                    selectedRowIndexes: [...selected].sort((a, b) => a - b),
                };
            }

            return { mode: 'none' };
        }

        const enrichment: ImportDictionaryRequest['enrichment'] =
            resolveEnrichment();

        void onCommit({ ...request, enrichment }).catch(() => undefined);
    }

    function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
        void loadFile(event);
    }

    function changeContent(event: ChangeEvent<HTMLTextAreaElement>) {
        setContent(event.currentTarget.value);
    }

    function changeDelimiter(event: ChangeEvent<HTMLSelectElement>) {
        setDelimiter(event.currentTarget.value as 'comma' | 'tab');
    }

    function changeHeader(event: ChangeEvent<HTMLInputElement>) {
        setHasHeader(event.currentTarget.checked);
    }

    function changeSourceColumn(event: ChangeEvent<HTMLSelectElement>) {
        setSourceColumnIndex(Number(event.currentTarget.value));
    }

    function changeTargetColumn(event: ChangeEvent<HTMLSelectElement>) {
        setTargetColumnIndex(Number(event.currentTarget.value));
    }

    function changeEnrichment(event: ChangeEvent<HTMLInputElement>) {
        setEnrich(event.currentTarget.checked);
    }

    function changeInstruction(event: ChangeEvent<HTMLTextAreaElement>) {
        setInstruction(event.currentTarget.value);
    }

    function togglePreviewRow(rowIndex: number, checked: boolean) {
        setSelected((current) => {
            const next = new Set(current);
            if (checked) {
                next.add(rowIndex);
            } else {
                next.delete(rowIndex);
            }

            return next;
        });
    }

    function resolveAiAvailabilityNotice() {
        if (!aiAvailable) {
            return (
                <p className={styles.paragraph}>
                    {t('dictionary.interchange.aiUnavailable')}
                </p>
            );
        }

        if (!optionalFieldsEnabled) {
            return (
                <p className={styles.paragraph}>
                    {t('dictionary.interchange.aiNoOptionalFields')}
                </p>
            );
        }

        return null;
    }

    const aiAvailabilityNotice = resolveAiAvailabilityNotice();

    return (
        <section className={styles.section}>
            <div className={styles.intro}>
                <p className={[styles.paragraph, styles.eyebrow].join(' ')}>
                    {t('dictionary.interchange.importEyebrow')}
                </p>
                {showHeading ? (
                    <h3 className={styles.heading}>
                        {t('dictionary.interchange.importTitle')}
                    </h3>
                ) : null}
                <p className={styles.paragraph}>
                    {t('dictionary.interchange.importHelp')}
                </p>
            </div>
            {error ? <InlineAlert tone='danger'>{error}</InlineAlert> : null}
            {fileError ? (
                <InlineAlert tone='danger'>{fileError}</InlineAlert>
            ) : null}
            <form className={styles.form} onSubmit={submitPreview}>
                <Field label={t('dictionary.interchange.file')}>
                    <Input
                        className={styles.fileInput}
                        accept='.txt,.csv,.tsv,text/plain,text/csv'
                        disabled={pending}
                        onChange={handleFileChange}
                        type='file'
                    />
                </Field>
                <Field
                    hint={t('dictionary.interchange.contentHelp')}
                    label={t('dictionary.interchange.content')}
                    required
                >
                    <Textarea
                        onChange={changeContent}
                        rows={6}
                        value={content}
                    />
                </Field>
                <div className={styles.mapping}>
                    <Field label={t('dictionary.interchange.delimiter')}>
                        <Select onChange={changeDelimiter} value={delimiter}>
                            <option value='tab'>
                                {t('dictionary.interchange.tab')}
                            </option>
                            <option value='comma'>
                                {t('dictionary.interchange.comma')}
                            </option>
                        </Select>
                    </Field>
                    <Checkbox checked={hasHeader} onChange={changeHeader}>
                        {t('dictionary.interchange.header')}
                    </Checkbox>
                    <Field label={t('dictionary.interchange.sourceColumn')}>
                        <Select
                            onChange={changeSourceColumn}
                            value={sourceColumnIndex}
                        >
                            {(
                                preview?.columns ?? [
                                    { heading: null, index: 0 },
                                    { heading: null, index: 1 },
                                ]
                            ).map((column) => (
                                <option key={column.index} value={column.index}>
                                    {column.heading ||
                                        t('dictionary.interchange.column', {
                                            position: column.index + 1,
                                        })}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label={t('dictionary.interchange.targetColumn')}>
                        <Select
                            onChange={changeTargetColumn}
                            value={targetColumnIndex}
                        >
                            {(
                                preview?.columns ?? [
                                    { heading: null, index: 0 },
                                    { heading: null, index: 1 },
                                ]
                            ).map((column) => (
                                <option key={column.index} value={column.index}>
                                    {column.heading ||
                                        t('dictionary.interchange.column', {
                                            position: column.index + 1,
                                        })}
                                </option>
                            ))}
                        </Select>
                    </Field>
                </div>
                <Button
                    disabled={pending || !content.trim() || !targetReady}
                    type='submit'
                >
                    {t('dictionary.interchange.preview')}
                </Button>
            </form>

            {visiblePreview ? (
                <div className={styles.preview}>
                    <div aria-live='polite' className={styles.previewHeading}>
                        <h4 className={styles.heading}>
                            {t('dictionary.interchange.previewTitle')}
                        </h4>
                        <p className={styles.paragraph}>
                            {t('dictionary.interchange.summary', {
                                failures: visiblePreview.summary.failureRows,
                                ready: visiblePreview.summary.readyRows,
                                total: visiblePreview.summary.totalRows,
                            })}
                        </p>
                    </div>
                    {visiblePreview.summary.truncated ? (
                        <InlineAlert tone='info'>
                            {t('dictionary.interchange.sampleNotice')}
                        </InlineAlert>
                    ) : null}
                    {visiblePreview.warnings.length ? (
                        <InlineAlert tone='warning'>
                            {t('dictionary.interchange.duplicateSummary', {
                                count: visiblePreview.summary.duplicateRows,
                            })}
                        </InlineAlert>
                    ) : null}
                    {visiblePreview.capacity.wouldExceed ? (
                        <InlineAlert tone='warning'>
                            {t('dictionary.interchange.capacityWarning', {
                                count: visiblePreview.capacity.remainingRows,
                            })}
                        </InlineAlert>
                    ) : null}
                    <ImportPreviewRows
                        rows={visiblePreview.rows}
                        canUseAi={canUseAi}
                        selected={selected}
                        onToggle={togglePreviewRow}
                        languages={languages}
                        sourceLanguage={sourceLanguage}
                        targetLanguage={targetLanguage}
                    />
                    {visiblePreview.failures.length ? (
                        <div className={styles.failures}>
                            <h4 className={styles.heading}>
                                {t('dictionary.interchange.failures')}
                            </h4>
                            <ul className={styles.failureList}>
                                {visiblePreview.failures.map((failure) => (
                                    <li
                                        key={`${failure.rowIndex}:${failure.code}`}
                                    >
                                        {t(
                                            'dictionary.interchange.failureRow',
                                            {
                                                message: failure.message,
                                                position: failure.rowIndex + 1,
                                            },
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}
                    <div className={styles.enrichment}>
                        <Switch
                            checked={useAi}
                            disabled={!canUseAi || pending}
                            onChange={changeEnrichment}
                        >
                            {t('dictionary.interchange.enrich')}
                        </Switch>
                        {aiAvailabilityNotice}
                        {canUseAi && visiblePreview.summary.readyRows > 100 ? (
                            <p className={styles.paragraph}>
                                {t('dictionary.interchange.aiLimit')}
                            </p>
                        ) : null}
                    </div>
                    {useAi ? (
                        <Field label={t('dictionary.interchange.instruction')}>
                            <Textarea
                                onChange={changeInstruction}
                                value={instruction}
                            />
                        </Field>
                    ) : null}
                    <Button
                        disabled={
                            pending ||
                            visiblePreview.summary.readyRows === 0 ||
                            (useAi
                                ? selected.size === 0 ||
                                  selected.size >
                                      visiblePreview.capacity.remainingRows
                                : visiblePreview.capacity.wouldExceed)
                        }
                        onClick={commit}
                        type='button'
                    >
                        {useAi
                            ? t('dictionary.interchange.generateSelected', {
                                  count: selected.size,
                              })
                            : t('dictionary.interchange.importReady', {
                                  count: visiblePreview.summary.readyRows,
                              })}
                    </Button>
                </div>
            ) : null}
        </section>
    );
}
