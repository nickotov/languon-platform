import { safeReturnPath } from './return-path';

const SHARED_DICTIONARY_PATH =
    /^\/shared\/dictionaries\/[A-Za-z0-9_-]{16,128}$/;
const SHARE_KEY = /^[A-Za-z0-9_-]{43,128}$/;

export function capabilityReturnFragment(
    returnTo: string,
    hash = typeof window === 'undefined' ? '' : window.location.hash,
): string {
    const destination = safeReturnPath(returnTo);
    if (
        destination !== returnTo ||
        !SHARED_DICTIONARY_PATH.test(destination) ||
        !hash.startsWith('#')
    ) {
        return '';
    }
    const key = hash.slice(1);
    return SHARE_KEY.test(key) ? `#${key}` : '';
}

export function preserveCapabilityReturnFragment(
    target: string,
    returnTo: string,
    hash?: string,
): string {
    return `${target.split('#', 1)[0]}${capabilityReturnFragment(
        returnTo,
        hash,
    )}`;
}
