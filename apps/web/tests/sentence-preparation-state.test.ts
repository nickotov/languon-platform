import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    SentencePreparation,
    SentencePreparationBatch,
} from '@languon/contracts';
import type { SentenceApi } from '@/fsd/features/sentence-training/types';
import { SentencePreparationStore } from '@/fsd/features/sentence-training/model/sentence-preparation';
import { ApiError } from '@/fsd/features/sentence-training/lib/api-error';

const id = '10000000-0000-4000-8000-000000000001';
const batchId = '10000000-0000-4000-8000-000000000002';
const entryId = '10000000-0000-4000-8000-000000000003';
const exerciseId = '10000000-0000-4000-8000-000000000004';
const configuration = {
    direction: 'target-to-source',
    mode: 'saved-first',
    scope: { type: 'all' },
} as const;
const batch: SentencePreparationBatch = {
    id: batchId,
    entryIds: [entryId],
    preparedEntryIds: [entryId],
    exerciseIds: [exerciseId],
    state: 'ready',
};
const run: SentencePreparation = {
    id,
    dictionaryId: id,
    direction: 'target-to-source',
    mode: 'saved-first',
    state: 'running',
    pauseReason: null,
    eligibleCount: 2,
    preparedCount: 1,
    reusedExerciseCount: 1,
    generatedExerciseCount: 0,
    initialBatch: batch,
    batchCount: 1,
    activeJobId: null,
    createdAt: '2026-10-07T00:00:00.000Z',
    updatedAt: '2026-10-07T00:00:00.000Z',
};
const uncertain = new ApiError(0, {
    code: 'service_unavailable',
    correlationId: 'test',
    message: 'Unknown request outcome.',
});
async function flush() {
    for (let i = 0; i < 12; i++) await Promise.resolve();
}
function api() {
    return {
        startPreparation: vi.fn().mockResolvedValue({ preparation: run }),
        getPreparation: vi.fn().mockResolvedValue({ preparation: run }),
        commandPreparation: vi.fn().mockResolvedValue({
            preparation: { ...run, state: 'paused', pauseReason: 'user' },
        }),
        preparationBatches: vi
            .fn()
            .mockResolvedValue({ items: [batch], nextOffset: null }),
        listEntries: vi
            .fn()
            .mockResolvedValue({ entries: [], nextCursor: null }),
    };
}
function storeFor(
    client: ReturnType<typeof api>,
    identity = 'learner:owner:dictionary',
) {
    return new SentencePreparationStore(
        client as unknown as SentenceApi,
        identity,
    );
}
beforeEach(() => {
    vi.useFakeTimers();
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
        setItem: (key: string, value: string) => values.set(key, value),
        getItem: (key: string) => values.get(key) ?? null,
    });
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('durable sentence preparation', () => {
    it('retries an uncertain start with the identical operation ID after remount', async () => {
        const client = api();
        client.startPreparation.mockRejectedValueOnce(uncertain);
        const first = storeFor(client);
        first.enable();
        await flush();
        await first.start(configuration);
        expect(first.getSnapshot().uncertain).toBe(true);
        const admitted = client.startPreparation.mock.calls[0]![0];
        first.disable();
        const reconnected = storeFor(client);
        reconnected.enable();
        await flush();
        expect(client.startPreparation.mock.calls[1]![0]).toEqual(admitted);
        expect(reconnected.getSnapshot().preparation?.id).toBe(id);
        expect(reconnected.getSnapshot().batches[0]?.id).toBe(batchId);
        expect(reconnected.getSnapshot().uncertain).toBe(false);
        reconnected.disable();
    });
    it('closing the surface preserves recovery and reconnect performs reads only', async () => {
        const client = api();
        const first = storeFor(client);
        first.enable();
        await flush();
        await first.start(configuration);
        first.disable();
        expect(first.getSnapshot().preparation).toBeNull();
        const reconnected = storeFor(client);
        reconnected.enable();
        await flush();
        expect(client.startPreparation).toHaveBeenCalledTimes(1);
        expect(client.getPreparation).toHaveBeenCalledWith(id);
        expect(reconnected.getSnapshot().batches).toEqual([batch]);
        reconnected.disable();
    });
    it('keeps the selected explanation language when reconnecting prepared examples', async () => {
        const client = api();
        const first = storeFor(client);
        first.enable();
        await flush();
        await first.start({ ...configuration, explanationLanguage: 'fr' });
        first.disable();
        const restored = storeFor(client);
        restored.enable();
        await flush();
        expect(restored.getSnapshot().explanationLanguage).toBe('fr');
        restored.disable();
    });
    it('does not create another preparation while one is active', async () => {
        const client = api();
        const store = storeFor(client);
        store.enable();
        await flush();
        await store.start(configuration);
        await store.start(configuration);
        expect(client.startPreparation).toHaveBeenCalledTimes(1);
        expect(client.getPreparation).toHaveBeenCalledTimes(1);
        store.disable();
    });
    it('replays an uncertain stop without sending a new command operation', async () => {
        const client = api();
        const store = storeFor(client);
        store.enable();
        await flush();
        await store.start(configuration);
        client.commandPreparation.mockRejectedValueOnce(uncertain);
        await store.stop();
        expect(store.getSnapshot().uncertain).toBe(true);
        const command = client.commandPreparation.mock.calls[0]![1];
        await store.refresh();
        expect(client.commandPreparation.mock.calls[1]![1]).toEqual(command);
        expect(store.getSnapshot().preparation?.state).toBe('paused');
        await vi.advanceTimersByTimeAsync(10_000);
        expect(client.commandPreparation).toHaveBeenCalledTimes(2);
        store.disable();
    });
    it('refreshes every loaded batch page without collapsing later rounds', async () => {
        const client = api();
        const firstPage = Array.from({ length: 25 }, () => batch);
        const later = {
            ...batch,
            id: exerciseId,
            preparedEntryIds: [],
            exerciseIds: [],
            state: 'pending' as const,
        };
        client.preparationBatches.mockImplementation(
            async (_id: string, query: { offset: number }) =>
                query.offset === 0
                    ? { items: firstPage, nextOffset: 25 }
                    : { items: [later], nextOffset: null },
        );
        const store = storeFor(client);
        store.enable();
        await flush();
        await store.start(configuration);
        await store.loadMore();
        expect(store.getSnapshot().batches).toHaveLength(26);
        client.preparationBatches.mockImplementation(
            async (_id: string, query: { offset: number }) =>
                query.offset === 0
                    ? { items: firstPage, nextOffset: 25 }
                    : {
                          items: [
                              {
                                  ...later,
                                  preparedEntryIds: [entryId],
                                  exerciseIds: [exerciseId],
                                  state: 'ready',
                              },
                          ],
                          nextOffset: null,
                      },
        );
        await store.refresh();
        expect(store.getSnapshot().batches).toHaveLength(26);
        expect(store.getSnapshot().batches[25]).toMatchObject({
            id: exerciseId,
            state: 'ready',
            preparedEntryIds: [entryId],
        });
        expect(store.getSnapshot().nextOffset).toBeNull();
        store.disable();
    });
    it('hides ready batches when the retained preparation becomes stale', async () => {
        const client = api();
        const store = storeFor(client);
        store.enable();
        await flush();
        await store.start(configuration);
        client.getPreparation.mockResolvedValue({
            preparation: {
                ...run,
                state: 'paused',
                pauseReason: 'stale',
                initialBatch: null,
                batchCount: 0,
            },
        });
        await store.refresh();
        expect(store.getSnapshot().batches).toEqual([]);
        expect(client.preparationBatches).toHaveBeenCalledTimes(1);
        store.disable();
    });
    it('does not expose another learner’s retained progress', async () => {
        const client = api();
        const first = storeFor(client, 'learnerA:dictionary');
        first.enable();
        await flush();
        await first.start(configuration);
        first.disable();
        const other = storeFor(client, 'learnerB:dictionary');
        other.enable();
        await flush();
        expect(other.getSnapshot().preparation).toBeNull();
        expect(client.getPreparation).not.toHaveBeenCalled();
        other.disable();
    });
    it('suppresses stale async results when access is disabled', async () => {
        const client = api();
        const store = storeFor(client);
        store.enable();
        await flush();
        let resolve!: (value: unknown) => void;
        client.startPreparation.mockImplementationOnce(
            () =>
                new Promise((done) => {
                    resolve = done;
                }),
        );
        const pending = store.start(configuration);
        store.disable();
        resolve({ preparation: run });
        await pending;
        expect(store.getSnapshot().preparation).toBeNull();
        expect(client.preparationBatches).not.toHaveBeenCalled();
    });
    it('clears protected progress and recovery when authorization is lost', async () => {
        const client = api();
        const store = storeFor(client);
        store.enable();
        await flush();
        await store.start(configuration);
        client.getPreparation.mockRejectedValue(
            new ApiError(401, {
                code: 'authentication_required',
                correlationId: 'test',
                message: 'Sign in.',
            }),
        );
        await store.refresh();
        expect(store.getSnapshot().preparation).toBeNull();
        expect(store.getSnapshot().batches).toEqual([]);
        expect(
            JSON.parse(
                localStorage.getItem(
                    'languon:sentence-preparation:v1:learner:owner:dictionary',
                )!,
            ),
        ).toEqual({});
        store.disable();
    });
});
