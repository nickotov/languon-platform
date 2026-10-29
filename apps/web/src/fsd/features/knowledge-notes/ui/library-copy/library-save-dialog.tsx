'use client';
import { useId, useState, type ChangeEvent, type FormEvent } from 'react';
import * as c from '@languon/contracts';
import { KnowledgeApiError } from '@/fsd/entities/knowledge';
import { resolveLibraryCopySource } from '../../lib/library-copy-source';
import { InlineAlert } from '@/fsd/shared/ui';
import {
    libraryCopyApi,
    type KnowledgeLibraryContext,
} from '../../api/library-copy-api';
import { useLibraryPublication } from '../../hooks/use-library-publication';
import type { LibraryItem } from './library-item-picker';
import { type LibraryLabels } from './library-labels';
import styles from './library-copy.module.css';
import { LibraryCopyPreview } from './library-copy-preview';
import { LibrarySaveFooter } from './library-save-footer';
import {
    LibrarySaveFields,
    type LibrarySaveFieldsProps,
} from './library-save-fields';
import { useI18n } from '@/fsd/shared/i18n';
import { BlockEditorPanel } from '../learning-block-authoring/block-editor-panel';
import { localizedBlockLabels } from '../learning-block-authoring/block-locales';

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
    const { locale } = useI18n();
    const editorLabels = localizedBlockLabels(locale);
    const formId = useId();
    const publish = useLibraryPublication();
    const [destination, setDestination] = useState('new');
    const [item, setItem] = useState<LibraryItem | null>(null);
    const [name, setName] = useState(block.title ?? '');
    const [translation, setTranslation] = useState(
        () => context.translationLanguage ?? initialTranslation(block),
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
    function changeDestination(event: ChangeEvent<HTMLInputElement>) {
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
                ...(await resolveLibraryCopySource(context)),
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
        } catch (caught) {
            setError(true);
            if (
                caught instanceof KnowledgeApiError &&
                (caught.detail.code === 'version_conflict' ||
                    caught.detail.code === 'idempotency_conflict')
            )
                setPreview(null);
        } finally {
            setBusy(false);
        }
    }
    function close() {
        if (!busy) onClose();
    }
    const previewDisabled =
        busy ||
        (destination === 'new' ? !name.trim() : !item) ||
        (block.type === 'vocabulary' && entries.length === 0);
    const footer = (
        <LibrarySaveFooter
            labels={labels}
            busy={busy}
            saved={saved}
            previewReady={preview !== null}
            previewDisabled={previewDisabled}
            formId={formId}
            onClose={close}
            onCommit={commit}
        />
    );
    const fields: LibrarySaveFieldsProps = {
        block,
        context,
        labels,
        busy,
        destination,
        name,
        translation,
        entries,
        kind,
        onDestination: changeDestination,
        onName: changeName,
        onTranslation: changeTranslation,
        onToggleEntry: toggleEntry,
        onSelectItem: setItem,
    };
    return (
        <BlockEditorPanel
            kind={block.type}
            title={title}
            subtitle={block.title ?? ''}
            labels={editorLabels}
            dismissible={!busy}
            onClose={close}
            footer={footer}
        >
            <form
                id={formId}
                className={styles.form}
                onSubmit={prepare}
                onChange={invalidate}
            >
                <LibrarySaveFields {...fields} />
            </form>
            {preview && (
                <LibraryCopyPreview
                    preview={preview}
                    labels={labels}
                    busy={busy}
                    onCommit={commit}
                    hideCommit
                />
            )}
            {saved && <p role='status'>{labels.saved}</p>}
            {error && <InlineAlert tone='error'>{labels.error}</InlineAlert>}
        </BlockEditorPanel>
    );
}
