import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PortraitService } from '../../application/portrait-service';
import { InterviewService } from '../../application/interview-service';
import type {
    InterviewStore,
    InterviewOperation,
} from '../../application/ports/interview-store';
import {
    emptyPortraitState,
    type PortraitStore,
} from '../../application/ports/portrait-store';
import { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { createLearnerPortraitRoutes } from './learner-portrait.routes';
const headers = {
    Authorization: 'Bearer test.test.test',
    'Content-Type': 'application/json',
};
function fixture() {
    const ownerId = randomUUID();
    const operationId = randomUUID();
    const interviewId = randomUUID();
    const operation: InterviewOperation = {
        id: operationId,
        interviewId,
        ownerId,
        generation: 0,
        version: 0,
        state: 'queued',
        input: { kind: 'skip', topic: 'age' },
        context: {
            locale: 'en',
            approvedItems: null,
            draftItems: null,
            messages: [],
            completedTopics: [],
        },
        execution: { secret: 'private-provider-config' },
        result: null,
        errorCode: null,
    };
    const interviewStore: InterviewStore = {
        status: vi.fn().mockResolvedValue({
            id: interviewId,
            locale: 'en',
            expiresAt: '2026-11-03T00:00:00.000Z',
        }),
        start: vi.fn().mockResolvedValue({
            interviewId,
            expiresAt: '2026-11-03T00:00:00.000Z',
            context: operation.context,
        }),
        setLocale: vi.fn(),
        enqueue: vi.fn().mockResolvedValue(operation),
        read: vi
            .fn()
            .mockImplementation(async (owner, id) =>
                owner === ownerId && id === operationId ? operation : null,
            ),
        stop: vi.fn().mockResolvedValue(undefined),
        claim: vi.fn(),
        heartbeat: vi.fn(),
        complete: vi.fn(),
        fail: vi.fn(),
    };
    const portraitStore: PortraitStore = {
        run: async (_id, work) =>
            work({
                read: async () => emptyPortraitState(),
                save: vi.fn(),
                clearInterview: vi.fn(),
                touchInterview: vi.fn(),
            }),
    };
    const app = createLearnerPortraitRoutes({
        portraits: new PortraitService(portraitStore),
        interviews: new InterviewService(interviewStore),
        authenticate: vi.fn(async () => ({ userId: ownerId })),
        rateLimiter: {
            consume: vi.fn(async () => ({
                allowed: true,
                limit: 120,
                remaining: 119,
                retryAfterSeconds: 0,
            })),
            linkSubject: vi.fn(),
        },
        policy: new AuthHttpPolicy({
            allowedOrigins: ['http://localhost:3000'],
            appEnvironment: 'test',
            refreshTokenTtlSeconds: 3600,
        }),
        creditsBypass: true,
    });
    return { app, ownerId, operationId, interviewId, interviewStore };
}
describe('learner portrait HTTP boundary', () => {
    it('privately discovers resumable metadata and pricing without starting work', async () => {
        const { app, interviewId, interviewStore, ownerId } = fixture();
        expect(
            (await app.request('/learner-portrait/interview/status')).status,
        ).toBe(401);
        const response = await app.request(
            '/learner-portrait/interview/status',
            { headers },
        );
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(await response.json()).toEqual({
            interview: {
                id: interviewId,
                locale: 'en',
                expiresAt: '2026-11-03T00:00:00.000Z',
            },
            creditsBypass: true,
        });
        expect(interviewStore.status).toHaveBeenCalledWith(
            ownerId,
            expect.any(Date),
        );
        expect(interviewStore.start).not.toHaveBeenCalled();
        expect(interviewStore.enqueue).not.toHaveBeenCalled();
    });
    it('requires bearer identity and rejects untrusted request origin', async () => {
        const { app } = fixture();
        expect((await app.request('/learner-portrait')).status).toBe(401);
        expect(
            (
                await app.request('/learner-portrait', {
                    headers: { ...headers, Origin: 'https://evil.example' },
                })
            ).status,
        ).toBe(403);
    });
    it('enqueues durable work with authenticated owner and returns no private execution context', async () => {
        const { app, ownerId, interviewId, interviewStore } = fixture();
        const response = await app.request(
            '/learner-portrait/interview/responses',
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    interviewId,
                    expectedVersion: 0,
                    expectedGeneration: 0,
                    idempotencyKey: randomUUID(),
                    input: { kind: 'answer', topic: 'goals', text: 'Travel' },
                }),
            },
        );
        expect(response.status).toBe(202);
        const output = await response.json();
        expect(output).not.toHaveProperty('ownerId');
        expect(output).not.toHaveProperty('context');
        expect(output).not.toHaveProperty('execution');
        expect(interviewStore.enqueue).toHaveBeenCalledWith(
            expect.objectContaining({ ownerId, paidAcknowledged: false }),
        );
        expect(interviewStore.claim).not.toHaveBeenCalled();
    });
    it('rejects answer overflow and user-selected identity before admission', async () => {
        const { app, interviewId, interviewStore } = fixture();
        for (const extra of [
            {
                input: {
                    kind: 'answer',
                    topic: 'goals',
                    text: 'a'.repeat(201),
                },
            },
            {
                ownerId: randomUUID(),
                input: { kind: 'chat', topic: 'goals', text: 'Why?' },
            },
        ]) {
            const response = await app.request(
                '/learner-portrait/interview/responses',
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        interviewId,
                        expectedVersion: 0,
                        expectedGeneration: 0,
                        idempotencyKey: randomUUID(),
                        ...extra,
                    }),
                },
            );
            expect(response.status).toBe(400);
        }
        expect(interviewStore.enqueue).not.toHaveBeenCalled();
    });
    it('replays by owner and hides an unavailable response', async () => {
        const { app, ownerId, operationId, interviewStore } = fixture();
        expect(
            (
                await app.request(
                    `/learner-portrait/interview/responses/${operationId}`,
                    { headers },
                )
            ).status,
        ).toBe(200);
        expect(interviewStore.read).toHaveBeenCalledWith(ownerId, operationId);
        expect(
            (
                await app.request(
                    `/learner-portrait/interview/responses/${randomUUID()}`,
                    { headers },
                )
            ).status,
        ).toBe(404);
    });
    it('starts with a deterministic localized question and truthful credit policy', async () => {
        const { app } = fixture();
        const response = await app.request('/learner-portrait/interview', {
            method: 'POST',
            headers,
            body: JSON.stringify({ expectedVersion: 0, locale: 'en' }),
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            creditsBypass: true,
            initialQuestion: { topic: 'languages' },
        });
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    });
});
