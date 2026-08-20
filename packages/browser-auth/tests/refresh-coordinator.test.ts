import type { AuthenticationSuccessResponse } from '@languon/contracts';
import { describe, expect, it, vi } from 'vitest';

import { BrowserRefreshCoordinator } from '../src/refresh-coordinator';

const response: AuthenticationSuccessResponse = {
    accessToken: 'aaa.bbb.ccc',
    accessTokenExpiresAt: '2026-08-20T11:00:00.000Z',
    session: {
        authenticatedAt: '2026-08-20T09:00:00.000Z',
        createdAt: '2026-08-20T09:00:00.000Z',
        expiresAt: '2026-09-03T09:00:00.000Z',
        id: '10000000-0000-4000-8000-000000000002',
        recentAuthenticationExpiresAt: '2026-08-20T09:05:00.000Z',
    },
    status: 'authenticated',
    tokenType: 'Bearer',
    user: {
        createdAt: '2026-08-20T09:00:00.000Z',
        emailVerified: true,
        id: '10000000-0000-4000-8000-000000000001',
        primaryEmail: 'owner@example.test',
        status: 'active',
    },
};

class SerialLocks {
    private tail = Promise.resolve();
    request<T>(_name: string, callback: () => Promise<T>): Promise<T> {
        const result = this.tail.then(callback);
        this.tail = result.then(
            () => undefined,
            () => undefined,
        );
        return result;
    }
}

describe('BrowserRefreshCoordinator', () => {
    it('shares one rotating refresh request within a browser tab', async () => {
        const coordinator = new BrowserRefreshCoordinator({
            namespace: 'languon-admin-auth',
        });
        const action = vi.fn(async () => response);

        await expect(
            Promise.all([
                coordinator.refresh(action),
                coordinator.refresh(action),
            ]),
        ).resolves.toEqual([response, response]);
        expect(action).toHaveBeenCalledOnce();
        coordinator.destroy();
    });

    it('uses a namespace-specific web lock for exclusive operations', async () => {
        const locks = new SerialLocks();
        const coordinator = new BrowserRefreshCoordinator({
            locks,
            namespace: 'languon-admin-auth',
        });
        let concurrent = 0;
        let maximum = 0;
        const action = () =>
            coordinator.runExclusive(async () => {
                concurrent += 1;
                maximum = Math.max(maximum, concurrent);
                await new Promise((resolve) => setTimeout(resolve, 2));
                concurrent -= 1;
            });

        await Promise.all([action(), action()]);
        expect(maximum).toBe(1);
        coordinator.destroy();
    });

    it('rejects empty or unstable coordination namespaces', () => {
        expect(() => new BrowserRefreshCoordinator({ namespace: 'x' })).toThrow(
            /stable browser refresh namespace/,
        );
    });
});
