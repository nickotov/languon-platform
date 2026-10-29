'use client';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
    dictionaryApi,
    type RequestWithSession,
} from '@/fsd/entities/dictionary';
import { textsApi } from '@/fsd/entities/texts';
import type { TextFolder } from '@languon/contracts';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import type { LibraryLabels } from './library-labels';
import styles from './library-copy.module.css';

export type LibraryItem = {
    id: string;
    name: string;
    version: number;
    settingsVersion?: number;
};
export function LibraryItemPicker({
    kind,
    request,
    labels,
    onSelect,
}: {
    kind: 'dictionary' | 'text';
    request: RequestWithSession;
    labels: LibraryLabels;
    onSelect(item: LibraryItem | null): void;
}) {
    const generation = useRef(0);
    const [items, setItems] = useState<LibraryItem[]>([]);
    const [folders, setFolders] = useState<TextFolder[]>([]);
    const [folder, setFolder] = useState('');
    const [cursor, setCursor] = useState<string | null>(null);
    const [folderCursor, setFolderCursor] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [selected, setSelected] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        generation.current += 1;
        setBusy(true);
        setError(false);
        setItems([]);
        setCursor(null);
        setSelected('');
        onSelect(null);
        async function load() {
            try {
                const result =
                    kind === 'dictionary'
                        ? await request((token) =>
                              dictionaryApi.listDictionaries(
                                  token,
                                  { limit: 100 },
                                  controller.signal,
                              ),
                          )
                        : await request((token) =>
                              folder
                                  ? textsApi.listTexts(
                                        token,
                                        folder,
                                        { limit: 100 },
                                        controller.signal,
                                    )
                                  : textsApi.listIndependentTexts(
                                        token,
                                        { limit: 100 },
                                        controller.signal,
                                    ),
                          );
                if (controller.signal.aborted) return;
                setItems(
                    result.data.map((item) => ({
                        id: item.id,
                        name: 'name' in item ? item.name : item.title,
                        version: item.version,
                        ...('settingsVersion' in item
                            ? { settingsVersion: item.settingsVersion }
                            : {}),
                    })),
                );
                setCursor(result.nextCursor);
            } catch {
                if (!controller.signal.aborted) setError(true);
            } finally {
                if (!controller.signal.aborted) setBusy(false);
            }
        }
        void load();
        return () => controller.abort();
    }, [folder, kind, request, onSelect]);
    useEffect(() => {
        if (kind !== 'text') return;
        const controller = new AbortController();
        void request((token) =>
            textsApi.listFolders(token, { limit: 100 }, controller.signal),
        )
            .then((result) => {
                if (!controller.signal.aborted) {
                    setFolders(result.data);
                    setFolderCursor(result.nextCursor);
                }
            })
            .catch(() => {
                if (!controller.signal.aborted) setError(true);
            });
        return () => controller.abort();
    }, [kind, request]);
    function choose(event: ChangeEvent<HTMLSelectElement>) {
        const id = event.target.value;
        setSelected(id);
        onSelect(items.find((item) => item.id === id) ?? null);
    }
    function chooseFolder(event: ChangeEvent<HTMLSelectElement>) {
        setFolder(event.target.value);
    }
    async function more() {
        if (!cursor || busy) return;
        setBusy(true);
        setError(false);
        const epoch = generation.current;
        try {
            const result =
                kind === 'dictionary'
                    ? await request((token) =>
                          dictionaryApi.listDictionaries(token, {
                              limit: 100,
                              cursor,
                          }),
                      )
                    : await request((token) =>
                          folder
                              ? textsApi.listTexts(token, folder, {
                                    limit: 100,
                                    cursor,
                                })
                              : textsApi.listIndependentTexts(token, {
                                    limit: 100,
                                    cursor,
                                }),
                      );
            if (epoch !== generation.current) return;
            setItems((current) => [
                ...current,
                ...result.data.map((item) => ({
                    id: item.id,
                    name: 'name' in item ? item.name : item.title,
                    version: item.version,
                    ...('settingsVersion' in item
                        ? { settingsVersion: item.settingsVersion }
                        : {}),
                })),
            ]);
            setCursor(result.nextCursor);
        } catch {
            setError(true);
        } finally {
            if (epoch === generation.current) setBusy(false);
        }
    }
    async function moreFolders() {
        if (!folderCursor) return;
        try {
            const result = await request((token) =>
                textsApi.listFolders(token, {
                    limit: 100,
                    cursor: folderCursor,
                }),
            );
            setFolders((current) => [...current, ...result.data]);
            setFolderCursor(result.nextCursor);
        } catch {
            setError(true);
        }
    }
    const hasMore = cursor !== null;
    const hasMoreFolders = folderCursor !== null;
    return (
        <div className={styles.form} aria-busy={busy}>
            {kind === 'text' && (
                <label>
                    {labels.folder}
                    <select value={folder} onChange={chooseFolder}>
                        <option value=''>{labels.independent}</option>
                        {folders.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.name}
                            </option>
                        ))}
                    </select>
                </label>
            )}
            {hasMoreFolders && (
                <Button type='button' variant='ghost' onClick={moreFolders}>
                    {labels.more}
                </Button>
            )}
            <label>
                {labels.select}
                <select value={selected} onChange={choose} disabled={busy}>
                    <option value=''>{labels.select}</option>
                    {items.map((item) => (
                        <option key={item.id} value={item.id}>
                            {item.name}
                        </option>
                    ))}
                </select>
            </label>
            {!busy && items.length === 0 && <p>{labels.empty}</p>}
            {hasMore && (
                <Button
                    type='button'
                    variant='ghost'
                    onClick={more}
                    disabled={busy}
                >
                    {labels.more}
                </Button>
            )}
            {error && <InlineAlert tone='error'>{labels.error}</InlineAlert>}
        </div>
    );
}
