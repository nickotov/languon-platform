import { useEffect, useState } from 'react';
import type { EntryPreview, LearningApi } from '../types';

export function useManualSelection(api: LearningApi) {
    const [search, setSearch] = useState('');
    const [query, setQuery] = useState('');
    const [cursors, setCursors] = useState<Array<string | undefined>>([
        undefined,
    ]);
    const [entries, setEntries] = useState<EntryPreview[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
        'loading',
    );
    const [attempt, setAttempt] = useState(0);
    const cursor = cursors[cursors.length - 1];

    useEffect(() => {
        const timer = setTimeout(() => {
            setQuery(search);
            setCursors([undefined]);
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);
    useEffect(() => {
        let alive = true;
        setStatus('loading');
        setEntries([]);
        setNextCursor(null);
        void api
            .listEntries({ search: query || undefined, cursor, limit: 25 })
            .then(
                (page) => {
                    if (!alive) return;
                    setEntries(page.entries);
                    setNextCursor(page.nextCursor);
                    setStatus('ready');
                },
                () => {
                    if (alive) setStatus('error');
                },
            );
        return () => {
            alive = false;
        };
    }, [api, query, cursor, attempt]);

    function previous() {
        setCursors((values) => values.slice(0, -1));
    }
    function next() {
        if (nextCursor) setCursors((values) => [...values, nextCursor]);
    }
    function retry() {
        setAttempt((value) => value + 1);
    }
    return {
        search,
        setSearch,
        query,
        entries,
        status,
        nextCursor,
        page: cursors.length,
        previous,
        next,
        retry,
    };
}
