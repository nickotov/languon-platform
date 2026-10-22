import {
    renderHook,
    cleanup,
    act,
    waitFor,
    render,
    within,
    screen,
    fireEvent,
} from '@testing-library/react';
import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { adminApi } from '../src/shared/api/admin-api';
import { useRecordings } from '../src/pages/speech-recordings/hooks/use-recordings';
import { useModelPrices } from '../src/pages/ai-settings/hooks/use-model-prices';
import { RecordingDeleteDialog } from '../src/pages/speech-recordings/ui/recording-delete-dialog/recording-delete-dialog';
import { Form, Input } from 'antd';
import { ModelPriceDialog } from '../src/pages/ai-settings/ui/model-prices/model-price-dialog';
import type { AdminSpeechRecording, ModelPrice } from '@languon/contracts';

vi.mock('@refinedev/core', () => ({
    useTranslate: () => (key: string, values?: Record<string, unknown>) => {
        if (key === 'speech.deleteImpact')
            return `Remove ${values?.count} recordings affecting ${values?.links} links`;
        return key;
    },
}));
beforeAll(() => {
    vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
            matches: false,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }),
    );
});
const id = '00000000-0000-4000-8000-000000000042';
const recording: AdminSpeechRecording = {
    id,
    text: 'bonjour',
    language: 'fr',
    provider: 'kie',
    model: 'turbo',
    state: 'ready',
    bindingCount: 3,
    byteLength: 32,
    durationMs: 1200,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastAccessedAt: '2026-01-01T00:00:00.000Z',
    version: 2,
};
const price: ModelPrice = {
    providerId: 'kie',
    modelId: 'turbo',
    meter: 'speech-characters',
    version: 4,
    rateRevisionId: id,
    creditsPer1000Characters: 100,
    minimumCredits: 1,
    inputCreditsPerMillionTokens: null,
    outputCreditsPerMillionTokens: null,
    provisional: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
};
beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => cleanup());

describe('admin recording mutation fencing', () => {
    it('requires a fresh review after changed impact and sends no automatic retry', async () => {
        vi.spyOn(adminApi, 'speechRecordings').mockResolvedValue({
            recordings: [recording],
            total: 1,
        });
        const remove = vi
            .spyOn(adminApi, 'deleteSpeechRecordings')
            .mockRejectedValue(new Error('Impact changed'));
        const { result } = renderHook(() => useRecordings());
        await waitFor(() => expect(result.current.loading).toBe(false));
        act(() => result.current.setSelected([id]));
        act(() => result.current.openDelete());
        await act(async () => {
            await result.current.submitDelete('Bad pronunciation');
        });
        expect(result.current.mutationBlocked).toBe(true);
        expect(remove).toHaveBeenCalledTimes(1);
        await act(async () => {
            await result.current.submitDelete('Bad pronunciation');
        });
        expect(remove).toHaveBeenCalledTimes(1);
        expect(remove.mock.calls[0]?.[0]).toMatchObject({
            recordings: [{ id, expectedVersion: 2, expectedBindingCount: 3 }],
        });
        act(() => result.current.reviewAgain());
        expect(result.current.confirmation).toBeNull();
        expect(result.current.selected).toEqual([]);
    });
    it('clears selections when page or filters change', async () => {
        vi.spyOn(adminApi, 'speechRecordings').mockResolvedValue({
            recordings: [recording],
            total: 26,
        });
        const { result } = renderHook(() => useRecordings());
        await waitFor(() => expect(result.current.loading).toBe(false));
        act(() => result.current.setSelected([id]));
        act(() => result.current.changePage(2));
        expect(result.current.selected).toEqual([]);
        act(() => result.current.setSelected([id]));
        act(() => result.current.updateFilters({ linked: 'false' }));
        expect(result.current.page).toBe(1);
        expect(result.current.selected).toEqual([]);
    });
    it('shows linked impact and requires a reason before sending', async () => {
        const submit = vi.fn().mockResolvedValue(undefined);
        render(
            <RecordingDeleteDialog
                recordings={[recording]}
                pending={false}
                error={null}
                blocked={false}
                onClose={vi.fn()}
                onReview={vi.fn()}
                onSignIn={vi.fn()}
                onSubmit={submit}
            />,
        );
        expect(
            screen.getByText('Remove 1 recordings affecting 3 links'),
        ).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'speech.confirmDelete' }),
        );
        await waitFor(() =>
            expect(screen.getByRole('textbox')).toHaveAttribute(
                'aria-invalid',
                'true',
            ),
        );
        expect(submit).not.toHaveBeenCalled();
        fireEvent.change(screen.getByRole('textbox'), {
            target: { value: 'Faulty pronunciation' },
        });
        fireEvent.click(
            screen.getByRole('button', { name: 'speech.confirmDelete' }),
        );
        await waitFor(() =>
            expect(submit).toHaveBeenCalledWith('Faulty pronunciation'),
        );
    });
});

