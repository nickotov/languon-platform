import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AuthHttpPolicy } from '../../../../src/modules/authentication/interface/http/auth-http-policy';
import { ConversationError } from '../../../../src/modules/conversations/domain/conversation';
import { createConversationRoutes } from '../../../../src/modules/conversations/interface/http/conversation.routes';

function composedRoutes() {
    // These middleware composition cases never execute a business handler.
    const conversations = createConversationRoutes({
        service: {} as never,
        policy: new AuthHttpPolicy({
            allowedOrigins: ['http://localhost:3333'],
            appEnvironment: 'test',
            refreshTokenTtlSeconds: 3600,
        }),
    });
    const app = new Hono();
    app.route('/', conversations);
    app.post('/dictionary-upload', async (c) =>
        c.json({ size: (await c.req.text()).length }),
    );
    app.options('/dictionary-upload', (c) =>
        c.json({ owner: 'dictionary-upload' }, 202),
    );
    return app;
}

describe('conversation router mounting boundaries', () => {
    it('leaves unrelated upload limits, CORS and preflight ownership with their router', async () => {
        const app = composedRoutes();
        const payload = 'x'.repeat(1_200_000);
        const response = await app.request('/dictionary-upload', {
            method: 'POST',
            headers: {
                Origin: 'http://unrelated-origin.example',
                'Content-Length': String(payload.length),
            },
            body: payload,
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ size: payload.length });
        expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
        const preflight = await app.request('/dictionary-upload', {
            method: 'OPTIONS',
        });
        expect(preflight.status).toBe(202);
        expect(await preflight.json()).toEqual({ owner: 'dictionary-upload' });
    });
    it('retains the conversation namespace body limit and supported preflight headers', async () => {
        const app = composedRoutes();
        const payload = 'x'.repeat(1_200_000);
        const response = await app.request('/conversations', {
            method: 'POST',
            headers: { 'Content-Length': String(payload.length) },
            body: payload,
        });
        expect(response.status).toBe(413);
        for (const path of [
            '/conversations',
            '/conversations/00000000-0000-4000-8000-000000000001/events',
            '/conversation-settings',
        ]) {
            const preflight = await app.request(path, {
                method: 'OPTIONS',
                headers: { Origin: 'http://localhost:3333' },
            });
            expect(preflight.status).toBe(204);
            expect(
                preflight.headers.get('Access-Control-Allow-Headers'),
            ).toContain('Last-Event-ID');
        }
    });
});

