import type {
    AdminAiCreditAdjustmentRequest,
    AdminAiCreditPolicyMutationRequest,
    AdminAiCreditsResponse,
} from '@languon/contracts';
import { useCallback, useEffect, useState } from 'react';

import { adminApi, AdminApiError } from '@/shared/api/admin-api';

const pageSize = 10;

export function useAiCredits(userId: string) {
    const [data, setData] = useState<AdminAiCreditsResponse | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [loading, setLoading] = useState(true);
    const [mutating, setMutating] = useState(false);
    const [page, setPage] = useState(1);

    const load = useCallback(
        async (signal?: AbortSignal) => {
            setLoading(true);
            setError(null);
            try {
                const response = await adminApi.aiCredits(
                    userId,
                    { page, pageSize },
                    signal,
                );
                setData(response);
            } catch (caught) {
                if (signal?.aborted) return;
                setError(normalizeError(caught));
            } finally {
                if (!signal?.aborted) setLoading(false);
            }
        },
        [page, userId],
    );

    useEffect(() => {
        setData(null);
        setPage(1);
        setMutating(false);
    }, [userId]);

    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [load]);

    const updatePolicy = async (
        request: AdminAiCreditPolicyMutationRequest,
    ) => {
        setMutating(true);
        setError(null);
        try {
            const response = await adminApi.updateAiCreditPolicy(
                userId,
                request,
            );
            setData(response);
            setPage(1);
            return response;
        } catch (caught) {
            const normalized = normalizeError(caught);
            setError(normalized);
            throw normalized;
        } finally {
            setMutating(false);
        }
    };

    const adjustCredits = async (request: AdminAiCreditAdjustmentRequest) => {
        setMutating(true);
        setError(null);
        try {
            const response = await adminApi.adjustAiCredits(userId, request);
            setData(response);
            setPage(1);
            return response;
        } catch (caught) {
            const normalized = normalizeError(caught);
            setError(normalized);
            throw normalized;
        } finally {
            setMutating(false);
        }
    };

    return {
        adjustCredits,
        clearError: () => setError(null),
        data,
        error,
        loading,
        mutating,
        page,
        pageSize,
        reload: load,
        setPage,
        updatePolicy,
    };
}

function normalizeError(error: unknown): Error {
    return error instanceof Error
        ? error
        : new Error('AI credits could not be loaded.');
}

export function aiCreditErrorCode(error: Error | null) {
    return error instanceof AdminApiError ? error.detail.code : null;
}
