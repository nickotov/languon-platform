'use client';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { SentenceDirection } from '@languon/contracts';
import type { SentenceApi, SentenceHistoryController } from '../types';
import { SentenceHistory } from '../model/sentence-history';
export function useSentenceHistory({
    api,
    identity,
    direction,
    exerciseId,
    enabled = true,
}: {
    api: SentenceApi;
    identity: string;
    direction?: SentenceDirection | undefined;
    exerciseId?: string | undefined;
    enabled?: boolean;
}): SentenceHistoryController {
    const store = useMemo(
        () => new SentenceHistory(api, direction, exerciseId),
        [api, identity, direction, exerciseId],
    );
    useEffect(() => {
        if (enabled) store.enable();
        return () => store.stop();
    }, [store, enabled]);
    const snapshot = useSyncExternalStore(
        store.subscribe,
        store.getSnapshot,
        store.getSnapshot,
    );
    return {
        ...snapshot,
        refresh: store.refresh,
        invalidate: store.invalidate,
        loadMoreAttempts: store.loadMoreAttempts,
        loadMoreReviews: store.loadMoreReviews,
    };
}
