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
it('saves only the exact budget and server-managed mode without requesting a model catalog', async () => {
    const save = vi.spyOn(preferencesApi, 'save').mockResolvedValue({
        ...initial,
        maxCreditsPerAction: '2.145',
        version: 4,
    });
    const { result } = mount();
    await waitFor(() => expect(result.current.base).toBeTruthy());
    act(() => result.current.selectBudget('2.145'));
    await act(async () => {
        await result.current.save();
    });
    expect(save).toHaveBeenCalledWith('test-token', {
        mode: 'auto',
        expectedVersion: 3,
        maxCreditsPerAction: '2.145',
    });
    expect(preferencesApi.catalog).not.toHaveBeenCalled();
});
it('keeps a conflicting budget draft and prevents an implicit overwrite', async () => {
    const save = vi
        .spyOn(preferencesApi, 'save')
        .mockRejectedValue(new PreferenceApiError('conflict', 409));
    const { result } = mount();
    await waitFor(() => expect(result.current.base).toBeTruthy());
    act(() => result.current.selectBudget('2.145'));
    await act(async () => {
        await result.current.save();
    });
    expect(result.current.saveState).toBe('conflict');
    expect(result.current.budgetDraft).toBe('2.145');
    await act(async () => {
        await result.current.save();
    });
    expect(save).toHaveBeenCalledTimes(1);
});
it('does not submit an invalid budget', async () => {
    const save = vi.spyOn(preferencesApi, 'save');
    const { result } = mount();
    await waitFor(() => expect(result.current.base).toBeTruthy());
    act(() => result.current.selectBudget('0.0001'));
    await act(async () => {
        await result.current.save();
    });
    expect(save).not.toHaveBeenCalled();
});
