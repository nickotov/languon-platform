import { Agent } from '@mastra/core/agent';
import { createScorer } from '@mastra/core/evals';
import type {
    ModelRouterModelId,
    OpenAICompatibleConfig,
} from '@mastra/core/llm';
import { createTool } from '@mastra/core/tools';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { getLocalPrompt } from '@languon/prompts';
import { z } from 'zod';

import type { DevelopmentVerificationService } from '../../application/development-verification-service';
import { developmentHarnessMaximumAgentSteps } from './development-harness-limits';

export const DevelopmentHarnessRequestContextSchema = z.object({
    syntheticPrincipalId: z.uuid(),
    variant: z.enum(['concise', 'diagnostic']).default('concise'),
});

export const DevelopmentVerificationInputSchema = z.object({
    delayMs: z.number().int().min(0).max(2_000).default(0),
    message: z.string().trim().min(1).max(120),
});

const DevelopmentTraceSchema = z.object({
    durationMs: z.number().nonnegative(),
    primitive: z.enum(['tool', 'workflow']),
    result: z.literal('verified_principal'),
    status: z.literal('success'),
    stepPath: z.string().min(1),
});

export const DevelopmentVerificationOutputSchema = z.object({
    email: z.email(),
    message: z.string(),
    principalId: z.uuid(),
    trace: DevelopmentTraceSchema,
    variant: z.enum(['concise', 'diagnostic']),
});

const DevelopmentScorerInputSchema = z.object({
    expectedPrincipalId: z.uuid(),
});

export class DevelopmentModelConfigurationError extends Error {
    public constructor() {
        super(
            'Live development agent execution requires DEEPSEEK_API_KEY for the default and fallback model; deterministic tool, workflow, and scorer checks remain available.',
        );
        this.name = 'DevelopmentModelConfigurationError';
    }
}

export interface DevelopmentHarnessPrimitiveOptions {
    deepSeekApiKey?: string;
    fallbackModelId: `${string}/${string}`;
    modelId: `${string}/${string}`;
    service: DevelopmentVerificationService;
}

