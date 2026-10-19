import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useSessionStore } from '@/fsd/entities/session';
import { useModelPreference } from '@/fsd/features/text-ai-preferences';
import {
    preferencesApi,
    PreferenceApiError,
} from '@/fsd/features/text-ai-preferences/api/preferences-api';

const flash = {
    id: 'deepseek-flash',
    label: 'DeepSeek Flash',
    enabled: true,
    capabilities: ['structured-text'],
    availability: 'available' as const,
    unavailableReason: null,
    creditRates: {
        inputCreditsPerMillionTokens: 10,
        outputCreditsPerMillionTokens: 20,
    },
};
const initial = {
    mode: 'auto' as const,
    modelId: null,
    selectedModel: null,
    version: 3,
};
const request = <T,>(operation: (token: string) => Promise<T>) =>
    operation('test-token');
function mount() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    function wrapper({ children }: { children: ReactNode }) {
        return (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        );
    }
    return renderHook(() => useModelPreference(request), { wrapper });
}
beforeEach(() => {
    useSessionStore.setState({
        status: 'authenticated',
        user: {
            id: 'actor-a',
            primaryEmail: 'test@example.com',
            handle: null,
            createdAt: '2026-10-04T00:00:00.000Z',
            emailVerified: true,
            status: 'active',
        },
    });
    vi.spyOn(preferencesApi, 'read').mockResolvedValue(initial);
    vi.spyOn(preferencesApi, 'catalog').mockResolvedValue({
        defaultModelId: flash.id,
        models: [flash],
    });
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useSessionStore.getState().signOut();
});
it('saves the clicked model atomically rather than the previous rendered draft', async () => {
    const save = vi.spyOn(preferencesApi, 'save').mockResolvedValue({
        mode: 'explicit',
        modelId: flash.id,
        selectedModel: flash,
        version: 4,
    });
    const { result } = mount();
    await waitFor(() =>
        expect(
            result.current.catalog.isSuccess && result.current.base,
        ).toBeTruthy(),
    );
    expect(result.current.draft).toBe('auto');
    await act(async () => {
        await result.current.save(false, flash.id);
    });
    expect(save).toHaveBeenCalledWith('test-token', {
        mode: 'explicit',
        modelId: flash.id,
        expectedVersion: 3,
    });
    expect(result.current.base?.modelId).toBe(flash.id);
});
it('keeps the clicked draft on a version conflict and prevents another implicit overwrite', async () => {
    const save = vi
        .spyOn(preferencesApi, 'save')
        .mockRejectedValue(new PreferenceApiError('conflict', 409));
    const { result } = mount();
    await waitFor(() =>
        expect(
            result.current.catalog.isSuccess && result.current.base,
        ).toBeTruthy(),
    );
    await act(async () => {
        await result.current.save(false, flash.id);
    });
    expect(result.current.saveState).toBe('conflict');
    expect(result.current.draft).toBe(flash.id);
    await act(async () => {
        await result.current.save(false, 'auto');
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.base?.mode).toBe('auto');
});
it('does not send unavailable choices to the preference endpoint', async () => {
    const save = vi.spyOn(preferencesApi, 'save');
    const { result } = mount();
    await waitFor(() =>
        expect(
            result.current.catalog.isSuccess && result.current.base,
        ).toBeTruthy(),
    );
    await act(async () => {
        await result.current.save(false, 'unlisted-model');
    });
    expect(save).not.toHaveBeenCalled();
});
