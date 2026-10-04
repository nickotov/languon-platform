'use client';

import { useEffect, useLayoutEffect } from 'react';

type TraversalGuard = (event: PopStateEvent) => void;
const traversalGuards = new Set<TraversalGuard>();

/** The app root installs the dispatcher before Next's passive router listener. */
export function subscribeHistoryTraversalGuard(
    guard: TraversalGuard,
): () => void {
    traversalGuards.add(guard);
    return () => {
        traversalGuards.delete(guard);
    };
}

function dispatchTraversalGuards(event: PopStateEvent): void {
    for (const guard of traversalGuards) {
        guard(event);
        if (event.cancelBubble) break;
    }
}

const positionKey = '__languonHistoryPosition';

/** Only a numeric position accompanies Next's existing history state. */
export function readHistoryPosition(state: unknown): number | null {
    if (!state || typeof state !== 'object') return null;
    const value = (state as Record<string, unknown>)[positionKey];
    return typeof value === 'number' && Number.isSafeInteger(value)
        ? value
        : null;
}

function withPosition(
    state: unknown,
    position: number,
): Record<string, unknown> {
    const existing = state && typeof state === 'object' ? state : {};
    return { ...existing, [positionKey]: position };
}

/** Does not add entries, store destinations, or replace the router's state. */
export function trackHistoryPositions(): () => void {
    const history = window.history;
    const originalPush = history.pushState;
    const originalReplace = history.replaceState;
    const initialPosition = readHistoryPosition(history.state) ?? 0;
    originalReplace.call(
        history,
        withPosition(history.state, initialPosition),
        '',
    );

    const push: History['pushState'] = function (state, title, url) {
        const current = readHistoryPosition(history.state) ?? initialPosition;
        originalPush.call(
            history,
            withPosition(state, current + 1),
            title,
            url,
        );
    };
    const replace: History['replaceState'] = function (state, title, url) {
        const current = readHistoryPosition(history.state) ?? initialPosition;
        originalReplace.call(history, withPosition(state, current), title, url);
    };
    history.pushState = push;
    history.replaceState = replace;
    return () => {
        // Another framework/hook wrapper may have superseded ours during cleanup.
        if (history.pushState === push) history.pushState = originalPush;
        if (history.replaceState === replace)
            history.replaceState = originalReplace;
    };
}

/** Run after Next's parent effect installs its push/replace wrappers. */
export function useHistoryPositionTracking(): void {
    // Native popstate targets Window. A later per-page listener can be removed
    // by Next's earlier handler before it runs, even when marked capture.
    // Layout setup at the root precedes Next's passive effect registration.
    useLayoutEffect(() => {
        window.addEventListener('popstate', dispatchTraversalGuards, true);
        return () =>
            window.removeEventListener(
                'popstate',
                dispatchTraversalGuards,
                true,
            );
    }, []);
    useEffect(() => {
        let active = true;
        let cleanup: (() => void) | undefined;
        queueMicrotask(() => {
            if (active) cleanup = trackHistoryPositions();
        });
        return () => {
            active = false;
            cleanup?.();
        };
    }, []);
}
