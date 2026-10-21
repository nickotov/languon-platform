'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
    NavigationResource,
    NavigationResourceKind,
} from '@languon/contracts';
import { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '@/fsd/entities/session';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
import { navigationApi } from '../api/navigation-api';

export function useNavigationOwner() {
    return useSessionStore((state) =>
        state.status === 'authenticated' ? (state.user?.id ?? null) : null,
    );
}

function currentOwner(owner: string | null) {
    const state = useSessionStore.getState();
    if (!owner || state.status !== 'authenticated' || state.user?.id !== owner)
        throw new Error('Navigation session changed');
}

export function useNavigationResources(
    input: {
        enabled: boolean;
        kind?: NavigationResourceKind;
        query?: string;
        limit: number;
        currentId?: string;
        recent?: boolean;
    },
    requestWithSession: RequestWithSession,
) {
    const owner = useNavigationOwner();
    const requested = (input.query ?? '').trim();
    const q = useDebouncedSearch(requested);
    return useQuery({
        enabled: Boolean(owner && input.enabled && requested === q),
        queryKey: [
            'library-navigation',
            owner,
            input.kind,
            requested,
            input.limit,
            input.currentId,
            input.recent,
        ],
        queryFn: ({ signal }) =>
            requestWithSession((token) => {
                currentOwner(owner);
                if (input.recent && !q)
                    return navigationApi.recent(token, signal);
                return navigationApi.resources(
                    token,
                    {
                        limit: input.limit,
                        ...(input.kind ? { kind: input.kind } : {}),
                        ...(q ? { q } : {}),
                        ...(input.currentId
                            ? { currentId: input.currentId }
                            : {}),
                    },
                    signal,
                );
            }),
        staleTime: 15_000,
        refetchInterval: input.enabled ? 30_000 : false,
        retry: 1,
    });
}

export function useResourcePin(requestWithSession: RequestWithSession) {
    const owner = useNavigationOwner();
    const client = useQueryClient();
    return useMutation({
        mutationFn: (resource: NavigationResource) =>
            requestWithSession((token) => {
                currentOwner(owner);
                return navigationApi.pin(
                    token,
                    resource.kind,
                    resource.id,
                    !resource.pinned,
                );
            }),
        onSuccess: () => {
            if (owner === useSessionStore.getState().user?.id)
                void client.invalidateQueries({
                    queryKey: ['library-navigation', owner],
                });
        },
    });
}

export function useRecordResourceOpen(
    kind: NavigationResourceKind,
    id: string | null | undefined,
    loaded: boolean,
    requestWithSession: RequestWithSession,
) {
    const owner = useNavigationOwner();
    const client = useQueryClient();
    const recorded = useRef<string | null>(null);
    useEffect(() => {
        if (!owner || !id || !loaded) {
            recorded.current = null;
            return;
        }
        const key = `${owner}:${kind}:${id}`;
        if (recorded.current === key) return;
        recorded.current = key;
        void requestWithSession((token) => {
            currentOwner(owner);
            return navigationApi.opened(token, kind, id);
        })
            .then(() => {
                if (owner === useSessionStore.getState().user?.id)
                    void client.invalidateQueries({
                        queryKey: ['library-navigation', owner],
                    });
            })
            .catch(() => {
                if (recorded.current === key) recorded.current = null;
            });
    }, [owner, kind, id, loaded, client, requestWithSession]);
}

function useDebouncedSearch(value: string) {
    const [query, setQuery] = useState(value.trim());
    useEffect(() => {
        const timer = window.setTimeout(() => setQuery(value.trim()), 150);
        return () => window.clearTimeout(timer);
    }, [value]);
    return query;
}
