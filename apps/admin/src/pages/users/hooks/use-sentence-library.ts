import type {
    AdminSentenceDictionaryItem,
    AdminSentenceLibraryFilters,
    AdminSentenceLibraryItem,
} from '@languon/contracts';
import { useCallback, useEffect, useState } from 'react';

import { adminApi } from '@/shared/api/admin-api';

export const initialSentenceFilters: AdminSentenceLibraryFilters = {
    personalArchive: 'all',
    globalArchive: 'all',
    contentState: 'all',
    relation: 'all',
};

export function useSentenceLibrary(userId: string, enabled = true) {
    const [dictionaries, setDictionaries] = useState<
        AdminSentenceDictionaryItem[]
    >([]);
    const [dictionaryCursor, setDictionaryCursor] = useState<string | null>(
        null,
    );
    const [dictionaryId, setDictionaryId] = useState('');
    const [filters, setFilters] = useState(initialSentenceFilters);
    const [items, setItems] = useState<AdminSentenceLibraryItem[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [cursor, setCursor] = useState<string | undefined>();
    const [selected, setSelected] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [discoveryLoading, setDiscoveryLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [discoveryError, setDiscoveryError] = useState<Error | null>(null);
    const [revision, setRevision] = useState(0);

    const discover = useCallback(
        async (signal?: AbortSignal, after?: string) => {
            setDiscoveryLoading(true);
            setDiscoveryError(null);
            try {
                const response = await adminApi.sentenceDictionaries(
                    userId,
                    { limit: 25, cursor: after },
                    signal,
                );
                if (signal?.aborted) return;
                setDictionaries((previous) =>
                    after ? [...previous, ...response.items] : response.items,
                );
                setDictionaryCursor(response.nextCursor);
            } catch (caught) {
                if (!signal?.aborted)
                    setDiscoveryError(normalizeSentenceError(caught));
            } finally {
                if (!signal?.aborted) setDiscoveryLoading(false);
            }
        },
        [userId],
    );

    useEffect(() => {
        if (!enabled) return;
        const controller = new AbortController();
        void discover(controller.signal);
        return () => controller.abort();
    }, [discover, enabled]);

    useEffect(() => {
        if (!dictionaryId) return;
        const controller = new AbortController();
        setLoading(true);
        setError(null);
        setItems([]);
        setSelected([]);
        setNextCursor(null);
        void adminApi
            .sentences(
                userId,
                dictionaryId,
                { ...filters, cursor, limit: 25 },
                controller.signal,
            )
            .then((response) => {
                if (controller.signal.aborted) return;
                setItems(response.items);
                setNextCursor(response.nextCursor);
            })
            .catch((caught: unknown) => {
                if (!controller.signal.aborted)
                    setError(normalizeSentenceError(caught));
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [cursor, dictionaryId, filters, revision, userId]);

    const chooseDictionary = (value: string) => {
        setDictionaryId(value);
        setCursor(undefined);
        setItems([]);
        setSelected([]);
    };
    const changeFilters = (value: AdminSentenceLibraryFilters) => {
        setFilters(value);
        setCursor(undefined);
        setItems([]);
        setSelected([]);
    };
    const reload = () => setRevision((value) => value + 1);
    const firstPage = () => setCursor(undefined);
    const nextPage = () => {
        if (nextCursor) setCursor(nextCursor);
    };
    const loadMoreDictionaries = () => {
        if (dictionaryCursor) void discover(undefined, dictionaryCursor);
    };
    const retryDiscovery = () => {
        void discover();
    };

    return {
        dictionaries,
        dictionaryId,
        dictionaryCursor,
        chooseDictionary,
        filters,
        changeFilters,
        items,
        selected,
        setSelected,
        loading,
        error,
        discoveryError,
        discoveryLoading,
        reload,
        firstPage,
        nextPage,
        cursor,
        nextCursor,
        loadMoreDictionaries,
        retryDiscovery,
    };
}

export function normalizeSentenceError(error: unknown): Error {
    return error instanceof Error
        ? error
        : new Error('Sentence management could not be completed.');
}
