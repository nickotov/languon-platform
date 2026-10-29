'use client';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import * as c from '@languon/contracts';
import { Button, Dialog, InlineAlert, Input } from '@/fsd/shared/ui';
import {
    libraryCopyApi,
    type KnowledgeLibraryContext,
} from '../../api/library-copy-api';
import { useLibraryPublication } from '../../hooks/use-library-publication';
import { LibraryItemPicker, type LibraryItem } from './library-item-picker';
import { type LibraryLabels } from './library-labels';
import styles from './library-copy.module.css';
import { LibraryEntrySelection } from './library-entry-selection';
import { LibraryCopyPreview } from './library-copy-preview';

import type { LibraryContentBlock, PreparedLibraryCopy } from '../../types';

function initialTranslation(block: LibraryContentBlock) {
    if (block.type !== 'bilingual-text') return '';
    const prepared = block.translations[0]?.language;
    if (prepared) return prepared;
    return block.language === 'en' ? 'fr' : 'en';
}
export function LibrarySaveDialog({
    block,
    context,
    labels,
    onClose,
}: {
    block: LibraryContentBlock;
    context: KnowledgeLibraryContext;
    labels: LibraryLabels;
    onClose(): void;
}) {
    const publish = useLibraryPublication();
    const [destination, setDestination] = useState('new');
    const [item, setItem] = useState<LibraryItem | null>(null);
    const [name, setName] = useState(block.title ?? '');
    const [translation, setTranslation] = useState(() =>
        initialTranslation(block),
    );
    const [entries, setEntries] = useState<string[]>(
        block.type === 'vocabulary'
            ? block.entries.map((entry) => entry.id)
            : [],
    );
    const [preview, setPreview] = useState<PreparedLibraryCopy | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [saved, setSaved] = useState(false);
    const kind = block.type === 'vocabulary' ? 'dictionary' : 'text';
    const title =
        kind === 'dictionary' ? labels.saveVocabulary : labels.saveText;
    function changeDestination(event: ChangeEvent<HTMLSelectElement>) {
        setDestination(event.target.value);
    }
    function changeName(event: ChangeEvent<HTMLInputElement>) {
        setName(event.target.value);
    }
    function changeTranslation(event: ChangeEvent<HTMLSelectElement>) {
        setTranslation(event.target.value);
    }
    function toggleEntry(event: ChangeEvent<HTMLInputElement>) {
        const id = event.target.value;
        setEntries((current) =>
            event.target.checked
                ? [...current, id]
                : current.filter((value) => value !== id),
        );
    }
    function invalidate() {
        setPreview(null);
        setSaved(false);
    }
    async function prepare(event: FormEvent) {
        event.preventDefault();
        setBusy(true);
        setError(false);
        setSaved(false);
        try {
            const source = {
                noteId: context.noteId,
                noteVersion: context.noteVersion,
                blockId: block.id,
                operationId: crypto.randomUUID(),
            };
            if (block.type === 'vocabulary') {
                const request = c.CopyKnowledgeVocabularyRequestSchema.parse({
                    ...source,
                    entryIds: entries,
                    destination:
                        destination === 'new'
                            ? {
                                  kind: 'new',
                                  name,
                                  description: null,
                                  sourceLanguage: block.language,
                                  targetLanguage: block.translationLanguage,
                              }
                            : {
                                  kind: 'existing',
                                  dictionaryId: item?.id,
                                  expectedDictionaryVersion: item?.version,
                                  expectedSettingsVersion:
                                      item?.settingsVersion,
                              },
                });
                const content = await libraryCopyApi.previewVocabulary(
                    context,
                    request,
                );
                setPreview({ kind: 'vocabulary', request, content });
            } else {
                const request = c.CopyKnowledgeTextRequestSchema.parse({
                    ...source,
                    translationLanguage: translation,
                    ...(context.privateTranslation
                        ? { privateTranslation: context.privateTranslation }
                        : {}),
                    destination:
                        destination === 'new'
                            ? { kind: 'new', title: name }
                            : {
                                  kind: 'existing',
                                  textId: item?.id,
                                  expectedVersion: item?.version,
                              },
                });
                const content = await libraryCopyApi.previewText(
                    context,
                    request,
                );
                setPreview({ kind: 'text', request, content });
            }
        } catch {
            setError(true);
        } finally {
            setBusy(false);
        }
    }
    async function commit() {
        if (!preview || busy) return;
        setBusy(true);
        setError(false);
        try {
            await publish(context, preview);
            setSaved(true);
            setPreview(null);
            context.onSaved?.();
        } catch {
            setError(true);
        } finally {
            setBusy(false);
        }
    }
    function close() {
        if (!busy) onClose();
    }
    return (
        <Dialog
            open
            dismissible={!busy}
            onClose={close}
            title={title}
            closeLabel={labels.cancel}
            size='large'
        >
            <p>{labels.prepared}</p>
            <form
                className={styles.form}
                onSubmit={prepare}
                onChange={invalidate}
            >
                <fieldset disabled={busy} className={styles.form}>
                    <label>
                        {labels.destination}
                        <select
                            value={destination}
                            onChange={changeDestination}
                        >
                            <option value='new'>{labels.fresh}</option>
                            <option value='existing'>{labels.existing}</option>
                        </select>
                    </label>
                    {destination === 'new' ? (
                        <Input
                            label={labels.name}
                            value={name}
                            onChange={changeName}
                            maxLength={200}
                            required
                        />
                    ) : (
                        <LibraryItemPicker
                            kind={kind}
                            request={context.requestWithSession}
                            labels={labels}
                            onSelect={setItem}
                        />
                    )}
                    {block.type === 'vocabulary' && (
                        <LibraryEntrySelection
                            entries={block.entries}
                            selected={entries}
                            label={labels.selected}
                            onChange={toggleEntry}
                        />
                    )}
                    {block.type === 'bilingual-text' && (
                        <label>
                            {labels.language}
                            <select
                                value={translation}
                                onChange={changeTranslation}
                                disabled={Boolean(context.privateTranslation)}
                            >
                                {c.TextLanguageSchema.options
                                    .filter(
                                        (language) =>
                                            language !== block.language,
                                    )
                                    .map((language) => (
                                        <option key={language} value={language}>
                                            {language}
                                        </option>
                                    ))}
                            </select>
                        </label>
                    )}
                    <Button type='submit' loading={busy}>
                        {labels.preview}
                    </Button>
                </fieldset>
            </form>
            {preview && (
                <LibraryCopyPreview
                    preview={preview}
                    labels={labels}
                    busy={busy}
                    onCommit={commit}
                />
            )}
            {saved && <p role='status'>{labels.saved}</p>}
            {error && <InlineAlert tone='error'>{labels.error}</InlineAlert>}
        </Dialog>
    );
}
