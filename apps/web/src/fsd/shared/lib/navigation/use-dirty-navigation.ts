import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
    readHistoryPosition,
    subscribeHistoryTraversalGuard,
} from './history-position';

/** Guards a mounted editable draft; no sensitive preference is persisted. */
export function useDirtyNavigation() {
    const [dirty, setDirty] = useState(false);
    const [pending, setPending] = useState<(() => void) | null>(null);
    const allowTraversal = useRef(false);
    const allowLeave = useRef(false);
    const request = useCallback(
        (navigate: () => void) => {
            if (dirty) setPending(() => navigate);
            else navigate();
        },
        [dirty],
    );
    const keepEditing = useCallback(() => setPending(null), []);
    const discard = useCallback(() => {
        allowLeave.current = true;
        setDirty(false);
        setPending(null);
        pending?.();
    }, [pending]);
    useLayoutEffect(() => {
        if (!dirty) return;
        allowLeave.current = false;
        function beforeUnload(event: BeforeUnloadEvent) {
            if (allowLeave.current) return;
            event.preventDefault();
            event.returnValue = '';
        }
        function click(event: MouseEvent) {
            if (
                allowLeave.current ||
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
            )
                return;
            const link = (event.target as Element | null)?.closest('a[href]');
            if (
                !(link instanceof HTMLAnchorElement) ||
                link.target === '_blank' ||
                link.hasAttribute('download')
            )
                return;
            const destination = new URL(link.href, window.location.href);
            if (!['http:', 'https:'].includes(destination.protocol)) return;
            if (
                destination.pathname === window.location.pathname &&
                destination.search === window.location.search
            )
                return;
            event.preventDefault();
            event.stopPropagation();
            setPending(() => () => window.location.assign(destination.href));
        }
        // Use pre-traversal cancellation where supported, and indexed restoration
        // before Next's bubble-phase popstate listener in other browsers.
        const navigation = (window as Window & { navigation?: EventTarget })
            .navigation;
        let blockedDelta: number | null = null;
        function traverse(raw: Event) {
            if (blockedDelta !== null || allowLeave.current) return;
            const event = raw as Event & {
                navigationType?: string;
                canIntercept?: boolean;
                destination?: { key?: string };
            };
            if (event.navigationType !== 'traverse' || !event.canIntercept)
                return;
            if (allowTraversal.current) {
                allowTraversal.current = false;
                return;
            }
            event.preventDefault();
            const key = event.destination?.key;
            if (!key) return;
            setPending(() => () => {
                allowTraversal.current = true;
                const target = navigation as EventTarget & {
                    traverseTo(key: string): unknown;
                };
                target.traverseTo(key);
            });
        }
        const guardedPosition = readHistoryPosition(window.history.state);
        const guardedUrl = window.location.href;
        function popState(event: PopStateEvent) {
            if (allowLeave.current || guardedPosition === null) return;
            const destinationPosition = readHistoryPosition(event.state);
            // Untracked entries belong to a different document: native beforeunload
            // protects that navigation. Do not hijack another router's entries.
            if (destinationPosition === null) return;
            const delta = destinationPosition - guardedPosition;
            if (delta === 0 && blockedDelta === null) return;
            event.stopImmediatePropagation();
            if (delta !== 0) {
                if (blockedDelta === null) blockedDelta = delta;
                window.history.go(-delta);
                return;
            }
            // The original entry and URL are restored without an extra history entry.
            if (window.location.href !== guardedUrl) return;
            const continuationDelta = blockedDelta;
            blockedDelta = null;
            if (continuationDelta === null) return;
            setPending(() => () => window.history.go(continuationDelta));
        }
        window.addEventListener('beforeunload', beforeUnload);
        document.addEventListener('click', click, true);
        navigation?.addEventListener('navigate', traverse);
        const unsubscribeTraversal = subscribeHistoryTraversalGuard(popState);
        return () => {
            window.removeEventListener('beforeunload', beforeUnload);
            document.removeEventListener('click', click, true);
            navigation?.removeEventListener('navigate', traverse);
            unsubscribeTraversal();
        };
    }, [dirty]);
    return {
        dirty,
        setDirty,
        open: pending !== null,
        request,
        keepEditing,
        discard,
    };
}
