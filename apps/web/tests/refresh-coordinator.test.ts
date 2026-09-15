import type { AuthenticationSuccessResponse } from '@languon/contracts';
import { describe, expect, it, vi } from 'vitest';

import { RefreshCoordinator } from '@/fsd/features/auth/model/refresh-coordinator';

interface EventLike {
    data: unknown;
}

type Listener = (event: EventLike) => void;

class ChannelHub {
    readonly channels = new Set<FakeChannel>();

    create(): FakeChannel {
        const channel = new FakeChannel(this);
        this.channels.add(channel);
        return channel;
    }
}

class FakeChannel {
    private readonly listeners = new Set<Listener>();
    constructor(private readonly hub: ChannelHub) {}
    addEventListener(_type: 'message', listener: Listener) {
        this.listeners.add(listener);
    }
    removeEventListener(_type: 'message', listener: Listener) {
        this.listeners.delete(listener);
    }
    close() {
        this.hub.channels.delete(this);
    }
    postMessage(data: unknown) {
        for (const channel of this.hub.channels) {
            if (channel !== this) channel.deliver(data);
        }
    }
    private deliver(data: unknown) {
        for (const listener of this.listeners) listener({ data });
    }
}

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

const response: AuthenticationSuccessResponse = {
    accessToken: 'aaa.bbb.ccc',
    accessTokenExpiresAt: '2026-08-14T10:00:00.000Z',
    session: {
        authenticatedAt: '2026-08-13T10:00:00.000Z',
        createdAt: '2026-08-13T10:00:00.000Z',
        expiresAt: '2026-08-27T10:00:00.000Z',
        id: '10000000-0000-4000-8000-000000000002',
        recentAuthenticationExpiresAt: '2026-08-13T10:05:00.000Z',
    },
    status: 'authenticated',
    tokenType: 'Bearer',
    user: {
        createdAt: '2026-08-13T10:00:00.000Z',
        emailVerified: true,
        handle: null,
        id: '10000000-0000-4000-8000-000000000001',
        primaryEmail: 'learner@example.com',
        status: 'active',
    },
};

describe('RefreshCoordinator', () => {
    it('shares one in-flight refresh within a tab', async () => {
        const coordinator = new RefreshCoordinator();
        const action = vi.fn(async () => response);

        const [first, second] = await Promise.all([
            coordinator.refresh(action),
            coordinator.refresh(action),
        ]);

        expect(action).toHaveBeenCalledOnce();
        expect(first).toEqual(response);
        expect(second).toEqual(response);
        coordinator.destroy();
    });

    it('uses a web lock and broadcast outcome to prevent two tab rotations', async () => {
        const hub = new ChannelHub();
        const locks = new SerialLocks();
        const first = new RefreshCoordinator({
            channel: hub.create(),
            id: 'a',
            locks,
        });
        const second = new RefreshCoordinator({
            channel: hub.create(),
            id: 'b',
            locks,
        });
        const firstAction = vi.fn(async () => response);
        const secondAction = vi.fn(async () => response);

        const outcomes = await Promise.all([
            first.refresh(firstAction),
            second.refresh(secondAction),
        ]);

        expect(outcomes).toEqual([response, response]);
        expect(firstAction).toHaveBeenCalledOnce();
        expect(secondAction).not.toHaveBeenCalled();
        first.destroy();
        second.destroy();
    });

    it('elects one tab when Web Locks are unavailable', async () => {
        const hub = new ChannelHub();
        const first = new RefreshCoordinator({
            channel: hub.create(),
            electionDelayMs: 1,
            id: 'b',
            outcomeTimeoutMs: 100,
        });
        const second = new RefreshCoordinator({
            channel: hub.create(),
            electionDelayMs: 1,
            id: 'a',
            outcomeTimeoutMs: 100,
        });
        const firstAction = vi.fn(async () => response);
        const secondAction = vi.fn(async () => response);

        const outcomes = await Promise.all([
            first.refresh(firstAction),
            second.refresh(secondAction),
        ]);

        expect(outcomes).toEqual([response, response]);
        expect(firstAction).not.toHaveBeenCalled();
        expect(secondAction).toHaveBeenCalledOnce();
        first.destroy();
        second.destroy();
    });

    it('broadcasts a stable signed-out outcome after refresh failure', async () => {
        const hub = new ChannelHub();
        const first = new RefreshCoordinator({
            channel: hub.create(),
            id: 'a',
        });
        const second = new RefreshCoordinator({
            channel: hub.create(),
            id: 'b',
        });
        const listener = vi.fn();
        second.subscribe(listener);

        await expect(
            first.refresh(async () => Promise.reject(new Error('401'))),
        ).resolves.toBeNull();
        expect(listener).toHaveBeenCalledWith(null);
        first.destroy();
        second.destroy();
    });

    it('waits for an already-refreshing peer when joining late', async () => {
        const hub = new ChannelHub();
        const first = new RefreshCoordinator({
            channel: hub.create(),
            electionDelayMs: 1,
            id: 'a',
            outcomeTimeoutMs: 100,
        });
        let release!: (value: AuthenticationSuccessResponse) => void;
        const firstAction = vi.fn(
            () =>
                new Promise<AuthenticationSuccessResponse>((resolve) => {
                    release = resolve;
                }),
        );
        const firstRefresh = first.refresh(firstAction);
        await new Promise((resolve) => setTimeout(resolve, 5));

        const second = new RefreshCoordinator({
            channel: hub.create(),
            electionDelayMs: 1,
            id: 'b',
            outcomeTimeoutMs: 100,
        });
        const secondAction = vi.fn(async () => response);
        const secondRefresh = second.refresh(secondAction);
        await new Promise((resolve) => setTimeout(resolve, 5));
        release(response);

        await expect(
            Promise.all([firstRefresh, secondRefresh]),
        ).resolves.toEqual([response, response]);
        expect(firstAction).toHaveBeenCalledOnce();
        expect(secondAction).not.toHaveBeenCalled();
        first.destroy();
        second.destroy();
    });

    it.each(['failure', 'success'] as const)(
        'does not let an older refresh %s overwrite newer authentication',
        async (resolution) => {
            const hub = new ChannelHub();
            const coordinator = new RefreshCoordinator({
                channel: hub.create(),
                electionDelayMs: 1,
            });
            let resolve!: (value: AuthenticationSuccessResponse) => void;
            let reject!: (reason: Error) => void;
            const olderRefresh = coordinator.refresh(
                () =>
                    new Promise<AuthenticationSuccessResponse>(
                        (resolvePromise, rejectPromise) => {
                            resolve = resolvePromise;
                            reject = rejectPromise;
                        },
                    ),
            );
            const newerResponse = {
                ...response,
                accessToken: 'newer.token.value',
                user: {
                    ...response.user,
                    id: '20000000-0000-4000-8000-000000000001',
                    primaryEmail: 'newer@example.com',
                },
            } satisfies AuthenticationSuccessResponse;

            await new Promise((wait) => setTimeout(wait, 5));
            coordinator.publishAuthenticated(newerResponse);
            if (resolution === 'success') resolve(response);
            else reject(new Error('old refresh failed'));

            await expect(olderRefresh).resolves.toEqual(newerResponse);
            coordinator.destroy();
        },
    );
});
