'use client';
import { useActionConsent } from '@/fsd/entities/ai-action';
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
    const actionConsent = useActionConsent();
    const accountedApi = useMemo<SentenceApi>(
        () => ({
            ...api,
            ...(api.startPreparation
                ? {
                      startPreparation: (input) =>
                          actionConsent.run((confirmedQuoteId) =>
                              api.startPreparation!({
                                  ...input,
                                  ...(confirmedQuoteId
                                      ? { confirmedQuoteId }
                                      : {}),
                              }),
                          ),
                  }
                : {}),
            ...(api.commandPreparation
                ? {
                      commandPreparation: (id, input) =>
                          actionConsent.run((confirmedQuoteId) =>
                              api.commandPreparation!(id, {
                                  ...input,
                                  ...(confirmedQuoteId
                                      ? { confirmedQuoteId }
                                      : {}),
                              }),
                          ),
                  }
                : {}),
        }),
        [api, actionConsent.run],
    );
    const store = useMemo(
        () => new SentencePreparationStore(accountedApi, identity),
        [accountedApi, identity],
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
        actionConsent,
        continueWithBudget: store.continueWithBudget,
        start: store.start,
        loadEligibleCount: store.loadEligibleCount,
        refresh: store.refresh,
        stop: store.stop,
        resume: store.resume,
        loadMore: store.loadMore,
        clear: store.clear,
    };
}
