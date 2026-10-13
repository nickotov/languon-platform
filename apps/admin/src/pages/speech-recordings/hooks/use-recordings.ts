import { useEffect, useRef, useState } from 'react';
import type { AdminSpeechRecording } from '@languon/contracts';
import { adminApi } from '@/shared/api/admin-api';

export type RecordingFilters = {
    search?: string;
    language?: string;
    provider?: string;
    model?: string;
    linked?: 'true' | 'false';
    state?: string;
    createdFrom?: string;
    createdTo?: string;
};

export function useRecordings() {
    const [filters, setFilters] = useState<RecordingFilters>({});
    const [page, setPage] = useState(1);
    const [revision, setRevision] = useState(0);
    const [recordings, setRecordings] = useState<AdminSpeechRecording[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [selected, setSelected] = useState<string[]>([]);
    const [confirmation, setConfirmation] = useState<
        AdminSpeechRecording[] | null
    >(null);
    const [deleting, setDeleting] = useState(false);
    const [mutationError, setMutationError] = useState<Error | null>(null);
    const [mutationBlocked, setMutationBlocked] = useState(false);
    const inFlight = useRef(false);

    useEffect(() => {
        const abort = new AbortController();
        setLoading(true);
        setError(null);
        adminApi
            .speechRecordings({ ...filters, page, pageSize: 25 }, abort.signal)
            .then((response) => {
                if (abort.signal.aborted) return;
                setRecordings(response.recordings);
                setTotal(response.total);
            })
            .catch((caught: unknown) => {
                if (!abort.signal.aborted) setError(asError(caught));
            })
            .finally(() => {
                if (!abort.signal.aborted) setLoading(false);
            });
        return () => abort.abort();
    }, [filters, page, revision]);

    const refresh = () => {
        setSelected([]);
        setRevision((value) => value + 1);
    };
    const updateFilters = (next: RecordingFilters) => {
        setFilters(next);
        setPage(1);
        setSelected([]);
    };
    const openDelete = () => {
        const chosen = recordings.filter((item) => selected.includes(item.id));
        if (chosen.length === 0 || chosen.length > 100) return;
        setMutationError(null);
        setMutationBlocked(false);
        setConfirmation(chosen);
    };
    const closeDelete = () => {
        if (!inFlight.current) {
            setConfirmation(null);
            setMutationError(null);
        }
    };
    const submitDelete = async (reason: string) => {
        if (!confirmation || inFlight.current || mutationBlocked) return;
        inFlight.current = true;
        setDeleting(true);
        setMutationError(null);
        try {
            await adminApi.deleteSpeechRecordings({
                operationId: crypto.randomUUID(),
                reason,
                recordings: confirmation.map((item) => ({
                    id: item.id,
                    expectedVersion: item.version,
                    expectedBindingCount: item.bindingCount,
                })),
            });
            setConfirmation(null);
            refresh();
        } catch (caught) {
            setMutationError(asError(caught));
            // Every failure requires fresh impact review. Never retry a destructive operation silently.
            setMutationBlocked(true);
        } finally {
            inFlight.current = false;
            setDeleting(false);
        }
    };
    const reviewAgain = () => {
        setConfirmation(null);
        setMutationError(null);
        refresh();
    };
    const changePage = (next: number) => {
        setPage(next);
        setSelected([]);
    };
    return {
        recordings,
        filters,
        total,
        page,
        loading,
        error,
        selected,
        setSelected,
        updateFilters,
        changePage,
        refresh,
        confirmation,
        deleting,
        mutationError,
        mutationBlocked,
        openDelete,
        closeDelete,
        submitDelete,
        reviewAgain,
    };
}

function asError(error: unknown) {
    return error instanceof Error
        ? error
        : new Error('The request could not be completed.');
}
