import { useCallback, useEffect, useState } from 'react';
import type {
    ProviderPrice,
    ProviderPricePublishRequestSchema,
} from '@languon/contracts';
import { adminApi } from '@/shared/api/admin-api';

type PublishRequest = (typeof ProviderPricePublishRequestSchema)['_input'];
export function useProviderPrices() {
    const [prices, setPrices] = useState<ProviderPrice[]>([]);
    const [editing, setEditing] = useState<ProviderPrice | 'new' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const [loading, setLoading] = useState(true);
    const load = useCallback(async (signal?: AbortSignal) => {
        setLoading(true);
        try {
            const value = await adminApi.providerPrices(signal);
            if (!signal?.aborted) {
                setPrices(value.prices);
                setError(null);
            }
        } catch (caught) {
            if (!signal?.aborted)
                setError(
                    caught instanceof Error
                        ? caught.message
                        : 'Unable to load provider prices.',
                );
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, []);
    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [load]);
    const open = (price: ProviderPrice) => {
        setEditing(price);
        setSaveError(null);
    };
    const add = () => {
        setEditing('new');
        setSaveError(null);
    };
    const close = () => setEditing(null);
    const reload = () => {
        setEditing(null);
        void load();
    };
    const publish = async (body: PublishRequest) => {
        setPending(true);
        setSaveError(null);
        try {
            await adminApi.publishProviderPrice(body);
            setEditing(null);
            await load();
        } catch (caught) {
            setSaveError(
                caught instanceof Error
                    ? caught.message
                    : 'Unable to publish provider price.',
            );
        } finally {
            setPending(false);
        }
    };
    return {
        prices,
        editing,
        error,
        saveError,
        pending,
        loading,
        open,
        add,
        close,
        reload,
        publish,
    };
}
