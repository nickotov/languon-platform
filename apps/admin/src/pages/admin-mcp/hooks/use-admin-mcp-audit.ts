import { useCallback, useEffect, useState } from 'react';
import { adminMcpApi } from '@/shared/api/admin-mcp-api';

type AuditResponse = Awaited<ReturnType<typeof adminMcpApi.audit>>;

export function useAdminMcpAudit() {
    const [page, setPage] = useState(1);
    const [result, setResult] = useState<AuditResponse | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [loading, setLoading] = useState(true);
    const refresh = useCallback(
        async (signal?: AbortSignal) => {
            setLoading(true);
            try {
                const response = await adminMcpApi.audit(
                    { page, pageSize: 25 },
                    signal,
                );
                if (!signal?.aborted) {
                    setResult(response);
                    setError(null);
                }
            } catch (caught) {
                if (!signal?.aborted)
                    setError(
                        caught instanceof Error
                            ? caught
                            : new Error('Activity could not be loaded.'),
                    );
            } finally {
                if (!signal?.aborted) setLoading(false);
            }
        },
        [page],
    );

    useEffect(() => {
        const controller = new AbortController();
        void refresh(controller.signal);
        return () => controller.abort();
    }, [refresh]);

    const reload = () => void refresh();
    const changePage = (nextPage: number) => setPage(nextPage);
    return { result, error, loading, page, reload, changePage };
}
