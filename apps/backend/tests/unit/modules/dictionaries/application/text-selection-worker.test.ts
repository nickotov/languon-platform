import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextSelectionWorker } from '../../../../../src/modules/dictionaries/application/text-selection-worker';
import type {
    SelectionLease,
    TextSelectionStore,
} from '../../../../../src/modules/dictionaries/application/ports/text-selection-store';
import { selectionProviderInput } from '../../../../../src/modules/dictionaries/domain/text-selection';
import { defaultDictionarySettings } from '../../../../../src/modules/dictionaries/domain/settings';
import { defaultTextAiProviderBudgetPolicy } from '../../../../../src/modules/text-ai/application/text-ai-provider-catalog';
const lease: SelectionLease = {
    id: 'job',
    ownerId: 'owner',
    workerId: 'worker',
    attempt: 1,
    fencingToken: 1,
    execution: null,
    budget: defaultTextAiProviderBudgetPolicy,
    input: selectionProviderInput(
        {
            phrase: 'Hello',
            sentence: 'Hello world.',
            previousSentence: null,
            nextSentence: null,
            startOffset: 0,
            endOffset: 5,
            sourceLanguageTag: 'en',
            targetLanguageTag: 'es',
        },
        defaultDictionarySettings,
        null,
    ),
};
function fixture() {
    const store: TextSelectionStore = {
        enqueue: vi.fn(),
        read: vi.fn(),
        cancel: vi.fn(),
        claim: vi.fn().mockResolvedValue(lease),
        dispatch: vi.fn().mockResolvedValue(true),
        complete: vi.fn().mockResolvedValue(true),
        fail: vi.fn().mockResolvedValue(undefined),
        heartbeat: vi.fn().mockResolvedValue(true),
        releaseWorkerLeases: vi.fn().mockResolvedValue(undefined),
    };
    const generate = vi.fn().mockResolvedValue({ suggestions: [] });
    return {
        store,
        generate,
        worker: new TextSelectionWorker(store, { generate }, 'worker', 10, 50),
    };
}
describe('text selection worker cancellation and bounded provider execution', () => {
    afterEach(() => vi.useRealTimers());
    it.each(['rejected', 'ambiguous'])(
        'keeps conclusive fallback evidence separate from generic failure text (%s)',
        async (executionOutcome) => {
            const f = fixture();
            f.generate.mockRejectedValue(
                Object.assign(new Error('Synthetic provider HTTP failure'), {
                    executionOutcome,
                }),
            );
            await f.worker.processNext(new AbortController().signal);
            expect(f.store.fail).toHaveBeenCalledWith(
                lease,
                'provider_failure',
                undefined,
                executionOutcome === 'rejected'
                    ? 'conclusive-provider-failure'
                    : undefined,
            );
        },
    );
    it('does not dispatch when shutdown races the claim result', async () => {
        const { store, generate, worker } = fixture();
        const abort = new AbortController();
        vi.mocked(store.claim).mockImplementation(async () => {
            abort.abort();
            return lease;
        });
        expect(await worker.processNext(abort.signal)).toBe(true);
        expect(store.dispatch).not.toHaveBeenCalled();
        expect(generate).not.toHaveBeenCalled();
        expect(store.fail).toHaveBeenCalledOnce();
    });
    it('bounds a provider that ignores abort and does not later persist its result', async () => {
        vi.useFakeTimers();
        const { store, generate, worker } = fixture();
        let finish: (value: { suggestions: [] }) => void = () => {};
        generate.mockImplementation(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        );
        const work = worker.processNext(new AbortController().signal);
        await vi.advanceTimersByTimeAsync(51);
        expect(await work).toBe(true);
        expect(store.fail).toHaveBeenCalledWith(
            lease,
            'provider_timeout',
            undefined,
            undefined,
        );
        finish({ suggestions: [] });
        await Promise.resolve();
        expect(store.complete).not.toHaveBeenCalled();
    });
    it('aborts a pending provider when heartbeat loses lease authority', async () => {
        vi.useFakeTimers();
        const { store, generate, worker } = fixture();
        vi.mocked(store.heartbeat).mockResolvedValue(false);
        generate.mockImplementation(() => new Promise(() => {}));
        const work = worker.processNext(new AbortController().signal);
        await vi.advanceTimersByTimeAsync(11);
        expect(await work).toBe(true);
        expect(store.fail).toHaveBeenCalledOnce();
        expect(store.complete).not.toHaveBeenCalled();
    });
});