export function createDevelopmentHarnessPrimitives(
    options: DevelopmentHarnessPrimitiveOptions,
) {
    const verificationTool = createTool({
        id: 'development-principal-verification',
        description:
            'Resolve the selected synthetic Mastra playground principal through the application service.',
        inputSchema: DevelopmentVerificationInputSchema,
        outputSchema: DevelopmentVerificationOutputSchema,
        requestContextSchema: DevelopmentHarnessRequestContextSchema,
        execute: async (input, context) => {
            const startedAt = performance.now();
            await abortableDelay(input.delayMs, context.abortSignal);
            const verified = await options.service.verifyPrincipal({
                message: input.message,
                principalId: context.requestContext.get('syntheticPrincipalId'),
                ...(context.abortSignal ? { signal: context.abortSignal } : {}),
                variant: context.requestContext.get('variant') ?? 'concise',
            });

            return {
                ...verified,
                trace: {
                    durationMs: performance.now() - startedAt,
                    primitive: 'tool' as const,
                    result: 'verified_principal' as const,
                    status: 'success' as const,
                    stepPath: 'development-principal-verification',
                },
            };
        },
    });

    const verificationStep = createStep({
        id: 'verify-development-principal',
        description:
            'Validate request context and resolve the synthetic principal.',
        inputSchema: DevelopmentVerificationInputSchema,
        outputSchema: DevelopmentVerificationOutputSchema,
        requestContextSchema: DevelopmentHarnessRequestContextSchema,
        execute: async ({ abortSignal, inputData, requestContext }) => {
            const startedAt = performance.now();
            await abortableDelay(inputData.delayMs, abortSignal);
            const verified = await options.service.verifyPrincipal({
                message: inputData.message,
                principalId: requestContext.get('syntheticPrincipalId'),
                signal: abortSignal,
                variant: requestContext.get('variant') ?? 'concise',
            });

            return {
                ...verified,
                trace: {
                    durationMs: performance.now() - startedAt,
                    primitive: 'workflow' as const,
                    result: 'verified_principal' as const,
                    status: 'success' as const,
                    stepPath:
                        'development-verification-workflow/verify-development-principal',
                },
            };
        },
    });

    const verificationWorkflow = createWorkflow({
        id: 'development-verification-workflow',
        description:
            'Exercise validated context, cancellation, and the application principal path.',
        inputSchema: DevelopmentVerificationInputSchema,
        outputSchema: DevelopmentVerificationOutputSchema,
        requestContextSchema: DevelopmentHarnessRequestContextSchema,
    })
        .then(verificationStep)
        .commit();

    const agentModel = createDevelopmentAgentModel(options);
    const verificationAgent = new Agent({
        defaultGenerateOptionsLegacy: {
            maxRetries: 0,
            maxSteps: developmentHarnessMaximumAgentSteps,
        },
        defaultOptions: {
            maxSteps: developmentHarnessMaximumAgentSteps,
        },
        defaultStreamOptionsLegacy: {
            maxRetries: 0,
            maxSteps: developmentHarnessMaximumAgentSteps,
        },
        id: 'development-verification-agent',
        name: 'Development verification agent',
        instructions: ({ requestContext }) =>
            `${getLocalPrompt('development-harness-agent')} Response variant: ${requestContext.get('variant') ?? 'concise'}.`,
        inputProcessors: [
            {
                id: 'development-model-credential-guard',
                processInput: ({ abort, messageList }) => {
                    if (!options.deepSeekApiKey) {
                        abort(
                            new DevelopmentModelConfigurationError().message,
                            {
                                metadata: {
                                    category: 'model_configuration',
                                    requiredEnvironmentVariable:
                                        'DEEPSEEK_API_KEY',
                                },
                                retry: false,
                            },
                        );
                    }
                    return messageList;
                },
            },
        ],
        model: agentModel,
        requestContextSchema: DevelopmentHarnessRequestContextSchema,
        tools: { verificationTool },
    });

    const verificationScorer = createScorer({
        id: 'development-principal-match',
        name: 'Development principal match',
        description:
            'Deterministically scores whether verification returned the expected synthetic principal.',
        type: {
            input: DevelopmentScorerInputSchema,
            output: DevelopmentVerificationOutputSchema,
        },
    })
        .generateScore(({ run }) =>
            run.input?.expectedPrincipalId === run.output.principalId ? 1 : 0,
        )
        .generateReason(({ score }) =>
            score === 1
                ? 'The verified principal matches the expected synthetic fixture.'
                : 'The verified principal does not match the expected synthetic fixture.',
        );

    return {
        verificationAgent,
        verificationScorer,
        verificationTool,
        verificationWorkflow,
    };
}

function createDevelopmentAgentModel(
    options: DevelopmentHarnessPrimitiveOptions,
): Array<{
    enabled: true;
    id: string;
    maxRetries: 0;
    model: ModelRouterModelId | OpenAICompatibleConfig;
}> {
    const primaryModel = options.modelId as ModelRouterModelId;
    const fallbackModel = {
        ...(options.deepSeekApiKey ? { apiKey: options.deepSeekApiKey } : {}),
        id: options.fallbackModelId,
        url: 'https://api.deepseek.com',
    } satisfies OpenAICompatibleConfig;

    if (primaryModel === options.fallbackModelId) {
        return [
            {
                enabled: true,
                id: 'deepseek-default',
                maxRetries: 0,
                model: fallbackModel,
            },
        ];
    }

    return [
        {
            enabled: true,
            id: 'configured-primary',
            maxRetries: 0,
            model: primaryModel,
        },
        {
            enabled: true,
            id: 'deepseek-fallback',
            maxRetries: 0,
            model: fallbackModel,
        },
    ];
}

async function abortableDelay(
    durationMs: number,
    signal: AbortSignal | undefined,
): Promise<void> {
    signal?.throwIfAborted();
    if (durationMs === 0) return;

    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(finish, durationMs);

        function finish(): void {
            signal?.removeEventListener('abort', abort);
            resolve();
        }

        function abort(): void {
            clearTimeout(timeout);
            reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
        }

        signal?.addEventListener('abort', abort, { once: true });
    });
}
