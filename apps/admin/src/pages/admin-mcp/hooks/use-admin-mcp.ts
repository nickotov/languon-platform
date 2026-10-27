import { useCallback, useEffect, useState } from 'react';
import type {
    AdminMcpIssueToken,
    AdminMcpTokenMetadata,
} from '@languon/contracts';
import { adminMcpApi } from '@/shared/api/admin-mcp-api';

export function useAdminMcp() {
    const [tokens, setTokens] = useState<AdminMcpTokenMetadata[]>([]);
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [secret, setSecret] = useState<string | null>(null);

    const refresh = useCallback(async (signal?: AbortSignal) => {
        try {
            const result = await adminMcpApi.list(signal);
            if (!signal?.aborted) {
                setTokens(result.tokens);
                setError(null);
            }
        } catch (caught) {
            if (!signal?.aborted) setError(asError(caught));
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        void refresh(controller.signal);
        return () => controller.abort();
    }, [refresh]);

    const issue = async (body: AdminMcpIssueToken) => {
        setPending(true);
        setError(null);
        try {
            const result = await adminMcpApi.issue(body);
            setSecret(result.secret);
            setTokens((current) => [result.token, ...current]);
            return true;
        } catch (caught) {
            setError(asError(caught));
            return false;
        } finally {
            setPending(false);
        }
    };

    const revoke = async (id: string, reason: string) => {
        setPending(true);
        setError(null);
        try {
            await adminMcpApi.revoke(id, reason);
            await refresh();
            return true;
        } catch (caught) {
            setError(asError(caught));
            return false;
        } finally {
            setPending(false);
        }
    };

    const reload = () => void refresh();
    const dismissSecret = () => setSecret(null);
    return {
        tokens,
        loading,
        pending,
        error,
        secret,
        issue,
        revoke,
        reload,
        dismissSecret,
    };
}

function asError(error: unknown): Error {
    return error instanceof Error
        ? error
        : new Error('The administration request failed.');
}
