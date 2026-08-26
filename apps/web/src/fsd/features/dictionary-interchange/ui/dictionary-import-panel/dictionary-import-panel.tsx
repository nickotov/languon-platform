'use client';

import type {
    DictionaryImportTarget,
    ImportDictionaryRequest,
    PreviewDictionaryImportRequest,
    PreviewDictionaryImportResponse,
} from '@languon/contracts';
import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react';

import { useI18n } from '@/fsd/shared/i18n';
import { languageDirection } from '@/fsd/entities/dictionary';
import type { LanguageCatalogEntry } from '@languon/contracts';
import {
    Button,
    Card,
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
import styles from './dictionary-import-panel.module.css';

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
        if (!file) return;
        setFileError(null);
        try {
            setContent(await readDictionaryImportFile(file));
            if (file.name.toLowerCase().endsWith('.csv')) setDelimiter('comma');
            if (file.name.toLowerCase().endsWith('.tsv')) setDelimiter('tab');
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
        const enrichment: ImportDictionaryRequest['enrichment'] = useAi
            ? {
                  instruction: instruction.trim() || null,
                  mode: 'ai',
                  selectedRowIndexes: [...selected].sort((a, b) => a - b),
              }
            : { mode: 'none' };
        void onCommit({ ...request, enrichment }).catch(() => undefined);
    }

    return (
        <section className={styles.section}>
            <div>
                <p className={styles.eyebrow}>
                    {t('dictionary.interchange.importEyebrow')}
                </p>
                <h3>{t('dictionary.interchange.importTitle')}</h3>
                <p>{t('dictionary.interchange.importHelp')}</p>
            </div>
            {error ? <InlineAlert tone='danger'>{error}</InlineAlert> : null}
            {fileError ? (
                <InlineAlert tone='danger'>{fileError}</InlineAlert>
            ) : null}
            <form className={styles.form} onSubmit={submitPreview}>
                <Field label={t('dictionary.interchange.file')}>
                    <Input
                        accept='.txt,.csv,.tsv,text/plain,text/csv'
                        onChange={(event) => void loadFile(event)}
                        type='file'
                    />
                </Field>
                <Field
                    hint={t('dictionary.interchange.contentHelp')}
                    label={t('dictionary.interchange.content')}
                    required
                >
                    <Textarea
                        onChange={(event) =>
                            setContent(event.currentTarget.value)
                        }
                        rows={9}
                        value={content}
                    />
                </Field>
                <div className={styles.mapping}>
                    <Field label={t('dictionary.interchange.delimiter')}>
                        <Select
                            onChange={(event) =>
                                setDelimiter(
                                    event.currentTarget.value as
                                        'comma' | 'tab',
                                )
                            }
                            value={delimiter}
                        >
                            <option value='tab'>
                                {t('dictionary.interchange.tab')}
                            </option>
                            <option value='comma'>
                                {t('dictionary.interchange.comma')}
                            </option>
                        </Select>
                    </Field>
                    <Checkbox
                        checked={hasHeader}
                        onChange={(event) =>
                            setHasHeader(event.currentTarget.checked)
                        }
                    >
                        {t('dictionary.interchange.header')}
                    </Checkbox>
                    <Field label={t('dictionary.interchange.sourceColumn')}>
                        <Select
                            onChange={(event) =>
                                setSourceColumnIndex(
                                    Number(event.currentTarget.value),
                                )
                            }
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
                            onChange={(event) =>
                                setTargetColumnIndex(
                                    Number(event.currentTarget.value),
                                )
                            }
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
                    <div aria-live='polite'>
                        <h4>{t('dictionary.interchange.previewTitle')}</h4>
                        <p>
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
                    <div className={styles.rows}>
                        {visiblePreview.rows.map((row) => (
                            <Card className={styles.row} key={row.rowIndex}>
                                {canUseAi ? (
                                    <Checkbox
                                        checked={selected.has(row.rowIndex)}
                                        onChange={(event) => {
                                            const checked =
                                                event.currentTarget.checked;
                                            setSelected((current) => {
                                                const next = new Set(current);
                                                if (checked)
                                                    next.add(row.rowIndex);
                                                else next.delete(row.rowIndex);
                                                return next;
                                            });
                                        }}
                                    >
                                        {t(
                                            'dictionary.interchange.includeRow',
                                            {
                                                position: row.rowIndex + 1,
                                            },
                                        )}
                                    </Checkbox>
                                ) : null}
                                <span
                                    dir={languageDirection(
                                        languages,
                                        sourceLanguage,
                                    )}
                                    lang={sourceLanguage}
                                >
                                    {row.source}
                                </span>
                                <span aria-hidden='true'>→</span>
                                <span
                                    dir={languageDirection(
                                        languages,
                                        targetLanguage,
                                    )}
                                    lang={targetLanguage}
                                >
                                    {row.translation}
                                </span>
                            </Card>
                        ))}
                    </div>
                    {visiblePreview.failures.length ? (
                        <div>
                            <h4>{t('dictionary.interchange.failures')}</h4>
                            <ul>
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
                    <Switch
                        checked={useAi}
                        disabled={!canUseAi || pending}
                        onChange={(event) =>
                            setEnrich(event.currentTarget.checked)
                        }
                    >
                        {t('dictionary.interchange.enrich')}
                    </Switch>
                    {!aiAvailable ? (
                        <p>{t('dictionary.interchange.aiUnavailable')}</p>
                    ) : !optionalFieldsEnabled ? (
                        <p>{t('dictionary.interchange.aiNoOptionalFields')}</p>
                    ) : null}
                    {canUseAi && visiblePreview.summary.readyRows > 100 ? (
                        <p>{t('dictionary.interchange.aiLimit')}</p>
                    ) : null}
                    {useAi ? (
                        <Field label={t('dictionary.interchange.instruction')}>
                            <Textarea
                                onChange={(event) =>
                                    setInstruction(event.currentTarget.value)
                                }
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
