import { useEffect, useRef, useState } from 'react';
import type { ModelPrice } from '@languon/contracts';
import { adminApi } from '@/shared/api/admin-api';

export function useModelPrices() {
    const [prices, setPrices] = useState<ModelPrice[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [revision, setRevision] = useState(0);
    const [editing, setEditing] = useState<ModelPrice | null>(null);
    const [pending, setPending] = useState(false);
    const [blocked, setBlocked] = useState(false);
    const [saveError, setSaveError] = useState<Error | null>(null);
    const inFlight = useRef(false);
    useEffect(() => {
        const abort = new AbortController();
        setLoading(true);
        setError(null);
        adminApi
            .modelPrices(abort.signal)
            .then((response) => {
                if (!abort.signal.aborted) setPrices(response.prices);
            })
            .catch((caught: unknown) => {
                if (!abort.signal.aborted) setError(asError(caught));
            })
            .finally(() => {
                if (!abort.signal.aborted) setLoading(false);
            });
        return () => abort.abort();
    }, [revision]);
    const refresh = () => {
        setEditing(null);
        setSaveError(null);
        setRevision((value) => value + 1);
    };
    const edit = (price: ModelPrice) => {
        setSaveError(null);
        setBlocked(false);
        setEditing(price);
    };
    const close = () => {
        if (!inFlight.current) setEditing(null);
    };
    const publish = async (values: {
        creditsPer1000Characters?: number;
        minimumCredits?: number;
        inputCreditsPerMillionTokens?: number;
        outputCreditsPerMillionTokens?: number;
        cachedInputCreditsPerMillionTokens?: number | null | undefined;
        provisional: boolean;
        reason: string;
    }) => {
        if (!editing || blocked || inFlight.current) return;
        inFlight.current = true;
        setPending(true);
        setSaveError(null);
        try {
            const speech = editing.meter === 'speech-characters';
            await adminApi.publishModelPrice({
                providerId: editing.providerId,
                modelId: editing.modelId,
                meter: editing.meter,
                expectedVersion: editing.version,
                creditsPer1000Characters: speech
                    ? (values.creditsPer1000Characters ?? null)
                    : null,
                minimumCredits: speech ? (values.minimumCredits ?? null) : null,
                inputCreditsPerMillionTokens: speech
                    ? null
                    : (values.inputCreditsPerMillionTokens ?? null),
                outputCreditsPerMillionTokens: speech
                    ? null
                    : (values.outputCreditsPerMillionTokens ?? null),
                cachedInputCreditsPerMillionTokens: speech
                    ? null
                    : (values.cachedInputCreditsPerMillionTokens ?? null),
                provisional: values.provisional,
                reason: values.reason.trim(),
            });
            refresh();
        } catch (caught) {
            setSaveError(asError(caught));
            setBlocked(true);
        } finally {
            inFlight.current = false;
            setPending(false);
        }
    };
    return {
        prices,
        loading,
        error,
        editing,
        pending,
        blocked,
        saveError,
        refresh,
        edit,
        close,
        publish,
    };
}
function asError(error: unknown) {
    return error instanceof Error
        ? error
        : new Error('The request could not be completed.');
}
