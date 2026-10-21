'use client';
import { useEffect, useState } from 'react';
/** Retain the native dialog during the source's exit transition. */
export function useInterviewPreviewPresence(open: boolean) {
    const [present, setPresent] = useState(open);
    useEffect(() => {
        if (open) {
            setPresent(true);
            return;
        }
        const delay = window.matchMedia('(prefers-reduced-motion: reduce)')
            .matches
            ? 0
            : 200;
        const timer = setTimeout(() => setPresent(false), delay);
        return () => clearTimeout(timer);
    }, [open]);
    return present;
}
