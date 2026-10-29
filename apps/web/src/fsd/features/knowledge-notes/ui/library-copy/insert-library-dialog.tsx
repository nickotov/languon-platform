'use client';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type {
    DictionaryCard,
    DictionarySummary,
    LearningBlock,
} from '@languon/contracts';
import { dictionaryApi } from '@/fsd/entities/dictionary';
import { textsApi } from '@/fsd/entities/texts';
import { LearningBlockView } from '@/fsd/entities/learning-blocks';
import { Button, Dialog, InlineAlert } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import type { KnowledgeLibraryContext } from '../../api/library-copy-api';
import {
    vocabularyLibraryBlock,
    textLibraryBlock,
} from '../../lib/library-block-content';
import { LibraryItemPicker, type LibraryItem } from './library-item-picker';
import { type LibraryLabels } from './library-labels';
import { localizedBlockLabels } from '../learning-block-authoring/block-locales';
import styles from './library-copy.module.css';

export function InsertDialog({
    context,
    labels,
    onClose,
    onInsert,
    disabled,
}: {
    context: KnowledgeLibraryContext;
    labels: LibraryLabels;
    onClose(): void;
    onInsert(block: LearningBlock): boolean;
    disabled: boolean;
}) {
    const { locale } = useI18n();
    const viewLabels = localizedBlockLabels(locale).view;
    const generation = useRef(0);
    const [kind, setKind] = useState<'dictionary' | 'text'>('dictionary');
    const [item, setItem] = useState<LibraryItem | null>(null);
    const [cards, setCards] = useState<DictionaryCard[]>([]);
    const [dictionary, setDictionary] = useState<DictionarySummary | null>(
        null,
    );
    const [selected, setSelected] = useState<string[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [preview, setPreview] = useState<LearningBlock | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        generation.current += 1;
        setCards([]);
        setPreview(null);
        setSelected([]);
        setError(false);
        setCursor(null);
        setBusy(false);
        if (!item || kind !== 'dictionary') return;
        setBusy(true);
        void Promise.all([
            context.requestWithSession((token) =>
                dictionaryApi.readDictionary(token, item.id, controller.signal),
            ),
            context.requestWithSession((token) =>
                dictionaryApi.listCards(
                    token,
                    item.id,
                    { limit: 100 },
                    controller.signal,
                ),
            ),
        ])
            .then(([owner, result]) => {
                if (controller.signal.aborted) return;
                if (
                    owner.dictionary.version !== result.dictionaryVersion ||
                    owner.dictionary.settings.version !== result.settingsVersion
                )
                    throw new Error('Dictionary changed.');
                setDictionary(owner.dictionary);
                setCards(result.data);
                setCursor(result.nextCursor);
            })
            .catch(() => {
                if (!controller.signal.aborted) setError(true);
            })
            .finally(() => {
                if (!controller.signal.aborted) setBusy(false);
            });
        return () => controller.abort();
    }, [item, kind, context.requestWithSession]);
    function chooseKind(event: ChangeEvent<HTMLSelectElement>) {
        setKind(event.target.value as 'dictionary' | 'text');
        setItem(null);
        setPreview(null);
    }
    function select(event: ChangeEvent<HTMLInputElement>) {
        const id = event.target.value;
        const checked = event.target.checked;
        setPreview(null);
        setSelected((current) =>
            checked
                ? [...current, id]
                : current.filter((value) => value !== id),
        );
    }
    async function more() {
        if (!item || !cursor || !dictionary || busy) return;
        setBusy(true);
        setError(false);
        const epoch = generation.current;
        try {
            const result = await context.requestWithSession((token) =>
                dictionaryApi.listCards(token, item.id, { limit: 100, cursor }),
            );
            if (
                result.dictionaryVersion !== dictionary.version ||
                result.settingsVersion !== dictionary.settingsVersion
            )
                throw new Error('Dictionary changed.');
            if (epoch !== generation.current) return;
            setCards((current) => [...current, ...result.data]);
            setCursor(result.nextCursor);
        } catch {
            setError(true);
            setPreview(null);
        } finally {
            setBusy(false);
        }
    }
    async function prepare() {
        if (!item || busy || disabled) return;
        setBusy(true);
        setError(false);
        const epoch = generation.current;
        try {
            if (kind === 'dictionary') {
                if (!dictionary) throw new Error('Dictionary unavailable.');
                setPreview(
                    vocabularyLibraryBlock(
                        dictionary,
                        cards.filter((card) => selected.includes(card.id)),
                    ),
                );
            } else {
                const result = await context.requestWithSession((token) =>
                    textsApi.getText(token, item.id),
                );
                if (epoch !== generation.current) return;
                setPreview(textLibraryBlock(result.text));
            }
        } catch {
            setError(true);
            setPreview(null);
        } finally {
            setBusy(false);
        }
    }
    function insert() {
        if (preview && !disabled && onInsert(preview)) onClose();
        else setError(true);
    }
    const hasMore = cursor !== null;
    return (
        <Dialog
            open
            onClose={onClose}
            title={labels.insert}
            closeLabel={labels.cancel}
            size='large'
        >
            <div className={styles.form}>
                <label>
                    {labels.select}
                    <select value={kind} onChange={chooseKind} disabled={busy}>
                        <option value='dictionary'>{labels.dictionary}</option>
                        <option value='text'>{labels.text}</option>
                    </select>
                </label>
                <LibraryItemPicker
                    key={kind}
                    kind={kind}
                    request={context.requestWithSession}
                    labels={labels}
                    onSelect={setItem}
                />
                {kind === 'dictionary' && (
                    <fieldset className={styles.entries} disabled={busy}>
                        <legend>{labels.selected}</legend>
                        {cards.map((card) => (
                            <label key={card.id} className={styles.entry}>
                                <input
                                    type='checkbox'
                                    value={card.id}
                                    checked={selected.includes(card.id)}
                                    onChange={select}
                                />
                                {card.values.source} — {card.values.translation}
                            </label>
                        ))}
                    </fieldset>
                )}
                {hasMore && (
                    <Button type='button' onClick={more} disabled={busy}>
                        {labels.more}
                    </Button>
                )}
                <Button
                    type='button'
                    variant='secondary'
                    loading={busy}
                    onClick={prepare}
                    disabled={!item || disabled}
                >
                    {labels.preview}
                </Button>
                {preview && (
                    <div className={styles.preview}>
                        <LearningBlockView
                            block={preview}
                            labels={viewLabels}
                        />
                        <Button
                            type='button'
                            onClick={insert}
                            disabled={disabled}
                        >
                            {labels.insertSelected}
                        </Button>
                    </div>
                )}
                {error && (
                    <InlineAlert tone='error'>{labels.error}</InlineAlert>
                )}
            </div>
        </Dialog>
    );
}
