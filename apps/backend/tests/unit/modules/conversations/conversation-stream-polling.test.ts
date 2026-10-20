import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
    ConversationDetail,
    ConversationEvent,
    ConversationTurn,
} from '@languon/contracts';
import { ConversationService } from '../../../../src/modules/conversations/application/conversation-service';
import type { ConversationStore } from '../../../../src/modules/conversations/application/ports/conversation-store';
import { ConversationError } from '../../../../src/modules/conversations/domain/conversation';
import { createConversationRoutes } from '../../../../src/modules/conversations/interface/http/conversation.routes';
import { AuthHttpPolicy } from '../../../../src/modules/authentication/interface/http/auth-http-policy';
import { AuthenticationRequiredError } from '../../../../src/modules/authentication/application/authentication-errors';
import {
    RateLimitUnavailableError,
    type ConcurrentRequestLimiter,
    type RateLimiter,
} from '../../../../src/modules/authentication/application/ports/rate-limiter';

const conversationId = '00000000-0000-4000-8000-000000000001';
const turn: ConversationTurn = {
    id: '00000000-0000-4000-8000-000000000002',
    conversationId,
    modelId: null,
    status: 'running',
    failureCode: null,
    usage: {
        inputTokens: 0,
        outputTokens: 0,
        chargedCredits: '0',
        estimated: false,
    },
    createdAt: '2026-10-19T00:00:00Z',
    updatedAt: '2026-10-19T00:00:00Z',
};
const detail: ConversationDetail = {
    conversation: {
        id: conversationId,
        title: null,
        source: { id: conversationId, kind: 'dictionary' },
        preferences: {
            replyLanguage: 'auto',
            tone: 'neutral',
            explanationLevel: 'auto',
        },
        version: 1,
        createdAt: '2026-10-19T00:00:00Z',
        updatedAt: '2026-10-19T00:00:00Z',
    },
    messages: [],
    turns: [],
    drafts: [],
};
function fixture(
    readEvents = async (): Promise<ConversationEvent[]> => [
        {
            id: 0,
            conversationId,
            type: 'snapshot',
            data: detail,
            createdAt: new Date().toISOString(),
        },
    ],
) {
    const events = vi.fn<ConversationStore['events']>(readEvents),
        authenticate = vi.fn(async () => ({ userId: conversationId }));
    const consume = vi.fn<RateLimiter['consume']>(async () => ({
        allowed: true,
        limit: 240,
        remaining: 239,
        retryAfterSeconds: 0,
    }));
    const readDetail = vi.fn(async () => detail);
    const release = vi.fn(async () => {});
    const acquireLease = vi.fn<ConcurrentRequestLimiter['acquireLease']>(
        async () => ({ release }),
    );
    const store = {
        detail: readDetail,
        events,
    } as unknown as ConversationStore;
    const service = new ConversationService(
        store,
        authenticate,
        {
            consume,
            linkSubject: async () => {},
        },
        { acquireLease },
    );
    const app = createConversationRoutes({
        service,
        policy: new AuthHttpPolicy({
            allowedOrigins: ['http://localhost:3333'],
            appEnvironment: 'test',
            refreshTokenTtlSeconds: 3600,
        }),
    });
    return {
        app,
        authenticate,
        consume,
        events,
        acquireLease,
        release,
        readDetail,
        service,
    };
}
afterEach(() => {
    vi.useRealTimers();
});
describe('durable conversation stream polling policy', () => {
    it('polls active turns every125ms then returns to idle cadence on completion', async () => {
        vi.useFakeTimers();
        const activeDetail = { ...detail, turns: [turn] };
        const { app, readDetail, events, authenticate } = fixture(
            async () => [],
        );
        readDetail.mockResolvedValue(activeDetail);
        events.mockResolvedValueOnce([
            {
                id: 5,
                conversationId,
                type: 'snapshot',
                data: activeDetail,
                createdAt: turn.createdAt,
            },
        ]);
        const response = await app.request(
            `/conversations/${conversationId}/events`,
            {
                headers: { Authorization: 'Bearer a.b.c' },
            },
        );
        const reader = response.body!.getReader();
        try {
            await reader.read();
            await vi.advanceTimersByTimeAsync(124);
            expect(events).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(1);
            expect(events).toHaveBeenCalledTimes(2);
            await reader.read();
            events.mockResolvedValueOnce([
                {
                    id: 6,
                    conversationId,
                    type: 'turn',
                    data: { ...turn, status: 'succeeded' },
                    createdAt: turn.createdAt,
                },
            ]);
            await vi.advanceTimersByTimeAsync(125);
            expect(events).toHaveBeenCalledTimes(3);
            await reader.read();
            await vi.advanceTimersByTimeAsync(0);
            await vi.advanceTimersByTimeAsync(999);
            expect(events).toHaveBeenCalledTimes(3);
            await vi.advanceTimersByTimeAsync(1);
            expect(events).toHaveBeenCalledTimes(4);
            expect(authenticate).toHaveBeenCalledTimes(5);
        } finally {
            await reader.cancel();
        }
    });
    it('seeds active cadence from initial detail before any turn event arrives', async () => {
        vi.useFakeTimers();
        const { app, readDetail, events } = fixture(async () => []);
        readDetail.mockResolvedValue({
            ...detail,
            turns: [{ ...turn, status: 'queued' }],
        });
        const response = await app.request(
            `/conversations/${conversationId}/events`,
            {
                headers: { Authorization: 'Bearer a.b.c' },
            },
        );
        const reader = response.body!.getReader();
        try {
            await reader.read();
            await vi.advanceTimersByTimeAsync(125);
            expect(events).toHaveBeenCalledTimes(2);
        } finally {
            await reader.cancel();
        }
    });
    it('drains saturated replay promptly with a fresh authorization check and forward cursor', async () => {
        vi.useFakeTimers();
        const batch: ConversationEvent[] = Array.from(
            { length: 100 },
            (_, index) => ({
                id: index + 1,
                conversationId,
                type: 'turn',
                data: turn,
                createdAt: turn.createdAt,
            }),
        );
        const { app, events, authenticate } = fixture(async () => []);
        events.mockResolvedValueOnce(batch);
        const response = await app.request(
            `/conversations/${conversationId}/events?after=1`,
            {
                headers: { Authorization: 'Bearer a.b.c' },
            },
        );
        const reader = response.body!.getReader();
        try {
            for (let index = 0; index < 100; index++) await reader.read();
            await vi.advanceTimersByTimeAsync(0);
            expect(events).toHaveBeenCalledTimes(2);
            expect(events.mock.calls[1]?.[2]).toBe(100);
            expect(authenticate).toHaveBeenCalledTimes(3);
            await vi.advanceTimersByTimeAsync(124);
            expect(events).toHaveBeenCalledTimes(2);
        } finally {
            await reader.cancel();
        }
    });
    it('revalidates active streams before reading another batch after session revocation', async () => {
        vi.useFakeTimers();
        const { app, readDetail, events, authenticate, release } = fixture(
            async () => [],
        );
        readDetail.mockResolvedValue({ ...detail, turns: [turn] });
        const response = await app.request(
            `/conversations/${conversationId}/events`,
            {
                headers: { Authorization: 'Bearer a.b.c' },
            },
        );
        const reader = response.body!.getReader();
        await reader.read();
        authenticate.mockRejectedValueOnce(new AuthenticationRequiredError());
        await vi.advanceTimersByTimeAsync(125);
        expect(events).toHaveBeenCalledTimes(1);
        expect(new TextDecoder().decode((await reader.read()).value)).toContain(
            '"status":401',
        );
        expect(release).toHaveBeenCalledTimes(1);
        await reader.cancel();
    });
    it('never spins on unchanged zero-id snapshots while a turn is active', async () => {
        vi.useFakeTimers();
        const activeDetail = { ...detail, turns: [turn] };
        const { app, events } = fixture(async () => [
            {
                id: 0,
                conversationId,
                type: 'snapshot',
                data: activeDetail,
                createdAt: turn.createdAt,
            },
        ]);
        const response = await app.request(
            `/conversations/${conversationId}/events`,
            {
                headers: { Authorization: 'Bearer a.b.c' },
            },
        );
        const reader = response.body!.getReader();
        try {
            await reader.read();
            await vi.advanceTimersByTimeAsync(125);
            const frame = new TextDecoder().decode((await reader.read()).value);
            expect(frame).toContain('event: heartbeat');
            expect(frame).not.toContain('snapshot');
            await vi.advanceTimersByTimeAsync(124);
            expect(events).toHaveBeenCalledTimes(2);
        } finally {
            await reader.cancel();
        }
    });
    it('does not busy-loop a full non-progressing replay page', async () => {
        vi.useFakeTimers();
        const { app, events } = fixture(async () =>
            Array.from({ length: 100 }, () => ({
                id: 7,
                conversationId,
                type: 'turn',
                data: turn,
                createdAt: turn.createdAt,
            })),
        );
        const response = await app.request(
            `/conversations/${conversationId}/events?after=7`,
            {
                headers: { Authorization: 'Bearer a.b.c' },
            },
        );
        const reader = response.body!.getReader();
        try {
            for (let index = 0; index < 100; index++) await reader.read();
            await vi.advanceTimersByTimeAsync(124);
            expect(events).toHaveBeenCalledTimes(1);
        } finally {
            await reader.cancel();
        }
    });
    it('does not emit an in-flight batch that returns after stream expiry', async () => {
        vi.useFakeTimers();
        let entered!: () => void, resume!: () => void;
        const started = new Promise<void>((resolve) => {
            entered = resolve;
        });
        const waiting = new Promise<void>((resolve) => {
            resume = resolve;
        });
        const { app, release } = fixture(async () => {
            entered();
            await waiting;
            return [
                {
                    id: 1,
                    conversationId,
                    type: 'turn',
                    data: turn,
                    createdAt: turn.createdAt,
                },
            ];
        });
        const response = await app.request(
            `/conversations/${conversationId}/events`,
            {
                headers: { Authorization: 'Bearer a.b.c' },
            },
        );
        await started;
        await vi.advanceTimersByTimeAsync(240_000);
        expect(release).toHaveBeenCalledTimes(1);
        resume();
        expect(await response.text()).toBe('');
        expect(release).toHaveBeenCalledTimes(1);
    });
    it('fails before polling when stream capacity or Redis admission is unavailable', async () => {
        for (const mode of [
            'full',
            'unavailable',
            'quota-unavailable',
        ] as const) {
            const { app, acquireLease, events, readDetail, consume } =
                fixture();
            if (mode === 'full') acquireLease.mockResolvedValueOnce(null);
            else if (mode === 'quota-unavailable')
                consume.mockRejectedValueOnce(new RateLimitUnavailableError());
            else
                acquireLease.mockRejectedValueOnce(
                    new Error('Private Redis connection details'),
                );
            const response = await app.request(
                `/conversations/${conversationId}/events`,
                { headers: { Authorization: 'Bearer a.b.c' } },
            );
            expect(response.status).toBe(503);
            expect(await response.json()).toMatchObject({
                error: {
                    code:
                        mode === 'full'
                            ? 'capacity_unavailable'
                            : 'service_unavailable',
                },
            });
            expect(events).not.toHaveBeenCalled();
            expect(readDetail).not.toHaveBeenCalled();
        }
    });
    it('separately rate limits new streams without acquiring a lease or polling', async () => {
        const { app, consume, acquireLease, events } = fixture();
        consume.mockResolvedValueOnce({
            allowed: true,
            limit: 240,
            remaining: 239,
            retryAfterSeconds: 0,
        });
        consume.mockResolvedValueOnce({
            allowed: false,
            limit: 12,
            remaining: 0,
            retryAfterSeconds: 60,
        });
        const response = await app.request(
            `/conversations/${conversationId}/events`,
            { headers: { Authorization: 'Bearer a.b.c' } },
        );
        expect(response.status).toBe(429);
        expect(await response.json()).toMatchObject({
            error: { code: 'rate_limited' },
        });
        expect(acquireLease).not.toHaveBeenCalled();
        expect(events).not.toHaveBeenCalled();
    });
    it('releases a lease exactly once when initial source setup rejects', async () => {
        const { app, release, readDetail, events } = fixture();
        readDetail.mockRejectedValueOnce(
            new ConversationError(
                'conversation_not_found',
                'Source unavailable',
            ),
        );
        const response = await app.request(
            `/conversations/${conversationId}/events`,
            { headers: { Authorization: 'Bearer a.b.c' } },
        );
        expect(response.status).toBe(404);
        expect(release).toHaveBeenCalledTimes(1);
        expect(events).not.toHaveBeenCalled();
    });
    it('releases immediately when the request aborts during initial source setup', async () => {
        const { app, release, readDetail, events } = fixture();
        let entered!: () => void, resume!: () => void;
        const pendingSetup = new Promise<void>((resolve) => {
            resume = resolve;
        });
        const started = new Promise<void>((resolve) => {
            entered = resolve;
        });
        readDetail.mockImplementationOnce(async () => {
            entered();
            await pendingSetup;
            return detail;
        });
        const controller = new AbortController();
        const response = app.request(
            `/conversations/${conversationId}/events`,
            {
                signal: controller.signal,
                headers: { Authorization: 'Bearer a.b.c' },
            },
        );
        await started;
        controller.abort();
        expect(release).toHaveBeenCalledTimes(1);
        resume();
        await response;
        expect(release).toHaveBeenCalledTimes(1);
        expect(events).not.toHaveBeenCalled();
    });
    it('releases at the finite stream deadline and keeps polling admission uncharged', async () => {
        vi.useFakeTimers();
        const { app, release, consume } = fixture();
        const response = await app.request(
            `/conversations/${conversationId}/events`,
            { headers: { Authorization: 'Bearer a.b.c' } },
        );
        const draining = response.text();
        await vi.advanceTimersByTimeAsync(240_000);
        await draining;
        expect(release).toHaveBeenCalledTimes(1);
        expect(consume).toHaveBeenCalledTimes(2);
    });
    it('does not expose release outages or create an unhandled stream error', async () => {
        const { app, release } = fixture(async () => {
            throw new Error('Transient source failure');
        });
        release.mockRejectedValueOnce(
            new Error('Private Redis release details'),
        );
        const response = await app.request(
            `/conversations/${conversationId}/events`,
            { headers: { Authorization: 'Bearer a.b.c' } },
        );
        expect(await response.text()).toBe('');
        expect(release).toHaveBeenCalledTimes(1);
    });
    it('does not start a source poll after a stalled session check outlives the stream lease', async () => {
        vi.useFakeTimers();
        const { app, release, authenticate, events } = fixture();
        let entered!: () => void, resume!: () => void;
        const waiting = new Promise<void>((resolve) => {
            resume = resolve;
        });
        const started = new Promise<void>((resolve) => {
            entered = resolve;
        });
        authenticate.mockResolvedValueOnce({ userId: conversationId });
        authenticate.mockImplementationOnce(async () => {
            entered();
            await waiting;
            return { userId: conversationId };
        });
        const response = await app.request(
            `/conversations/${conversationId}/events`,
            { headers: { Authorization: 'Bearer a.b.c' } },
        );
        await started;
        await vi.advanceTimersByTimeAsync(240_000);
        expect(release).toHaveBeenCalledTimes(1);
        resume();
        expect(await response.text()).toBe('');
        expect(events).not.toHaveBeenCalled();
        expect(release).toHaveBeenCalledTimes(1);
    });
    it('charges each connection once, revalidates every poll, and sends one empty snapshot followed by heartbeats', async () => {
        vi.useFakeTimers();
        const { app, authenticate, consume, events, release, acquireLease } =
            fixture();
        const readers = await Promise.all(
            Array.from({ length: 4 }, async () => {
                const response = await app.request(
                    `/conversations/${conversationId}/events`,
                    { headers: { Authorization: 'Bearer a.b.c' } },
                );
                return response.body!.getReader();
            }),
        );
        try {
            for (const reader of readers)
                expect(
                    new TextDecoder().decode((await reader.read()).value),
                ).toContain('"type":"snapshot"');
            for (let poll = 0; poll < 3; poll++) {
                await vi.advanceTimersByTimeAsync(1000);
                for (const reader of readers) {
                    const frame = new TextDecoder().decode(
                        (await reader.read()).value,
                    );
                    expect(frame).toContain('event: heartbeat');
                    expect(frame).not.toContain('"type":"snapshot"');
                }
            }
            expect(consume).toHaveBeenCalledTimes(8);
            expect(
                consume.mock.calls.filter(
                    ([request]) => request.scope === 'contextual-assistant',
                ),
            ).toHaveLength(4);
            expect(
                consume.mock.calls.filter(
                    ([request]) =>
                        request.scope ===
                        'contextual-assistant-stream-admission',
                ),
            ).toHaveLength(4);
            expect(acquireLease).toHaveBeenCalledTimes(4);
            expect(acquireLease.mock.calls[0]?.[0]).toMatchObject({
                limit: 8,
                ttlMs: 300_000,
            });
            expect(events).toHaveBeenCalledTimes(16);
            expect(authenticate).toHaveBeenCalledTimes(20);
        } finally {
            await Promise.all(readers.map((reader) => reader.cancel()));
        }
        expect(release).toHaveBeenCalledTimes(4);
    });
    it.each([
        [new Error('Disposable database transient failure'), undefined],
        [
            new ConversationError(
                'conversation_not_found',
                'Source unavailable',
            ),
            404,
        ],
        [new AuthenticationRequiredError(), 401],
    ] as const)(
        'classifies stream failure without turning transient errors into access loss (%s)',
        async (failure, status) => {
            const { app, release } = fixture(async () => {
                throw failure;
            });
            const response = await app.request(
                `/conversations/${conversationId}/events`,
                { headers: { Authorization: 'Bearer a.b.c' } },
            );
            const body = await response.text();
            expect(body).not.toContain('event: error');
            expect(body).not.toContain(failure.message);
            if (status) {
                expect(body).toContain('event: unavailable');
                expect(body).toContain(`"status":${status}`);
            } else expect(body).not.toContain('unavailable');
            expect(release).toHaveBeenCalledTimes(1);
        },
    );
});
