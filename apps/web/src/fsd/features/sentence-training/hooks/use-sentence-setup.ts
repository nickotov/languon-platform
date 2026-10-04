'use client';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type {
    Configuration,
    SentenceApi,
    SentenceSetupController,
} from '../types';
import { SentenceSetup } from '../model/sentence-setup';
export function useSentenceSetup({
    api,
    identity,
    initialExplanationLanguage,
    enabled = true,
}: {
    api: SentenceApi;
    identity: string;
    initialExplanationLanguage?: Configuration['explanationLanguage'];
    enabled?: boolean;
}): SentenceSetupController {
    const store = useMemo(
        () => new SentenceSetup(api, initialExplanationLanguage),
        [api, identity, initialExplanationLanguage],
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
        setConfiguration: store.setConfiguration,
        setSearch: store.setSearch,
        setSelectedEntryIds: store.setSelectedEntryIds,
        loadMore: store.loadMore,
        refresh: store.refresh,
        invalidate: store.invalidate,
    };
}