describe('model price revisions', () => {
    it('keeps the modal reason accessible when the underlying settings form also has a reason', () => {
        render(
            <>
                <Form>
                    <Form.Item name='reason' label='Background reason'>
                        <Input />
                    </Form.Item>
                </Form>
                <ModelPriceDialog
                    price={price}
                    pending={false}
                    blocked={false}
                    error={null}
                    onSubmit={vi.fn().mockResolvedValue(undefined)}
                    onClose={vi.fn()}
                    onReload={vi.fn()}
                    onSignIn={vi.fn()}
                />
            </>,
        );
        const dialog = screen.getByRole('dialog');
        const reason = within(dialog).getByRole('textbox', {
            name: 'user.reason',
        });
        expect(reason).toHaveAttribute('id', 'model-price-publication_reason');
        fireEvent.change(reason, {
            target: { value: 'Reviewed model price publication' },
        });
        expect(reason).toHaveValue('Reviewed model price publication');
        expect(
            screen.getByRole('textbox', { name: 'Background reason' }),
        ).toHaveValue('');
    });

    it.each([0.125, null, undefined])(
        'publishes optional cached input rate %s independently of ordinary input',
        async (cachedRate) => {
            const textPrice: ModelPrice = {
                ...price,
                meter: 'text-tokens',
                creditsPer1000Characters: null,
                minimumCredits: null,
                inputCreditsPerMillionTokens: 1.125,
                outputCreditsPerMillionTokens: 2,
            };
            vi.spyOn(adminApi, 'modelPrices').mockResolvedValue({
                prices: [textPrice],
            });
            const publish = vi
                .spyOn(adminApi, 'publishModelPrice')
                .mockResolvedValue(textPrice);
            const { result } = renderHook(() => useModelPrices());
            await waitFor(() => expect(result.current.loading).toBe(false));
            act(() => result.current.edit(textPrice));
            await act(async () => {
                await result.current.publish({
                    inputCreditsPerMillionTokens: 1.125,
                    outputCreditsPerMillionTokens: 2,
                    cachedInputCreditsPerMillionTokens: cachedRate,
                    provisional: false,
                    reason: 'Publish cached customer tariff',
                });
            });
            expect(publish.mock.calls[0]?.[0]).toMatchObject({
                inputCreditsPerMillionTokens: 1.125,
                outputCreditsPerMillionTokens: 2,
                cachedInputCreditsPerMillionTokens: cachedRate ?? null,
            });
        },
    );
    it('accepts a fractional cached input rate in the price editor', async () => {
        const submit = vi.fn().mockResolvedValue(undefined);
        const textPrice: ModelPrice = {
            ...price,
            meter: 'text-tokens',
            creditsPer1000Characters: null,
            minimumCredits: null,
            inputCreditsPerMillionTokens: 1.125,
            outputCreditsPerMillionTokens: 2,
            cachedInputCreditsPerMillionTokens: null,
        };
        render(
            <ModelPriceDialog
                price={textPrice}
                pending={false}
                blocked={false}
                error={null}
                onSubmit={submit}
                onClose={vi.fn()}
                onReload={vi.fn()}
                onSignIn={vi.fn()}
            />,
        );
        const cached = screen.getByRole('spinbutton', {
            name: 'pricing.cachedInputRate',
        });
        fireEvent.change(cached, { target: { value: '0.125' } });
        fireEvent.change(screen.getByRole('textbox', { name: 'user.reason' }), {
            target: { value: 'Review cached customer credit tariff' },
        });
        fireEvent.click(
            screen.getByRole('button', { name: 'pricing.publish' }),
        );
        await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
        expect(submit.mock.calls[0]?.[0]).toMatchObject({
            inputCreditsPerMillionTokens: 1.125,
            cachedInputCreditsPerMillionTokens: 0.125,
        });
    });
    it('pins the reviewed revision and requires reload after a conflict', async () => {
        vi.spyOn(adminApi, 'modelPrices').mockResolvedValue({
            prices: [price],
        });
        const publish = vi
            .spyOn(adminApi, 'publishModelPrice')
            .mockRejectedValue(new Error('Price revision changed'));
        const { result } = renderHook(() => useModelPrices());
        await waitFor(() => expect(result.current.loading).toBe(false));
        act(() => result.current.edit(price));
        const values = {
            creditsPer1000Characters: 200,
            minimumCredits: 1,
            provisional: false,
            reason: 'Verified actual provider cost',
        };
        await act(async () => {
            await result.current.publish(values);
        });
        expect(publish.mock.calls[0]?.[0]).toMatchObject({
            expectedVersion: 4,
            creditsPer1000Characters: 200,
        });
        expect(result.current.blocked).toBe(true);
        await act(async () => {
            await result.current.publish(values);
        });
        expect(publish).toHaveBeenCalledTimes(1);
        act(() => result.current.refresh());
        expect(result.current.editing).toBeNull();
    });
});
