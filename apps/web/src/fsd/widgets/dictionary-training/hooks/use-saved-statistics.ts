'use client';

import { useEffect, useState } from 'react';

/** Read-only progress stays in the mounted actor-scoped widget, never storage. */
export function useSavedStatistics<T>(read: () => Promise<T>) {
    const [revision, setRevision] = useState(0);
    const [state, setState] = useState<{
        result: T | null;
        status: 'loading' | 'idle' | 'error';
    }>({ result: null, status: 'loading' });

    useEffect(() => {
        let live = true;
        setState({ result: null, status: 'loading' });
        void read().then(
            (result) => {
                if (live) setState({ result, status: 'idle' });
            },
            () => {
                if (live) setState({ result: null, status: 'error' });
            },
        );
        return () => {
            live = false;
        };
    }, [read, revision]);

    function retry() {
        setRevision((value) => value + 1);
    }

    return { ...state, retry };
}
