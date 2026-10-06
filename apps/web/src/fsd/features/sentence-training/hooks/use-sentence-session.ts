'use client';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { SentenceSession } from '../model/sentence-session';
import type { SentenceApi, SentenceSessionController } from '../types';

export function useSentenceSession({
    api,
    identity,
}: {
    api: SentenceApi;
    identity: string;
}): SentenceSessionController {
    const store = useMemo(() => new SentenceSession(api), [api, identity]);
    useEffect(() => () => store.stop(), [store]);
    const snapshot = useSyncExternalStore(
        store.subscribe,
        store.getSnapshot,
        store.getSnapshot,
    );
    return {
        ...snapshot,
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
