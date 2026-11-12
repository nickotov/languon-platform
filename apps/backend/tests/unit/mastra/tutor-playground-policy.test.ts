import { Hono, type MiddlewareHandler } from 'hono';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createDevelopmentServerMiddleware } from '../../../src/mastra/development-server-policy';

const workflowPath = '/api/workflows/run-tutor-turn/stream';
const toolPath = '/api/tools/generate_vocabulary/execute';
const turn = { scenarioId: 'empty-owned', message: 'Generate words' };
const contextSchema = z
    .object({ scenarioId: z.literal('empty-owned').optional() })
    .strict();
const policy = {
    toolInputs: {
        generate_vocabulary: z.object({ instruction: z.string() }).strict(),
    },
    workflowInputSchema: z
        .object({
            scenarioId: z.literal('empty-owned'),
            message: z.string().max(4000),
        })
        .strict(),
    requestContextSchema: contextSchema,
};

function app(enabled = true) {
    const app = new Hono();
    for (const entry of createDevelopmentServerMiddleware(
        enabled ? { tutorPlayground: policy } : {},
    )) {
        if (typeof entry === 'function') {
            app.use(entry as unknown as MiddlewareHandler);
        } else {
            app.use(entry.path, entry.handler as unknown as MiddlewareHandler);
        }
    }

    app.post('*', async (c) => c.json(await c.req.json()));

    return app;
}

function request(body: unknown) {
    return {
        method: 'POST',
        headers: { host: '127.0.0.1:4111', 'content-type': 'application/json' },
        body: JSON.stringify(body),
    };
}

describe('tutor playground execution boundary', () => {
    it('accepts the installed Studio stream envelope and normalizes its blank optional session', async () => {
        const response = await app().request(
            workflowPath + '?runId=studio-run',
            request({
                inputData: { ...turn, sessionId: '' },
                requestContext: {},
                closeOnSuspend: true,
                perStep: false,
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            inputData: turn,
            requestContext: {},
            closeOnSuspend: true,
            perStep: false,
        });

        expect(
            (
                await app().request(
                    workflowPath,
                    request({ inputData: turn, perStep: true }),
                )
            ).status,
        ).toBe(400);
    });

    it('exposes only registered tool/workflow routes in explicit playground composition', async () => {
        expect(
            (
                await app(false).request(
                    workflowPath,
                    request({ inputData: turn }),
                )
            ).status,
        ).toBe(403);

        for (const path of [
            toolPath,
            workflowPath,
            '/api/workflows/runTutorTurn/start',
        ]) {
            const body =
                path === toolPath
                    ? { data: { instruction: 'Generate words' } }
                    : { inputData: turn };
            const response = await app().request(path, request(body));
            expect(response.status, path).toBe(200);
            await response.text();
        }

        for (const path of [
            '/api/tools/unregistered/execute',
            '/api/workflows/run-tutor-turn/resume',
            '/api/responses',
            '/api/agents/contextual-language-tutor/stream',
        ]) {
            expect((await app().request(path, request({}))).status, path).toBe(
                403,
            );
        }
    });

    it.each([
        { inputData: { ...turn, ownerId: 'arbitrary' } },
        { inputData: { ...turn, scenarioId: 'production' } },
        {
            inputData: turn,
            requestContext: { syntheticPrincipalId: 'arbitrary' },
        },
        { inputData: turn, model: 'expensive' },
        { inputData: turn, initialState: { budget: 999 } },
        { inputData: turn, tracingOptions: { includeInternalSpans: true } },
        { inputData: turn, resourceId: 'arbitrary' },
    ])(
        'rejects workflow authority, policy and state overrides',
        async (body) => {
            expect(
                (await app().request(workflowPath, request(body))).status,
            ).toBe(400);
        },
    );

    it('validates tool data and context before execution', async () => {
        expect(
            (
                await app().request(
                    toolPath,
                    request({
                        data: { instruction: 'words', model: 'expensive' },
                    }),
                )
            ).status,
        ).toBe(400);

        expect(
            (
                await app().request(
                    toolPath,
                    request({
                        data: { instruction: 'words' },
                        requestContext: {
                            scenarioId: 'empty-owned',
                            sessionId: 'foreign',
                        },
                    }),
                )
            ).status,
        ).toBe(400);

        expect(
            (
                await app().request(
                    toolPath,
                    request({ data: { instruction: 'x'.repeat(33000) } }),
                )
            ).status,
        ).toBe(413);
    });

    it('serializes workflows and tools while allowing cancellation, then releases the response lease', async () => {
        const runtime = new Hono();
        for (const entry of createDevelopmentServerMiddleware({
            tutorPlayground: policy,
        })) {
            if (typeof entry === 'function') {
                runtime.use(entry as unknown as MiddlewareHandler);
            } else {
                runtime.use(
                    entry.path,
                    entry.handler as unknown as MiddlewareHandler,
                );
            }
        }

        let resolveEntered!: () => void;
        let resolveRelease!: () => void;
        const entered = new Promise<void>((r) => {
            resolveEntered = r;
        });
        const release = new Promise<void>((r) => {
            resolveRelease = r;
        });

        runtime.post(workflowPath, async (c) => {
            resolveEntered();
            await release;

            return c.json({ done: true });
        });

        runtime.post('*', (c) => c.json({ done: true }));

        const first = runtime.request(
            workflowPath,
            request({ inputData: turn }),
        );

        await entered;
        expect(
            (
                await runtime.request(
                    toolPath,
                    request({ data: { instruction: 'words' } }),
                )
            ).status,
        ).toBe(429);

        expect(
            (
                await runtime.request(
                    '/api/workflows/run-tutor-turn/runs/test-run/cancel',
                    request({}),
                )
            ).status,
        ).toBe(200);

        resolveRelease();
        const response = await first;
        await response.text();
        const next = await runtime.request(
            toolPath,
            request({ data: { instruction: 'words' } }),
        );

        expect(next.status).toBe(200);
        await next.text();
    });
});