it('keeps live SSE private and prevents proxy compression from buffering small batches', async () => {
    const app = createConversationRoutes({
        service: {
            access: async () => ({
                ownerId: '00000000-0000-4000-8000-000000000002',
            }),
            revalidate: async () => ({
                ownerId: '00000000-0000-4000-8000-000000000002',
            }),
            admitStream: async () => ({ release: async () => {} }),
            admitSubmission: async () => ({ release: async () => {} }),
            store: {
                detail: async () => ({ turns: [] }),
                events: async () => [],
            },
        } as never,
        policy: new AuthHttpPolicy({
            allowedOrigins: ['http://localhost:3333'],
            appEnvironment: 'test',
            refreshTokenTtlSeconds: 3600,
        }),
    });
    const response = await app.request(
        '/conversations/00000000-0000-4000-8000-000000000001/events',
        { headers: { Authorization: 'Bearer synthetic.test.token' } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe(
        'private, no-store, no-transform',
    );
    expect(response.headers.get('X-Accel-Buffering')).toBe('no');
    const reader = response.body!.getReader();
    try {
        const first = await reader.read();
        expect(new TextDecoder().decode(first.value)).toContain(
            'event: heartbeat',
        );
    } finally {
        await reader.cancel();
    }
});

it('backs off unchanged queued streams, then polls running output quickly with fresh authorization', async () => {
    vi.useFakeTimers();
    const turnId = '00000000-0000-4000-8000-000000000003';
    const revalidate = vi.fn(async () => ({ ownerId: 'learner' }));
    let eventCalls = 0;
    const events = vi.fn(async () => {
        const call = ++eventCalls;
        if (call === 5 || call === 6)
            return [
                {
                    id: call,
                    type: 'turn',
                    data: {
                        id: turnId,
                        status: call === 5 ? 'running' : 'succeeded',
                    },
                },
            ];
        return [];
    });
    const app = createConversationRoutes({
        service: {
            access: async () => ({ ownerId: 'learner' }),
            revalidate,
            admitStream: async () => ({ release: async () => {} }),
            admitSubmission: async () => ({ release: async () => {} }),
            store: {
                detail: async () => ({
                    turns: [{ id: turnId, status: 'queued' }],
                }),
                events,
            },
        } as never,
        policy: new AuthHttpPolicy({
            allowedOrigins: ['http://localhost:3333'],
            appEnvironment: 'test',
            refreshTokenTtlSeconds: 3600,
        }),
    });
    const response = await app.request(
        '/conversations/00000000-0000-4000-8000-000000000001/events',
        { headers: { Authorization: 'Bearer synthetic.test.token' } },
    );
    const reader = response.body!.getReader();
    const drain = (async () => {
        while (!(await reader.read()).done) {
            /* Drain SSE backpressure. */
        }
    })();
    try {
        await vi.advanceTimersByTimeAsync(375);
        expect(events).toHaveBeenCalledTimes(4);
        await vi.advanceTimersByTimeAsync(749);
        expect(events).toHaveBeenCalledTimes(4);
        await vi.advanceTimersByTimeAsync(251);
        expect(events.mock.calls.length).toBeGreaterThanOrEqual(5);
        expect(events.mock.calls.length).toBeLessThanOrEqual(6);
        await vi.advanceTimersByTimeAsync(125);
        expect(events).toHaveBeenCalledTimes(6);
        await vi.advanceTimersByTimeAsync(500);
        expect(events).toHaveBeenCalledTimes(6);
        expect(revalidate).toHaveBeenCalledTimes(events.mock.calls.length);
    } finally {
        await reader.cancel();
        await vi.advanceTimersByTimeAsync(1000);
        await drain;
        vi.useRealTimers();
    }
});

it('returns a typed affordable-output offer for explicit confirmation without submitting work', async () => {
    const { ConversationActionConfirmationRequired } =
        await import('../../../../src/modules/conversations/domain/conversation');
    const quote = {
        id: '00000000-0000-4000-8000-000000000003',
        maximumCredits: '0.001',
        approximateOutputTokens: 1,
        expiresAt: '2026-10-22T20:00:00.000Z',
    };
    const app = createConversationRoutes({
        service: {
            access: async () => ({
                ownerId: '00000000-0000-4000-8000-000000000002',
            }),
            admitSubmission: async () => ({ release: async () => {} }),
            store: {
                submit: async () => {
                    throw new ConversationActionConfirmationRequired(quote);
                },
            },
        } as never,
        policy: new AuthHttpPolicy({
            allowedOrigins: ['http://localhost:3333'],
            appEnvironment: 'test',
            refreshTokenTtlSeconds: 3600,
        }),
    });
    const response = await app.request(
        '/conversations/00000000-0000-4000-8000-000000000001/turns',
        {
            method: 'POST',
            headers: {
                Authorization: 'Bearer synthetic.test.token',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                requestId: '00000000-0000-4000-8000-000000000004',
                content: 'Explain.',
            }),
        },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
        error: { code: 'action_confirmation_required', details: { quote } },
    });
});

it('admits one source-preparation POST at a time and releases its lease on every exit', async () => {
    let releasePreparation!: () => void;
    let enteredPreparation!: () => void;
    const preparationStarted = new Promise<void>((resolve) => {
        enteredPreparation = resolve;
    });
    const preparationGate = new Promise<void>((resolve) => {
        releasePreparation = resolve;
    });
    const releaseLease = vi.fn(async () => {});
    const admitSubmission = vi
        .fn()
        .mockResolvedValueOnce({ release: releaseLease })
        .mockRejectedValueOnce(
            new ConversationError(
                'capacity_unavailable',
                'A message is already being prepared.',
            ),
        )
        .mockResolvedValueOnce({ release: releaseLease });
    const submit = vi
        .fn()
        .mockImplementationOnce(async () => {
            enteredPreparation();
            await preparationGate;
            return { id: 'turn-1', status: 'queued' };
        })
        .mockRejectedValueOnce(new Error('synthetic submit failure'));
    const app = createConversationRoutes({
        service: {
            access: async () => ({ ownerId: 'learner' }),
            admitSubmission,
            store: { submit },
        } as never,
        policy: new AuthHttpPolicy({
            allowedOrigins: ['http://localhost:3333'],
            appEnvironment: 'test',
            refreshTokenTtlSeconds: 3600,
        }),
    });
    const post = () =>
        app.request(
            '/conversations/00000000-0000-4000-8000-000000000001/turns',
            {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer synthetic.test.token',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    requestId: randomUUID(),
                    content: 'Explain.',
                }),
            },
        );
    const first = post();
    await preparationStarted;
    const second = await post();
    expect(second.status).not.toBe(200);
    expect(submit).toHaveBeenCalledTimes(1);
    releasePreparation();
    expect((await first).status).toBe(200);
    expect(releaseLease).toHaveBeenCalledTimes(1);

    const failed = await post();
    expect(failed.status).toBe(500);
    expect(releaseLease).toHaveBeenCalledTimes(2);
});
