import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    act,
    cleanup,
    fireEvent,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TextAiPreferenceResponse } from '@languon/contracts';
import { useSessionStore } from '@/fsd/entities/session';
import {
    ActionBudgetSummary,
    ModelPreferenceSection,
} from '@/fsd/features/text-ai-preferences';
import {
    preferencesApi,
    PreferenceApiError,
} from '@/fsd/features/text-ai-preferences/api/preferences-api';
import { render } from './render';

const model = {
    id: 'curated-model',
    label: 'Curated model',
    enabled: true,
    capabilities: ['structured-text'],
    availability: 'available' as const,
    unavailableReason: null,
    creditRates: {
        inputCreditsPerMillionTokens: 10,
        outputCreditsPerMillionTokens: 20,
    },
};
const initial: TextAiPreferenceResponse = {
    mode: 'auto',
    modelId: null,
    selectedModel: null,
    version: 1,
    maxCreditsPerAction: null,
};
const sessionRequest = <T,>(operation: (token: string) => Promise<T>) =>
    operation('test-token');
function mount() {
    return render(
        <QueryClientProvider
            client={
                new QueryClient({
                    defaultOptions: {
                        queries: { retry: false },
                        mutations: { retry: false },
                    },
                })
            }
        >
            <ModelPreferenceSection requestWithSession={sessionRequest} />
        </QueryClientProvider>,
    );
}
async function selectExplicit() {
    fireEvent.click(
        await screen.findByRole('radio', { name: /Curated model/ }),
    );
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
        defaultModelId: model.id,
        models: [model],
    });
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useSessionStore.getState().signOut();
});
describe('model preference persistence and concurrent edits', () => {
    it('shows the backend maximum by the composer with expandable exact authorization', async () => {
        vi.mocked(preferencesApi.read).mockResolvedValue({
            ...initial,
            maxCreditsPerAction: '0.001',
        });
        render(
            <QueryClientProvider
                client={
                    new QueryClient({
                        defaultOptions: { queries: { retry: false } },
                    })
                }
            >
                <ActionBudgetSummary request={sessionRequest} />
            </QueryClientProvider>,
        );
        const summary = await screen.findByText('Maximum: <0.01');
        expect(summary.closest('details')).not.toHaveAttribute('open');
        fireEvent.click(summary);
        expect(screen.getByText('Exact value: 0.001')).toBeInTheDocument();
        expect(
            screen.getByText(/Sending authorizes spending within the maximum/),
        ).toBeInTheDocument();
        act(() => useSessionStore.getState().signOut());
        expect(screen.queryByText('Maximum: <0.01')).not.toBeInTheDocument();
    });

    it('validates precision and saves the exact action budget with the preference version', async () => {
        vi.mocked(preferencesApi.read).mockResolvedValue({
            ...initial,
            maxCreditsPerAction: '1.000',
        });
        const save = vi.spyOn(preferencesApi, 'save').mockResolvedValue({
            ...initial,
            version: 2,
            maxCreditsPerAction: '0.001',
        });
        mount();
        const input = await screen.findByRole('textbox', {
            name: 'Maximum credits per action',
        });
        fireEvent.change(input, { target: { value: '0.0001' } });
        expect(
            screen.getByRole('button', { name: 'Save preference' }),
        ).toBeDisabled();
        expect(screen.getByRole('alert')).toHaveTextContent(
            'up to three decimal',
        );
        fireEvent.change(input, { target: { value: '0.001' } });
        fireEvent.click(
            screen.getByRole('button', { name: 'Save preference' }),
        );
        await waitFor(() =>
            expect(save).toHaveBeenCalledWith('test-token', {
                mode: 'auto',
                expectedVersion: 1,
                maxCreditsPerAction: '0.001',
            }),
        );
        expect(await screen.findByText('Maximum: <0.01')).toBeInTheDocument();
        fireEvent.change(input, { target: { value: '4.123' } });
        fireEvent.click(screen.getByRole('button', { name: 'Cancel changes' }));
        expect(input).toHaveValue('0.001');
    });

    it('preserves a failed draft, retries its version and prevents duplicate saves', async () => {
        let resolve!: (value: TextAiPreferenceResponse) => void;
        const save = vi
            .spyOn(preferencesApi, 'save')
            .mockRejectedValueOnce(new Error('offline'))
            .mockImplementationOnce(
                () =>
                    new Promise((done) => {
                        resolve = done;
                    }),
            );
        mount();
        await selectExplicit();
        fireEvent.click(
            screen.getByRole('button', { name: 'Save preference' }),
        );
        await screen.findByText(/Your preference was not saved/);
        expect(
            screen.getByRole('radio', { name: /Curated model/ }),
        ).toBeChecked();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        fireEvent.click(
            screen.getByRole('button', { name: 'Save preference' }),
        );
        expect(save).toHaveBeenCalledTimes(2);
        expect(save.mock.calls[1]?.[1]).toEqual({
            mode: 'explicit',
            modelId: model.id,
            expectedVersion: 1,
        });
        await act(async () =>
            resolve({
                mode: 'explicit',
                modelId: model.id,
                selectedModel: model,
                version: 2,
                maxCreditsPerAction: null,
            }),
        );
        expect(
            await screen.findByText(
                'Preference saved. New requests will use it.',
            ),
        ).toBeInTheDocument();
    });
    it('refetches a conflict and only overwrites after an explicit choice', async () => {
        const latest = { ...initial, version: 7 };
        vi.mocked(preferencesApi.read)
            .mockResolvedValueOnce(initial)
            .mockResolvedValue(latest);
        const save = vi
            .spyOn(preferencesApi, 'save')
            .mockRejectedValueOnce(new PreferenceApiError('conflict', 409))
            .mockResolvedValue({
                mode: 'explicit',
                modelId: model.id,
                selectedModel: model,
                version: 8,
            });
        mount();
        await selectExplicit();
        fireEvent.click(
            screen.getByRole('button', { name: 'Save preference' }),
        );
        const overwrite = await screen.findByRole('button', {
            name: 'Save my choice instead',
        });
        await waitFor(() => expect(overwrite).toBeEnabled());
        expect(save).toHaveBeenCalledTimes(1);
        expect(
            screen.getByRole('radio', { name: /Curated model/ }),
        ).toBeChecked();
        fireEvent.click(overwrite);
        await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
        expect(save.mock.calls[1]?.[1]).toEqual({
            mode: 'explicit',
            modelId: model.id,
            expectedVersion: 7,
        });
    });
    it('allows Auto with a failed catalog and does not invent zero credits', async () => {
        vi.mocked(preferencesApi.read).mockResolvedValue({
            mode: 'explicit',
            modelId: model.id,
            selectedModel: model,
            version: 3,
        });
        vi.mocked(preferencesApi.catalog).mockRejectedValue(
            new Error('catalog unavailable'),
        );
        mount();
        await screen.findByText(/Could not load available models/);
        fireEvent.click(screen.getByRole('radio', { name: /Auto —/ }));
        expect(
            screen.getByRole('button', { name: 'Save preference' }),
        ).toBeEnabled();
        expect(screen.queryByText(/0 credits/)).not.toBeInTheDocument();
    });
    it('clears protected settings immediately when the session ends', async () => {
        mount();
        await selectExplicit();
        act(() => useSessionStore.getState().signOut());
        expect(screen.queryByRole('radio')).not.toBeInTheDocument();
        expect(
            screen.getByText(
                'Sign in to view and change your AI model preference.',
            ),
        ).toBeInTheDocument();
    });
    it('keeps a conflict draft and disables overwrite when the latest read fails', async () => {
        vi.mocked(preferencesApi.read)
            .mockResolvedValueOnce(initial)
            .mockRejectedValue(new Error('connection lost'));
        vi.spyOn(preferencesApi, 'save').mockRejectedValue(
            new PreferenceApiError('conflict', 409),
        );
        mount();
        await selectExplicit();
        fireEvent.click(
            screen.getByRole('button', { name: 'Save preference' }),
        );
        await screen.findByText(/Your saved preference changed/);
        await waitFor(() =>
            expect(preferencesApi.read).toHaveBeenCalledTimes(2),
        );
        expect(
            screen.getByRole('button', { name: 'Save my choice instead' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('radio', { name: /Curated model/ }),
        ).toBeChecked();
        expect(
            screen.getByRole('button', { name: 'Reload latest preference' }),
        ).toBeEnabled();
    });
    it('retains an unavailable explicit identity until Auto is deliberately saved', async () => {
        vi.mocked(preferencesApi.read).mockResolvedValue({
            mode: 'explicit',
            modelId: 'retired-model',
            selectedModel: null,
            version: 3,
        });
        mount();
        await screen.findByText(/retired-model: Your saved model/);
        expect(screen.getByRole('radio', { name: /Auto —/ })).not.toBeChecked();
        fireEvent.click(screen.getByRole('button', { name: 'Choose Auto' }));
        expect(screen.getByRole('radio', { name: /Auto —/ })).toBeChecked();
        expect(
            screen.getByRole('button', { name: 'Save preference' }),
        ).toBeEnabled();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel changes' }));
        expect(screen.getByRole('radio', { name: /Auto —/ })).not.toBeChecked();
    });
});

it('preserves a learner budget draft and saved budget when cached defaults refresh', async () => {
    vi.mocked(preferencesApi.read).mockResolvedValue({
        ...initial,
        maxCreditsPerAction: '4.125',
    });
    const client = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    render(
        <QueryClientProvider client={client}>
            <ModelPreferenceSection requestWithSession={sessionRequest} />
        </QueryClientProvider>,
    );
    const input = await screen.findByRole('textbox', {
        name: 'Maximum credits per action',
    });
    expect(input).toHaveValue('4.125');
    fireEvent.change(input, { target: { value: '0.125' } });
    act(() =>
        client.setQueryData(['text-ai-preference', 'actor-a'], {
            ...initial,
            maxCreditsPerAction: '20',
            version: 2,
        }),
    );
    expect(input).toHaveValue('0.125');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel changes' }));
    expect(input).toHaveValue('4.125');
});
