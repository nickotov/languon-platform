import { useCallback, useEffect, useState } from 'react';
import type {
    AdminAiCatalogEntry,
    AdminAiCatalogReference,
    AdminAiCatalogSummary,
} from '@languon/contracts';
import { aiCatalogApi } from '@/shared/api/ai-catalog-api';

export function useAiCatalog(selection: AdminAiCatalogReference | null) {
    const [entries, setEntries] = useState<AdminAiCatalogSummary[]>([]);
    const [listLoading, setListLoading] = useState(true);
    const [listError, setListError] = useState<Error | null>(null);
    const [entry, setEntry] = useState<AdminAiCatalogEntry | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<Error | null>(null);
    const [listRevision, setListRevision] = useState(0);
    const [detailRevision, setDetailRevision] = useState(0);
    const kind = selection?.kind;
    const id = selection?.id;

    useEffect(() => {
        const controller = new AbortController();
        setListLoading(true);
        setListError(null);
        aiCatalogApi
            .list(controller.signal)
            .then((response) => {
                if (!controller.signal.aborted) {
                    setEntries(response.entries);
                }
            })
            .catch((error: unknown) => {
                if (!controller.signal.aborted) {
                    setListError(asError(error));
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setListLoading(false);
                }
            });

        return () => controller.abort();
    }, [listRevision]);

    useEffect(() => {
        setEntry(null);
        setDetailError(null);
        if (!kind || !id) {
            setDetailLoading(false);

            return;
        }

        const controller = new AbortController();
        setDetailLoading(true);
        aiCatalogApi
            .detail({ kind, id }, controller.signal)
            .then((response) => {
                if (!controller.signal.aborted) {
                    setEntry(response.entry);
                }
            })
            .catch((error: unknown) => {
                if (!controller.signal.aborted) {
                    setDetailError(asError(error));
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setDetailLoading(false);
                }
            });

        return () => controller.abort();
    }, [kind, id, detailRevision]);

    const reloadList = useCallback(
        () => setListRevision((revision) => revision + 1),
        [],
    );
    const reloadDetail = useCallback(
        () => setDetailRevision((revision) => revision + 1),
        [],
    );

    const currentEntry =
        entry?.kind === kind && entry?.id === id ? entry : null;

    return {
        entries,
        listLoading,
        listError,
        entry: currentEntry,
        detailLoading,
        detailError,
        reloadList,
        reloadDetail,
    };
}

function asError(error: unknown) {
    return error instanceof Error
        ? error
        : new Error('The AI catalog could not be loaded.');
}
