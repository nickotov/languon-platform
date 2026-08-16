import { noopObserve } from '@mastra/core/tools';
import { RequestContext } from '@mastra/core/request-context';
import { inspect } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCanonicalMastra } from '../../../../../../src/mastra/composition';
import { DevelopmentVerificationService } from '../../../../../../src/modules/development-harness/application/development-verification-service';
import {
    createDevelopmentHarnessPrimitives,
    DevelopmentHarnessRequestContextSchema,
} from '../../../../../../src/modules/development-harness/infrastructure/mastra/development-harness-primitives';

const principalId = '00000000-0000-4000-8000-000000000019';

function createOptions() {
    return {
        fallbackModelId: 'deepseek/deepseek-chat' as const,
        modelId: 'deepseek/deepseek-chat' as const,
        service: new DevelopmentVerificationService(
            {
                findById: async () => ({
                    email: 'mastra-playground@example.test',
                    id: principalId,
                    status: 'active',
                    verifiedAt: new Date('2026-01-01T00:00:00.000Z'),
                }),
            },
            principalId,
        ),
    };
}

function requestContext() {
    return new RequestContext<{
        syntheticPrincipalId: string;
        variant: 'concise' | 'diagnostic';
    }>([
        ['syntheticPrincipalId', principalId],
        ['variant', 'diagnostic'],
    ]);
}

function requestContextWithoutVariant() {
    return new RequestContext<{
        syntheticPrincipalId: string;
        variant: 'concise' | 'diagnostic';
    }>([['syntheticPrincipalId', principalId]]);
}

