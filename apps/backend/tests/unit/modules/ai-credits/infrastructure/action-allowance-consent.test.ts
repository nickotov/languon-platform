import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { describe, expect, it } from 'vitest';
import {
    actionAllowanceRequestMiddleware,
    actionAllowanceErrorResponse,
    ActionAllowanceConfirmationRequired,
} from '../../../../../src/modules/ai-credits/infrastructure/action-allowance-consent';
const id = '00000000-0000-4000-8000-000000000001';
describe('allowance transport metadata', () => {
    it.each([false, true])(
        'preserves chunked bodies across composed body guards (confirmed=%s)',
        async (confirmed) => {
            const app = new Hono();
            app.use('*', bodyLimit({ maxSize: 1024 }));
            app.use('*', actionAllowanceRequestMiddleware);
            app.use('*', bodyLimit({ maxSize: 1024 }));
            app.use('*', actionAllowanceRequestMiddleware);
            app.post('/', async (c) => c.json(await c.req.json()));
            const text = JSON.stringify({
                operationId: 'same-operation',
                ...(confirmed ? { confirmedQuoteId: id } : {}),
            });
            const request = new Request('http://localhost/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: text,
            });
            expect(request.headers.has('Content-Length')).toBe(false);
            const response = await app.request(request);
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({
                operationId: 'same-operation',
            });
        },
    );
    it('removes confirmation metadata before domain request fingerprinting', async () => {
        const app = new Hono();
        app.use('*', actionAllowanceRequestMiddleware);
        app.post('/', async (c) => c.json(await c.req.json()));
        const response = await app.request('/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                operationId: 'same-operation',
                answer: 'same-input',
                confirmedQuoteId: id,
            }),
        });
        expect(await response.json()).toEqual({
            operationId: 'same-operation',
            answer: 'same-input',
        });
    });
    it('rejects malformed consent before the mutation handler', async () => {
        const app = new Hono();
        app.use('*', actionAllowanceRequestMiddleware);
        app.post('/', (c) => c.json({ dispatched: true }));
        const response = await app.request('/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirmedQuoteId: 'forged' }),
        });
        expect(response.status).toBe(400);
    });
    it('returns only learner credit allowance details on the confirmation response', async () => {
        const app = new Hono();
        app.onError(
            (error, c) =>
                actionAllowanceErrorResponse(error, c) ??
                c.json({ error: 'unexpected' }, 500),
        );
        app.post('/', () => {
            throw new ActionAllowanceConfirmationRequired({
                id,
                ownerId: id,
                conversationId: id,
                requestId: id,
                fingerprint: 'private-input-hash',
                authorizationFingerprint: 'private-tariff-hash',
                heldMilli: 125n,
                outputAllowance: 20,
                expiresAt: new Date('2030-01-01T00:00:00Z'),
            });
        });
        const response = await app.request('/', { method: 'POST' });
        expect(response.status).toBe(409);
        const body = await response.json();
        expect(body.error).toMatchObject({
            code: 'action_confirmation_required',
            details: {
                quote: {
                    id,
                    maximumCredits: '0.125',
                    approximateOutputTokens: 20,
                },
            },
        });
        expect(JSON.stringify(body)).not.toMatch(/private-|ownerId|Usd|Milli/u);
    });
});
