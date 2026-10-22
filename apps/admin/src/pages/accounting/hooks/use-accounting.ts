import { useCallback, useEffect, useState } from 'react';
import type {
    AccountingRecord,
    AccountingRecordRequest,
    AccountingReport,
} from '@languon/contracts';
import { reportWhenReady } from '../lib/report-when-ready';
import { adminApi } from '@/shared/api/admin-api';

export function useAccounting() {
    const [report, setReport] = useState<AccountingReport | null>(null);
    const [records, setRecords] = useState<AccountingRecord[]>([]);
    const [error, setError] = useState<Error | null>(null);
    const [pending, setPending] = useState(false);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState(() => {
        const now = new Date();
        return {
            from: new Date(
                Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
            ).toISOString(),
            to: new Date(
                Date.UTC(
                    now.getUTCFullYear(),
                    now.getUTCMonth(),
                    now.getUTCDate() + 1,
                ),
            ).toISOString(),
        };
    });
    const refresh = useCallback(
        async (signal?: AbortSignal) => {
            try {
                const [nextReport, inventory] = await Promise.all([
                    reportWhenReady(period, signal),
                    adminApi.accountingRecords(signal),
                ]);
                if (signal?.aborted) return;
                setReport(nextReport);
                setRecords(inventory.records);
                setError(null);
            } catch (caught) {
                if (!signal?.aborted)
                    setError(
                        caught instanceof Error
                            ? caught
                            : new Error('Accounting could not be loaded.'),
                    );
            } finally {
                if (!signal?.aborted) setLoading(false);
            }
        },
        [period],
    );
    useEffect(() => {
        const controller = new AbortController();
        setReport(null);
        setLoading(true);
        let timer: number | undefined;
        const tick = async () => {
            await refresh(controller.signal);
            if (!controller.signal.aborted)
                timer = window.setTimeout(tick, 30_000);
        };
        void tick();
        return () => {
            controller.abort();
            window.clearTimeout(timer);
        };
    }, [refresh]);
    const record = async (body: AccountingRecordRequest) => {
        setPending(true);
        try {
            await adminApi.recordAccounting(body);
            await refresh();
        } finally {
            setPending(false);
        }
    };
    const reload = () => void refresh();
    return {
        report,
        records,
        error,
        pending,
        loading,
        period,
        setPeriod,
        record,
        reload,
    };
}