describe('development harness Mastra primitives', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('registers fixtures only in explicit development composition', () => {
        const production = createCanonicalMastra();
        const development = createCanonicalMastra({
            developmentHarness: createOptions(),
        });

        expect(Object.keys(production.listAgents())).toEqual([]);
        expect(Object.keys(production.listWorkflows())).toEqual([]);
        expect(Object.keys(production.listTools() ?? {})).toEqual([]);
        expect(Object.keys(development.listAgents())).toEqual([
            'developmentVerificationAgent',
        ]);
        expect(Object.keys(development.listWorkflows())).toEqual([
            'developmentVerificationWorkflow',
        ]);
        expect(Object.keys(development.listTools() ?? {})).toEqual([
            'development-principal-verification',
        ]);
        expect(Object.keys(development.listScorers() ?? {})).toEqual([
            'developmentPrincipalMatch',
        ]);
    });

    it('validates request context and executes the tool deterministically', async () => {
        const { verificationTool } =
            createDevelopmentHarnessPrimitives(createOptions());

        expect(() =>
            DevelopmentHarnessRequestContextSchema.parse({
                syntheticPrincipalId: 'not-a-uuid',
                variant: 'concise',
            }),
        ).toThrow();

        const output = await verificationTool.execute!(
            { delayMs: 0, message: 'tool check' },
            {
                observe: noopObserve,
                requestContext: requestContext(),
            },
        );

        expect(output).toMatchObject({
            message: 'tool check',
            principalId,
            trace: {
                primitive: 'tool',
                result: 'verified_principal',
                status: 'success',
            },
            variant: 'diagnostic',
        });
    });

    it('executes the workflow and scorer without a model', async () => {
        const primitives = createDevelopmentHarnessPrimitives(createOptions());
        const run = await primitives.verificationWorkflow.createRun();
        const result = await run.start({
            inputData: { delayMs: 0, message: 'workflow check' },
            requestContext: requestContext(),
        });

        expect(result).toMatchObject({
            result: {
                principalId,
                trace: { primitive: 'workflow' },
            },
            status: 'success',
        });

        const score = await primitives.verificationScorer.run({
            input: { expectedPrincipalId: principalId },
            output: result.status === 'success' ? result.result : undefined!,
        });
        expect(score).toMatchObject({
            score: 1,
            reason: 'The verified principal matches the expected synthetic fixture.',
        });
    });

    it('applies the concise variant default to tool and workflow execution', async () => {
        const primitives = createDevelopmentHarnessPrimitives(createOptions());
        const toolResult = await primitives.verificationTool.execute!(
            { delayMs: 0, message: 'default tool context' },
            {
                observe: noopObserve,
                requestContext: requestContextWithoutVariant(),
            },
        );
        const run = await primitives.verificationWorkflow.createRun();
        const workflowResult = await run.start({
            inputData: { delayMs: 0, message: 'default workflow context' },
            requestContext: requestContextWithoutVariant(),
        });

        expect(toolResult).toMatchObject({ variant: 'concise' });
        expect(workflowResult).toMatchObject({
            result: { variant: 'concise' },
            status: 'success',
        });
    });

    it('fails live agent invocation before any model call when credentials are absent', async () => {
        const { verificationAgent } =
            createDevelopmentHarnessPrimitives(createOptions());

        await expect(
            verificationAgent.generate('Verify the fixture.', {
                requestContext: requestContext(),
            }),
        ).resolves.toMatchObject({
            finishReason: 'other',
            tripwire: {
                metadata: {
                    category: 'model_configuration',
                    requiredEnvironmentVariable: 'DEEPSEEK_API_KEY',
                },
                reason: expect.stringContaining('requires DEEPSEEK_API_KEY'),
                retry: false,
            },
        });
    });

    it('uses DeepSeek once by default and orders an alternate primary before the fixed fallback', () => {
        const defaultAgent =
            createDevelopmentHarnessPrimitives(
                createOptions(),
            ).verificationAgent;
        const alternateAgent = createDevelopmentHarnessPrimitives({
            ...createOptions(),
            modelId: 'anthropic/claude-sonnet-4-5',
        }).verificationAgent;

        expect(defaultAgent.model).toEqual([
            {
                enabled: true,
                id: 'deepseek-default',
                maxRetries: 0,
                model: {
                    id: 'deepseek/deepseek-chat',
                    url: 'https://api.deepseek.com',
                },
            },
        ]);
        expect(alternateAgent.model).toEqual([
            {
                enabled: true,
                id: 'configured-primary',
                maxRetries: 0,
                model: 'anthropic/claude-sonnet-4-5',
            },
            {
                enabled: true,
                id: 'deepseek-fallback',
                maxRetries: 0,
                model: {
                    id: 'deepseek/deepseek-chat',
                    url: 'https://api.deepseek.com',
                },
            },
        ]);
    });

    it('pins DeepSeek to its HTTPS origin and suppresses prompt-bearing provider error logs', async () => {
        const sentinel = 'sentinel-private-prompt-926c98e6';
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    error: { message: 'synthetic provider rejection' },
                }),
                {
                    headers: { 'content-type': 'application/json' },
                    status: 401,
                },
            ),
        );
        vi.stubGlobal('fetch', fetchMock);
        const consoleCalls: unknown[][] = [];
        for (const method of ['error', 'info', 'log', 'warn'] as const) {
            vi.spyOn(console, method).mockImplementation((...values) => {
                consoleCalls.push(values);
            });
        }

        const mastra = createCanonicalMastra({
            developmentHarness: {
                ...createOptions(),
                deepSeekApiKey: 'synthetic-deepseek-key',
            },
        });
        const agent = mastra.listAgents().developmentVerificationAgent;
        await agent
            .generate(sentinel, {
                requestContext: requestContext(),
            })
            .catch(() => undefined);

        expect(fetchMock).toHaveBeenCalled();
        const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
        expect(requestedUrl).toBe('https://api.deepseek.com/chat/completions');
        expect(inspect(consoleCalls, { depth: 8 })).not.toContain(sentinel);
        expect(inspect(consoleCalls, { depth: 8 })).not.toContain(
            'synthetic-deepseek-key',
        );
    });

    it('pins modern and legacy agent executions to three steps', async () => {
        const { verificationAgent } =
            createDevelopmentHarnessPrimitives(createOptions());

        expect(await verificationAgent.getDefaultOptions()).toMatchObject({
            maxSteps: 3,
        });
        expect(
            await verificationAgent.getDefaultGenerateOptionsLegacy(),
        ).toMatchObject({ maxRetries: 0, maxSteps: 3 });
        expect(
            await verificationAgent.getDefaultStreamOptionsLegacy(),
        ).toMatchObject({ maxRetries: 0, maxSteps: 3 });
    });

    it('cancels delayed tool execution', async () => {
        const { verificationTool } =
            createDevelopmentHarnessPrimitives(createOptions());
        const controller = new AbortController();
        const execution = verificationTool.execute!(
            { delayMs: 2_000, message: 'cancel me' },
            {
                abortSignal: controller.signal,
                observe: noopObserve,
                requestContext: requestContext(),
            },
        );
        controller.abort(new DOMException('Stopped', 'AbortError'));

        await expect(execution).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('cancels delayed workflow execution', async () => {
        const { verificationWorkflow } =
            createDevelopmentHarnessPrimitives(createOptions());
        const run = await verificationWorkflow.createRun();
        const execution = run.start({
            inputData: { delayMs: 2_000, message: 'cancel workflow' },
            requestContext: requestContext(),
        });

        await run.cancel();

        await expect(execution).resolves.toMatchObject({ status: 'canceled' });
    });
});
