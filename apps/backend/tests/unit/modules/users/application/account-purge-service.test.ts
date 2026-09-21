import { describe, expect, it, vi } from 'vitest';

import { AccountPurgeService } from '../../../../../src/modules/users/application/account-purge-service';
import type { AccountPurgeStore } from '../../../../../src/modules/users/application/ports/account-purge-store';

function fixture() {
    const store = {
        claimDue: vi
            .fn()
            .mockResolvedValue({ fencingToken: 3, userId: 'user-1' }),
        inspectOwner: vi.fn().mockResolvedValue({ activeJobs: 0, objects: [] }),
        renew: vi.fn().mockResolvedValue(true),
        finish: vi.fn().mockResolvedValue(true),
        retry: vi.fn().mockResolvedValue(undefined),
        releaseWorkerLeases: vi.fn().mockResolvedValue(undefined),
    } satisfies AccountPurgeStore;
    const storage = { removeAllVersions: vi.fn().mockResolvedValue(undefined) };
    const service = new AccountPurgeService(store, storage);
    const input = {
        now: new Date('2026-09-15T00:00:00Z'),
        signal: new AbortController().signal,
        workerId: 'worker-1',
    };
    return { input, service, storage, store };
}

describe('AccountPurgeService', () => {
    it('fails closed for audio inventory when no audio storage adapter is available', async () => {
        const { input, service, store } = fixture();
        store.inspectOwner.mockResolvedValue({
            activeJobs: 0,
            objects: [
                {
                    kind: 'pronunciation-audio',
                    cleanupState: 'complete',
                    reference: {
                        backend: 's3',
                        namespace: 'audio',
                        key: 'asset',
                    },
                },
            ],
        });
        await expect(service.processNext(input)).rejects.toThrow(
            'Pronunciation storage is unavailable',
        );
        expect(store.finish).not.toHaveBeenCalled();
    });

    it('dispatches audio references separately and waits for physical deletion', async () => {
        const { input, store, storage } = fixture();
        const removeAudioVersions = vi
            .fn()
            .mockRejectedValue(new Error('retained version'));
        const reference = {
            backend: 's3' as const,
            namespace: 'audio',
            key: 'asset',
        };
        store.inspectOwner.mockResolvedValue({
            activeJobs: 0,
            objects: [
                {
                    kind: 'pronunciation-audio',
                    cleanupState: 'complete',
                    reference,
                },
            ],
        });
        const service = new AccountPurgeService(store, {
            ...storage,
            removeAudioVersions,
        });
        await expect(service.processNext(input)).rejects.toThrow(
            'retained version',
        );
        expect(removeAudioVersions).toHaveBeenCalledWith(
            reference,
            input.signal,
        );
        expect(storage.removeAllVersions).not.toHaveBeenCalled();
        expect(store.finish).not.toHaveBeenCalled();
        removeAudioVersions.mockResolvedValue(undefined);
        await expect(service.processNext(input)).resolves.toBe(true);
        expect(store.finish).toHaveBeenCalledOnce();
    });
    it('waits and retries without deletion while jobs remain active', async () => {
        const { input, service, storage, store } = fixture();
        store.inspectOwner.mockResolvedValue({ activeJobs: 1, objects: [] });
        await expect(service.processNext(input)).resolves.toBe(true);
        expect(storage.removeAllVersions).not.toHaveBeenCalled();
        expect(store.finish).not.toHaveBeenCalled();
        expect(store.retry).toHaveBeenCalledOnce();
    });

    it('does not remove an upload whose existing cleanup is not complete', async () => {
        const { input, service, storage, store } = fixture();
        store.inspectOwner.mockResolvedValue({
            activeJobs: 0,
            objects: [{ cleanupState: 'pending', objectKey: 'object-1' }],
        });
        await expect(service.processNext(input)).resolves.toBe(true);
        expect(storage.removeAllVersions).not.toHaveBeenCalled();
        expect(store.finish).not.toHaveBeenCalled();
    });

    it('removes and verifies every object before finalizing the tombstone', async () => {
        const { input, service, storage, store } = fixture();
        store.inspectOwner.mockResolvedValue({
            activeJobs: 0,
            objects: [
                { cleanupState: 'complete', objectKey: 'object-1' },
                { cleanupState: 'complete', objectKey: 'object-2' },
            ],
        });
        await expect(service.processNext(input)).resolves.toBe(true);
        expect(storage.removeAllVersions).toHaveBeenCalledTimes(2);
        expect(store.renew).toHaveBeenCalledTimes(2);
        expect(store.finish).toHaveBeenCalledOnce();
    });

    it('retries without finalizing after storage failure', async () => {
        const { input, service, storage, store } = fixture();
        store.inspectOwner.mockResolvedValue({
            activeJobs: 0,
            objects: [{ cleanupState: 'complete', objectKey: 'object-1' }],
        });
        storage.removeAllVersions.mockRejectedValue(
            new Error('storage unavailable'),
        );
        await expect(service.processNext(input)).rejects.toThrow(
            'storage unavailable',
        );
        expect(store.finish).not.toHaveBeenCalled();
        expect(store.retry).toHaveBeenCalledOnce();
    });
});
