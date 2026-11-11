import { useSyncExternalStore } from 'react';

const desktopQuery = '(min-width: 768px)';

function subscribeDesktop(onChange: () => void) {
    const media = window.matchMedia(desktopQuery);
    media.addEventListener('change', onChange);

    return () => media.removeEventListener('change', onChange);
}

function readDesktop() {
    return window.matchMedia(desktopQuery).matches;
}

function readFalse() {
    return false;
}

function readTrue() {
    return true;
}

function subscribeNever() {
    return () => {};
}

/** Read the client media snapshot synchronously, without effect-driven state updates. */
export function useDesktopTooltip(desktopOnly: boolean) {
    return useSyncExternalStore(
        desktopOnly ? subscribeDesktop : subscribeNever,
        desktopOnly ? readDesktop : readTrue,
        desktopOnly ? readFalse : readTrue,
    );
}
