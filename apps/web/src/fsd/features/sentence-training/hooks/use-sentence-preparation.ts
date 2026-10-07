'use client';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { SentenceApi, SentencePreparationController } from '../types';
import { SentencePreparationStore } from '../model/sentence-preparation';

export function useSentencePreparation({
    api,
    identity,
    enabled = true,
}: {
    api: SentenceApi;
    identity: string;
    enabled?: boolean;
}): SentencePreparationController {
    const store = useMemo(
        () => new SentencePreparationStore(api, identity),
        [api, identity],
    );
    useEffect(() => {
        if (enabled) store.enable();
        return store.disable;
    }, [store, enabled]);
    const snapshot = useSyncExternalStore(
        store.subscribe,
        store.getSnapshot,
        store.getSnapshot,
    );
    return {
        ...snapshot,
        start: store.start,
        loadEligibleCount: store.loadEligibleCount,
        refresh: store.refresh,
        stop: store.stop,
        resume: store.resume,
        loadMore: store.loadMore,
        clear: store.clear,
    };
}
