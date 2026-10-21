import { describe, expect, it, vi } from 'vitest';
import {
    ownerScopedPortraitRequest,
    PortraitApiError,
    type PortraitSessionRequest,
} from '@/fsd/entities/learner-portrait';

function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    const promise = new Promise<T>((complete) => {
        resolve = complete;
    });
    return { promise, resolve };
}

const changedAccount = {
    status: 401,
    code: 'authentication_required',
    detail: { correlationId: 'portrait-owner-changed' },
};

describe('owner-scoped portrait requests', () => {
    it.each([null, 'owner-b'])(
        'rejects a stale or missing captured owner %s before session acquisition',
        async (owner) => {
            const requestWithSession = vi.fn();
            const operation = vi.fn();
            const request = ownerScopedPortraitRequest(
                owner,
                requestWithSession,
                () => 'owner-a',
            );
            await expect(request(operation)).rejects.toMatchObject(
                changedAccount,
            );
            expect(requestWithSession).not.toHaveBeenCalled();
            expect(operation).not.toHaveBeenCalled();
        },
    );

    it('does not execute a write when deferred session acquisition finishes under another account', async () => {
        let currentOwner = 'owner-a';
        const ready = deferred<void>();
        const requestWithSession: PortraitSessionRequest = async (
            operation,
        ) => {
            await ready.promise;
            return operation('owner-b-token');
        };
        const write = vi.fn().mockResolvedValue('personal-result');
        const request = ownerScopedPortraitRequest(
            'owner-a',
            requestWithSession,
            () => currentOwner,
        );
        const result = request(write);
        currentOwner = 'owner-b';
        ready.resolve();
        await expect(result).rejects.toMatchObject(changedAccount);
        expect(write).not.toHaveBeenCalled();
    });

    it('checks ownership again for a token callback retried after a 401', async () => {
        let currentOwner = 'owner-a';
        const expired = new PortraitApiError(401, {
            code: 'authentication_required',
            message: 'Session expired.',
            correlationId: 'expired-test-session',
        });
        const requestWithSession: PortraitSessionRequest = async (
            operation,
        ) => {
            try {
                return await operation('owner-a-expired-token');
            } catch (error) {
                if (error !== expired) throw error;
                currentOwner = 'owner-b';
                return operation('owner-b-fresh-token');
            }
        };
        const write = vi.fn().mockRejectedValue(expired);
        const request = ownerScopedPortraitRequest(
            'owner-a',
            requestWithSession,
            () => currentOwner,
        );
        await expect(request(write)).rejects.toMatchObject(changedAccount);
        expect(write).toHaveBeenCalledTimes(1);
        expect(write).toHaveBeenCalledWith('owner-a-expired-token');
    });

    it('does not return or cache a late success from the previous owner', async () => {
        let currentOwner = 'owner-a';
        const pending = deferred<string>();
        const requestWithSession: PortraitSessionRequest = (operation) =>
            operation('owner-a-token');
        const write = vi.fn(() => pending.promise);
        const cache = vi.fn();
        const request = ownerScopedPortraitRequest(
            'owner-a',
            requestWithSession,
            () => currentOwner,
        );
        const result = request(write).then(cache);
        currentOwner = 'owner-b';
        pending.resolve('private previous-owner result');
        const error = await result.catch((error) => error);
        expect(error).toMatchObject(changedAccount);
        expect(JSON.stringify(error)).not.toContain(
            'private previous-owner result',
        );
        expect(cache).not.toHaveBeenCalled();
    });

    it('checks ownership after the session coordinator itself defers the received result', async () => {
        let currentOwner = 'owner-a';
        const received = deferred<void>();
        const release = deferred<void>();
        const requestWithSession: PortraitSessionRequest = async (
            operation,
        ) => {
            const value = await operation('owner-a-token');
            received.resolve();
            await release.promise;
            return value;
        };
        const request = ownerScopedPortraitRequest(
            'owner-a',
            requestWithSession,
            () => currentOwner,
        );
        const cache = vi.fn();
        const result = request(async () => 'private result').then(cache);
        await received.promise;
        currentOwner = 'owner-b';
        release.resolve();
        await expect(result).rejects.toMatchObject(changedAccount);
        expect(cache).not.toHaveBeenCalled();
    });

    it('returns the operation result when its authenticated owner remains current', async () => {
        const requestWithSession: PortraitSessionRequest = (operation) =>
            operation('owner-a-token');
        const request = ownerScopedPortraitRequest(
            'owner-a',
            requestWithSession,
            () => 'owner-a',
        );
        const write = vi.fn().mockResolvedValue({ version: 3 });
        await expect(request(write)).resolves.toEqual({ version: 3 });
        expect(write).toHaveBeenCalledOnce();
    });
});
