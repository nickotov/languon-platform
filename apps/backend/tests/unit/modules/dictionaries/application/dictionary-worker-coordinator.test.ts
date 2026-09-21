import { describe, expect, it, vi } from 'vitest';
import { DictionaryWorkerCoordinator } from '../../../../../src/modules/dictionaries/application/dictionary-worker-coordinator';

describe('DictionaryWorkerCoordinator', () => {
    it('gives both continuously busy queues an equal turn', async () => {
        const proposals = { processNext: vi.fn().mockResolvedValue(true) };
        const audio = { runOnce: vi.fn().mockResolvedValue(true) };
        const coordinator = new DictionaryWorkerCoordinator(proposals, audio);
        for (let index = 0; index < 10; index++)
            await coordinator.processNext({
                signal: new AbortController().signal,
            });
        expect(proposals.processNext).toHaveBeenCalledTimes(5);
        expect(audio.runOnce).toHaveBeenCalledTimes(5);
    });
    it('uses the other queue when the first is empty, and respects cancellation', async () => {
        const proposals = { processNext: vi.fn().mockResolvedValue(true) };
        const audio = { runOnce: vi.fn().mockResolvedValue(false) };
        const coordinator = new DictionaryWorkerCoordinator(proposals, audio);
        await expect(
            coordinator.processNext({ signal: new AbortController().signal }),
        ).resolves.toBe(true);
        expect(proposals.processNext).toHaveBeenCalledOnce();
        const aborted = AbortSignal.abort();
        const empty = new DictionaryWorkerCoordinator(
            { processNext: vi.fn() },
            audio,
        );
        await expect(empty.processNext({ signal: aborted })).rejects.toThrow();
    });
});
