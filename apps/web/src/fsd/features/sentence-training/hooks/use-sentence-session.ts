'use client';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useActionConsent } from '@/fsd/entities/ai-action';
import { SentenceSession } from '../model/sentence-session';
import type { SentenceApi, SentenceSessionController } from '../types';

export function useSentenceSession({
    api,
    identity,
}: {
    api: SentenceApi;
    identity: string;
}): SentenceSessionController {
    const actionConsent = useActionConsent();
    const accountedApi = useMemo<SentenceApi>(
        () => ({
            ...api,
            next: (input) =>
                actionConsent.run((confirmedQuoteId) =>
                    api.next({
                        ...input,
                        ...(confirmedQuoteId ? { confirmedQuoteId } : {}),
                    }),
                ),
            check: (id, input) =>
                actionConsent.run((confirmedQuoteId) =>
                    api.check(id, {
                        ...input,
                        ...(confirmedQuoteId ? { confirmedQuoteId } : {}),
                    }),
                ),
        }),
        [api, actionConsent.run],
    );
    const store = useMemo(
        () => new SentenceSession(accountedApi),
        [accountedApi, identity],
    );
    useEffect(() => () => store.stop(), [store]);
    const snapshot = useSyncExternalStore(
        store.subscribe,
        store.getSnapshot,
        store.getSnapshot,
    );
    return {
        ...snapshot,
        actionConsent,
        start: store.start,
        changeMode: store.changeMode,
        restartReview: store.restartReview,
        next: store.next,
        check: store.check,
        revealReference: store.revealReference,
        recompare: store.recompare,
        skip: store.skip,
        repeatExact: store.repeatExact,
        generateNew: store.generateNew,
        retry: store.retry,
        cancel: store.cancel,
        setDraft: store.setDraft,
        toggleHint: store.toggleHint,
        reset: store.reset,
        retryProgress: store.retryProgress,
    };
}
