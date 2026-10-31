import { useCallback, useEffect, useRef, useState } from 'react';
import { adminApi } from '@/shared/api/admin-api';
import type {
    TextAiProbeRequest,
    TextAiProbeRecoveryRequest,
    TextAiRoutingDisableRequest,
    TextAiRoutingPublishRequest,
} from '@languon/contracts';

type Snapshot = {
    routing: Awaited<ReturnType<typeof adminApi.textAiRouting>>;
    checks: Awaited<ReturnType<typeof adminApi.textAiProbes>>;
};

export function useTextAiRouting() {
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [mutationError, setMutationError] = useState<Error | null>(null);
    const [pending, setPending] = useState(false);
    const inFlight = useRef(false);
    const refreshing = useRef(false);
    const controller = useRef<AbortController | null>(null);

    const refresh = useCallback(async () => {
        controller.current?.abort();
        const nextController = new AbortController();
        controller.current = nextController;
        refreshing.current = true;
        setLoading(true);
        setError(null);
        try {
            const [routing, checks] = await Promise.all([
                adminApi.textAiRouting(nextController.signal),
                adminApi.textAiProbes(nextController.signal),
            ]);
            if (!nextController.signal.aborted)
                setSnapshot({ routing, checks });
        } catch (caught) {
            if (!nextController.signal.aborted) setError(asError(caught));
        } finally {
            if (!nextController.signal.aborted) {
                refreshing.current = false;
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        void refresh();
        return () => controller.current?.abort();
    }, [refresh]);

    const reload = useCallback(async () => {
        if (inFlight.current) return;
        await refresh();
    }, [refresh]);

    const publish = async (request: TextAiRoutingPublishRequest) => {
        if (inFlight.current || refreshing.current) return;
        inFlight.current = true;
        setPending(true);
        setMutationError(null);
        try {
            await adminApi.publishTextAiRouting(request);
            await refresh();
        } catch (caught) {
            setMutationError(asError(caught));
        } finally {
            inFlight.current = false;
            setPending(false);
        }
    };

    const disable = async (request: TextAiRoutingDisableRequest) => {
        if (inFlight.current || refreshing.current) return;
        inFlight.current = true;
        setPending(true);
        setMutationError(null);
        try {
            await adminApi.disableTextAiRoute(request);
            await refresh();
        } catch (caught) {
            setMutationError(asError(caught));
        } finally {
            inFlight.current = false;
            setPending(false);
        }
    };

    const recoverProbe = async (
        probeId: string,
        request: TextAiProbeRecoveryRequest,
    ) => {
        if (inFlight.current || refreshing.current) return;
        inFlight.current = true;
        setPending(true);
        setMutationError(null);
        try {
            await adminApi.recoverTextAiProbe(probeId, request);
            await refresh();
        } catch (caught) {
            setMutationError(asError(caught));
        } finally {
            inFlight.current = false;
            setPending(false);
        }
    };

    const runProbe = async (request: TextAiProbeRequest) => {
        if (inFlight.current || refreshing.current) return;
        inFlight.current = true;
        setPending(true);
        setMutationError(null);
        try {
            const probe = await adminApi.runTextAiProbe(request);
            setSnapshot((current) =>
                current
                    ? {
                          ...current,
                          checks: {
                              ...current.checks,
                              probes: [
                                  probe,
                                  ...current.checks.probes.filter(
                                      (item) => item.id !== probe.id,
                                  ),
                              ],
                          },
                      }
                    : current,
            );
        } catch (caught) {
            setMutationError(asError(caught));
        } finally {
            inFlight.current = false;
            setPending(false);
        }
    };

    return {
        snapshot,
        loading,
        error,
        mutationError,
        pending,
        refresh: reload,
        clearMutationError: () => setMutationError(null),
        publish,
        disable,
        runProbe,
        recoverProbe,
    };
}

function asError(error: unknown) {
    return error instanceof Error
        ? error
        : new Error('The request could not be completed.');
}
