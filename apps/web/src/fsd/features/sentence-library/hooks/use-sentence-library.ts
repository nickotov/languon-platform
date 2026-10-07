import {
    useInfiniteQuery,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SentenceLibraryFiltersSchema } from '@languon/contracts';
import type {
    SentenceLibraryFilters,
    SentenceLibraryOperation,
} from '@languon/contracts';
import { createLibraryApi, LibraryApiError } from '../api/library-api';
import { displayItem } from '../lib/sentence-display';
import type { Confirmation, LibraryProps, SavedSentence } from '../types';
const defaults: SentenceLibraryFilters = {
    direction: 'target-to-source',
    personalArchive: 'active',
    globalArchive: 'active',
    contentState: 'all',
};
export function useSentenceLibrary({
    target,
    identity,
    requestWithSession,
}: LibraryProps) {
    const api = useMemo(
        () => createLibraryApi(target, requestWithSession),
        [target, requestWithSession],
    );
    const search = useSearchParams();
    const [blocked, setBlocked] = useState(false);
    const [filters, setFilters] = useState<SentenceLibraryFilters>(() => {
        const value = Object.fromEntries(
            [
                'direction',
                'personalArchive',
                'globalArchive',
                'contentState',
            ].flatMap((key) =>
                search.get(key) ? [[key, search.get(key)]] : [],
            ),
        );
        const parsed = SentenceLibraryFiltersSchema.safeParse(value);
        return parsed.success ? { ...defaults, ...parsed.data } : defaults;
    });
    const [selected, setSelected] = useState<string[]>([]);
    const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [announcement, setAnnouncement] = useState('');
    const [allMatching, setAllMatching] = useState(false);
    const queryClient = useQueryClient();
    const queryKey = ['sentence-library', identity, filters];
    const query = useInfiniteQuery({
        queryKey,
        initialPageParam: undefined as string | undefined,
        queryFn: ({ pageParam }) =>
            api.list({
                ...filters,
                ...(pageParam ? { cursor: pageParam } : {}),
            }),
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        retry: false,
        enabled: !blocked,
        gcTime: 0,
        staleTime: 0,
    });
    const presence = useQuery({
        queryKey: ['sentence-library', identity, 'presence'],
        queryFn: () =>
            api.list({
                personalArchive: 'all',
                globalArchive: 'all',
                contentState: 'all',
                limit: 1,
            }),
        enabled: !blocked,
        retry: false,
        gcTime: 0,
        staleTime: 0,
    });
    const accessDenied =
        blocked ||
        [query.error, presence.error, error].some(
            (value) =>
                value instanceof LibraryApiError &&
                [401, 403, 404].includes(value.status),
        );
    useEffect(() => {
        if (!accessDenied || blocked) return;
        setBlocked(true);
        setSelected([]);
        setConfirmation(null);
        queryClient.removeQueries({ queryKey: ['sentence-library', identity] });
    }, [accessDenied, blocked, identity, queryClient]);
    const items = (query.data?.pages.flatMap((page) => page.items) ?? []).map(
        displayItem,
    );
    const selectedItems = items.filter((item) => selected.includes(item.id));
    function updateFilters(value: SentenceLibraryFilters) {
        setSelected([]);
        setAllMatching(false);
        setConfirmation(null);
        setError(null);
        setFilters(value);
        const url = new URL(window.location.href);
        for (const [key, val] of Object.entries(value))
            url.searchParams.set(key, String(val));
        window.history.replaceState(null, '', url);
        setAnnouncement('selectionCleared');
    }
    function resetFilters() {
        updateFilters(defaults);
    }
    function toggle(id: string) {
        setAllMatching(false);
        setSelected((previous) =>
            previous.includes(id)
                ? previous.filter((x) => x !== id)
                : [...previous, id].slice(0, 100),
        );
    }
    const pageAllSelected =
        items.length > 0 &&
        items.slice(0, 100).every((item) => selected.includes(item.id));
    function togglePage() {
        setAllMatching(false);
        setSelected(
            pageAllSelected ? [] : items.slice(0, 100).map((item) => item.id),
        );
    }
    function clearSelection() {
        setSelected([]);
        setAllMatching(false);
    }
    async function openConfirmation(
        operation: SentenceLibraryOperation,
        all = false,
        single?: SavedSentence,
    ) {
        if (pending) return;
        setError(null);
        setPending(true);
        try {
            const chosen = single
                ? [single]
                : selectedItems.filter((item) =>
                      operation === 'archive'
                          ? !item.archivedByMe
                          : item.archivedByMe,
                  );
            const operationId = crypto.randomUUID();
            if (all || allMatching) {
                const snapshot = await api.snapshot(operation, filters);
                setConfirmation({
                    operation,
                    operationId,
                    selection: {
                        type: 'all-matching',
                        snapshotToken: snapshot.snapshotToken,
                    },
                    count: snapshot.matchingCount,
                    filters,
                });
            } else if (chosen.length) {
                setConfirmation({
                    operation,
                    operationId,
                    selection: {
                        type: 'selected',
                        items: chosen.map((item) => ({
                            exerciseId: item.id,
                            expectedVersion: item.version,
                        })),
                    },
                    count: chosen.length,
                    filters,
                });
            }
        } catch (error) {
            setError(error);
        } finally {
            setPending(false);
        }
    }
    async function confirm() {
        if (!confirmation || pending) return;
        setPending(true);
        setError(null);
        try {
            const result = await api.mutate({
                operationId: confirmation.operationId,
                operation: confirmation.operation,
                selection: confirmation.selection,
            });
            setAnnouncement(
                `${confirmation.operation}:${result.affectedCount}`,
            );
            setConfirmation(null);
            clearSelection();
            await queryClient.invalidateQueries({
                queryKey: ['sentence-library', identity],
            });
        } catch (error) {
            setError(error);
            if (error instanceof LibraryApiError && error.status === 409) {
                setConfirmation(null);
                await query.refetch();
            }
        } finally {
            setPending(false);
        }
    }
    function closeConfirmation() {
        if (!pending) {
            setConfirmation(null);
            setError(null);
        }
    }
    function chooseAllMatching() {
        setAllMatching(true);
    }
    function onlyThisPage() {
        setAllMatching(false);
    }
    function retry() {
        void query.refetch();
        void presence.refetch();
    }
    function loadMore() {
        void query.fetchNextPage();
    }
    return {
        presence,
        accessDenied,
        api,
        filters,
        updateFilters,
        resetFilters,
        query,
        items,
        selected,
        selectedItems,
        toggle,
        togglePage,
        pageAllSelected,
        clearSelection,
        allMatching,
        chooseAllMatching,
        onlyThisPage,
        confirmation,
        openConfirmation,
        confirm,
        closeConfirmation,
        pending,
        error,
        announcement,
        retry,
        loadMore,
    };
}
export type LibraryController = ReturnType<typeof useSentenceLibrary>;
