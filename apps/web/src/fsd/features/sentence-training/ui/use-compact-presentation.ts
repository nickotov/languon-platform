'use client';
import { useSyncExternalStore } from 'react';

const query = '(max-width: 767px)';
function subscribe(listener: () => void) {
    if (typeof window.matchMedia !== 'function') return () => undefined;
    const media = window.matchMedia(query);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
}
export function useCompactPresentation() {
    return useSyncExternalStore(
        subscribe,
        () =>
            typeof window.matchMedia === 'function' &&
            window.matchMedia(query).matches,
        () => false,
    );
}
