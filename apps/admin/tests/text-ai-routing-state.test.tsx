import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TextAiProbe } from '@languon/contracts';
import { useTextAiRouting } from '../src/pages/ai-settings/hooks/use-text-ai-routing';
import { adminApi } from '../src/shared/api/admin-api';

const routing = { revision: null, catalog: [] };
const limits = {
    maximumCostUsd: '0.01',
    dailyMaximumCostUsd: '0.10',
    cooldownSeconds: 10,
    evidenceHours: 24,
};
const checks = { limits, probes: [] };
const request = {
    routeId: 'deepseek/deepseek-flash',
    kind: 'flow' as const,
    flowId: 'conversation',
    approvedMaximumCostUsd: '0.01',
};
const probe: TextAiProbe = {
    id: '00000000-0000-4000-8000-000000000001',
    routeId: request.routeId,
    kind: 'flow',
    flowId: 'conversation',
    state: 'passed',
    failure: null,
    startedAt: '2026-10-31T12:00:00.000Z',
    completedAt: '2026-10-31T12:00:01.000Z',
    elapsedMs: 1000,
    firstOutputMs: 500,
    inputTokens: 100,
    outputTokens: 10,
    measurement: 'measured',
    providerCostUsd: '0.0001',
    maximumCostUsd: '0.01',
    evidenceExpiresAt: '2026-11-01T12:00:01.000Z',
};

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

beforeEach(() => {
    vi.spyOn(adminApi, 'textAiRouting').mockResolvedValue(routing);
    vi.spyOn(adminApi, 'textAiProbes').mockResolvedValue(checks);
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('routing refresh and mutation serialization', () => {
    it('prevents paid checks while a slow history refresh is in progress', async () => {
        const run = vi
            .spyOn(adminApi, 'runTextAiProbe')
            .mockResolvedValue(probe);
        const { result } = renderHook(useTextAiRouting);
        await waitFor(() => expect(result.current.loading).toBe(false));
        const delayedRouting = deferred<typeof routing>();
        vi.mocked(adminApi.textAiRouting).mockReturnValueOnce(
            delayedRouting.promise,
        );
        let refresh!: Promise<void>;
        act(() => {
            refresh = result.current.refresh();
        });
        await waitFor(() => expect(result.current.loading).toBe(true));
        await act(() => result.current.runProbe(request));
        expect(run).not.toHaveBeenCalled();
        await act(async () => {
            delayedRouting.resolve(routing);
            await refresh;
        });
        await act(() => result.current.runProbe(request));
        expect(run).toHaveBeenCalledOnce();
        expect(result.current.snapshot?.checks.probes).toEqual([probe]);
    });

    it('does not start a refresh that could overwrite an in-flight paid result', async () => {
        const paid = deferred<TextAiProbe>();
        vi.spyOn(adminApi, 'runTextAiProbe').mockReturnValue(paid.promise);
        const { result } = renderHook(useTextAiRouting);
        await waitFor(() => expect(result.current.loading).toBe(false));
        let running!: Promise<void>;
        act(() => {
            running = result.current.runProbe(request);
        });
        await act(() => result.current.refresh());
        expect(adminApi.textAiRouting).toHaveBeenCalledOnce();
        expect(adminApi.textAiProbes).toHaveBeenCalledOnce();
        await act(async () => {
            paid.resolve(probe);
            await running;
        });
        expect(result.current.snapshot?.checks.probes).toEqual([probe]);
        expect(result.current.pending).toBe(false);
    });
});
