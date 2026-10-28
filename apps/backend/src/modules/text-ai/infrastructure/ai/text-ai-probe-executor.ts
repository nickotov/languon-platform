import { createCanonicalMastra } from '../../../../mastra/composition';
import { createHash } from 'node:crypto';
import { Agent } from '@mastra/core/agent';
import { noopLogger } from '@mastra/core/logger';
import { z } from 'zod';
import type { TextAiProbeRequest } from '@languon/contracts';
import { parseFixed } from '../../../ai-credits/domain/accounting';
import {
    TextAiProbeUnavailableError,
    type TextAiProbeExecutor,
    type TextAiProbeReservation,
    type TextAiProbeResult,
} from '../../application/ports/text-ai-probe-store';
import {
    createTextAiMastraModel,
    findTextAiModel,
} from './text-ai-provider-catalog';
import { readProviderTokenUsage } from './provider-token-usage';
import { readNativeTextObservation } from './provider-native-observations';
import {
    reviewedTextProviderBudget,
    providerAffordableOutputTokens,
} from '../../../ai-credits/domain/provider-cost-admission';
import { textAiProbeIdentity } from './text-ai-probe-identity';
import { sentenceProviderFailure } from '../../../learning/infrastructure/ai/sentence-provider-failure';

export interface TextAiSyntheticFlow {
    /** Real flow-owned prompt and validation, never a replacement greeting schema. */
    instructions: string;
    /** Bump when local semantic/domain validation changes independently of JSON schema. */
    validationRevision: string;
    input: string;
    schema?: z.ZodType;
    streaming?: boolean;
    validate(output: unknown): boolean;
}
export function createTextAiProbeExecutor(options: {
    credentials: Readonly<Partial<Record<string, string>>>;
    flows: Readonly<Record<string, TextAiSyntheticFlow>>;
}): TextAiProbeExecutor {
    return {
        identity(
            request: Omit<TextAiProbeRequest, 'approvedMaximumCostUsd'> & {
                approvedMaximumCostUsd?: string;
            },
        ) {
            if (request.kind === 'flow' && !options.flows[request.flowId ?? ''])
                throw new TextAiProbeUnavailableError(
                    'probe_route_unavailable',
                );
            // These explicit checks use synthetic content only. Processing approval still gates learner activation separately.
            const flow = options.flows[request.flowId ?? ''];
            const revision = flow
                ? textAiSyntheticFlowContractRevision(flow)
                : 'quick:v1';
            return textAiProbeIdentity(request, options.credentials, revision);
        },
        async execute(
            reservation: TextAiProbeReservation,
            signal: AbortSignal,
        ): Promise<TextAiProbeResult> {
            const route = findTextAiModel(reservation.identity.routeId);
            if (!route)
                throw new TextAiProbeUnavailableError(
                    'probe_route_unavailable',
                );
            const apiKey =
                options.credentials[route.credentialEnvironmentVariable];
            if (!apiKey)
                throw new TextAiProbeUnavailableError(
                    'probe_route_unavailable',
                );
            const flow =
                reservation.request.kind === 'flow'
                    ? options.flows[reservation.request.flowId ?? '']
                    : undefined;
            const instructions =
                flow?.instructions ??
                'Reply with exactly OK to the synthetic connectivity check. Do not call tools.';
            const input = flow?.input ?? 'Synthetic connectivity check.';
            // UTF-8 bytes dominate token counts for the reviewed tokenizer families. Include schema/control overhead.
            const inputLimit =
                Buffer.byteLength(
                    instructions +
                        input +
                        JSON.stringify(
                            flow?.schema ? z.toJSONSchema(flow.schema) : {},
                        ),
                    'utf8',
                ) + 4096;
            if (
                route.providerId === 'evolink' &&
                !reservation.price.nativeRules &&
                parseFixed(reservation.price.minimumUsdPerRequest ?? '0', 6) <=
                    0n
            )
                throw new TextAiProbeUnavailableError('probe_prices_missing');
            if (
                parseFixed(reservation.price.minimumUsdPerRequest ?? '0', 6) >
                reservation.maximumCostMicros
            )
                throw new TextAiProbeUnavailableError('probe_limit_reached');
            const inputRate = [
                reservation.price.inputUsdPerMillionTokens,
                reservation.price.cacheReadUsdPerMillionTokens,
                reservation.price.cacheWriteUsdPerMillionTokens,
            ].reduce((maximum, value) => {
                const rate = parseFixed(value ?? '0', 6);
                return rate > maximum ? rate : maximum;
            }, 0n);
            const outputRate = parseFixed(
                reservation.price.outputUsdPerMillionTokens ?? '0',
                6,
            );
            const inputCost =
                (BigInt(inputLimit) * inputRate + 999999n) / 1000000n;
            const remaining = reservation.maximumCostMicros - inputCost;
            if (remaining <= 0n)
                throw new TextAiProbeUnavailableError('probe_limit_reached');
            const configuredBudget = {
                inputCostMicrosPerMillionTokens: Number(inputRate),
                outputCostMicrosPerMillionTokens: Number(outputRate),
                maxCostMicrosPerAttempt: Number(reservation.maximumCostMicros),
                maxInputTokensPerAttempt: route.requestLimits.maxInputTokens,
                maxOutputTokensPerAttempt: Math.min(
                    route.requestLimits.maxOutputTokens,
                    flow ? 2048 : 128,
                ),
            };
            const providerBudget = reservation.price.nativeRules
                ? reviewedTextProviderBudget(
                      reservation.price,
                      configuredBudget,
                      undefined,
                      {
                          dispatchedAt: reservation.startedAt.toISOString(),
                          serviceTier: 'standard',
                      },
                  )
                : configuredBudget;
            const outputLimit = reservation.price.nativeRules
                ? providerAffordableOutputTokens({
                      inputTokens: inputLimit,
                      outputLimit: configuredBudget.maxOutputTokensPerAttempt,
                      budget: providerBudget,
                  })
                : Math.min(
                      route.requestLimits.maxOutputTokens,
                      flow ? 2048 : 128,
                      outputRate === 0n
                          ? 2048
                          : Number((remaining * 1000000n) / outputRate),
                  );
            if (
                outputLimit < 1 ||
                inputLimit > route.requestLimits.maxInputTokens
            )
                throw new TextAiProbeUnavailableError('probe_limit_reached');
            const agent = new Agent({
                id: 'admin-text-ai-probe',
                name: 'Administrative synthetic model check',
                instructions,
                model: createTextAiMastraModel({
                    apiKey,
                    model: route,
                    providerPrice: reservation.price,
                    providerBudget,
                    nativeProbeDispatchedAt:
                        reservation.startedAt.toISOString(),
                }),
                defaultOptions: { maxSteps: 1 },
                defaultGenerateOptionsLegacy: { maxRetries: 0, maxSteps: 1 },
            });
            // Registered only for this authorized admin operation; generic Studio has no probe authority.
            createCanonicalMastra({ administrativeProbe: agent }).getAgent(
                'administrativeProbe',
            );
            agent.__registerPrimitives({ logger: noopLogger });
            const started = performance.now();
            let completedStepUsage: unknown;
            try {
                const settings = {
                    abortSignal: signal,
                    modelSettings: {
                        maxOutputTokens: outputLimit,
                        maxRetries: 0,
                    },
                    maxSteps: 1,
                    onStepFinish: (step: { usage: unknown }) => {
                        completedStepUsage = step.usage;
                    },
                    toolChoice: 'none' as const,
                    tracingOptions: { hideInput: true, hideOutput: true },
                };
                let firstOutputMs: number | undefined;
                const result = flow?.streaming
                    ? await (async () => {
                          const stream = await agent.stream(input, settings);
                          let text = '';
                          for await (const chunk of stream.fullStream) {
                              signal.throwIfAborted();
                              if (chunk.type === 'error')
                                  throw new Error('Streaming probe failed.');
                              if (chunk.type === 'text-delta') {
                                  if (
                                      chunk.payload.text &&
                                      firstOutputMs === undefined
                                  )
                                      firstOutputMs = Math.ceil(
                                          performance.now() - started,
                                      );
                                  text += chunk.payload.text;
                              }
                          }
                          const output = await stream.getFullOutput();
                          if (output.error || output.finishReason === 'error')
                              throw new Error('Streaming probe failed.');
                          return {
                              text,
                              object: undefined,
                              usage: await stream.totalUsage,
                              providerMetadata: output.providerMetadata,
                          };
                      })()
                    : flow?.schema
                      ? await agent.generate(input, {
                            ...settings,
                            structuredOutput: {
                                schema: flow.schema,
                                ...(route.structuredOutput ===
                                'prompt-injection'
                                    ? { jsonPromptInjection: 'inline' as const }
                                    : {}),
                            },
                        })
                      : await agent.generate(input, settings);
                let usage;
                try {
                    usage = readProviderTokenUsage(
                        result.usage,
                        {
                            maxInputTokens: inputLimit,
                            maxOutputTokens: outputLimit,
                        },
                        result,
                    );
                } catch {
                    usage = null;
                }
                const valid = flow
                    ? flow.validate(flow.schema ? result.object : result.text)
                    : result.text.trim() === 'OK';
                return {
                    ...((usage?.nativeUsage ??
                    readNativeTextObservation(result)?.usage)
                        ? {
                              nativeUsage:
                                  usage?.nativeUsage ??
                                  readNativeTextObservation(result)!.usage,
                          }
                        : {}),
                    ...((usage?.executionFacts ??
                    readNativeTextObservation(result)?.execution)
                        ? {
                              executionFacts:
                                  usage?.executionFacts ??
                                  readNativeTextObservation(result)!.execution,
                          }
                        : {}),
                    valid,
                    failure: valid ? null : 'invalid_output',
                    elapsedMs: Math.ceil(performance.now() - started),
                    ...(firstOutputMs === undefined ? {} : { firstOutputMs }),
                    inputTokens: usage?.inputTokens ?? null,
                    outputTokens: usage?.outputTokens ?? null,
                    measurement: usage ? 'measured' : 'unknown',
                    ...(usage?.cacheReadTokens === undefined
                        ? {}
                        : { cacheReadTokens: usage.cacheReadTokens }),
                    ...(usage?.cacheWriteTokens === undefined
                        ? {}
                        : { cacheWriteTokens: usage.cacheWriteTokens }),
                };
            } catch (error) {
                const failure = sentenceProviderFailure(
                    error,
                    route.providerId,
                );
                const invalidOutput =
                    failure.errorName === 'AI_NoObjectGeneratedError' ||
                    failure.reason === 'schema_incompatible' ||
                    (error &&
                        typeof error === 'object' &&
                        'id' in error &&
                        error.id ===
                            'STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED');
                let failedUsage;
                if (
                    completedStepUsage ||
                    (failure.errorName === 'AI_NoObjectGeneratedError' &&
                        error &&
                        typeof error === 'object' &&
                        'usage' in error)
                ) {
                    try {
                        failedUsage = readProviderTokenUsage(
                            completedStepUsage ??
                                (error &&
                                typeof error === 'object' &&
                                'usage' in error
                                    ? error.usage
                                    : undefined),
                            {
                                maxInputTokens: inputLimit,
                                maxOutputTokens: outputLimit,
                            },
                        );
                    } catch {
                        /* Unbounded or absent measurement remains unknown. */
                    }
                }
                return {
                    valid: false,
                    failure: signal.aborted
                        ? 'timeout'
                        : invalidOutput
                          ? 'invalid_output'
                          : failure.reason === 'provider_unavailable' &&
                              !failure.providerCode &&
                              (failure.httpStatus === undefined ||
                                  failure.httpStatus < 400)
                            ? 'execution_unknown'
                            : failure.reason === 'model_unavailable'
                              ? 'model_retired'
                              : failure.reason === 'schema_incompatible'
                                ? 'invalid_output'
                                : failure.reason,
                    elapsedMs: Math.ceil(performance.now() - started),
                    inputTokens: failedUsage?.inputTokens ?? null,
                    outputTokens: failedUsage?.outputTokens ?? null,
                    measurement: failedUsage ? 'measured' : 'unknown',
                    ...(failedUsage?.cacheReadTokens === undefined
                        ? {}
                        : { cacheReadTokens: failedUsage.cacheReadTokens }),
                    ...(failedUsage?.cacheWriteTokens === undefined
                        ? {}
                        : { cacheWriteTokens: failedUsage.cacheWriteTokens }),
                    ...(failedUsage?.nativeUsage
                        ? { nativeUsage: failedUsage.nativeUsage }
                        : {}),
                    ...(failedUsage?.executionFacts
                        ? { executionFacts: failedUsage.executionFacts }
                        : {}),
                };
            }
        },
    };
}

/** Shared by activation, doctor and probes so schema/prompt changes invalidate prior evidence. */
export function textAiSyntheticFlowContractRevision(
    flow: TextAiSyntheticFlow,
): string {
    return createHash('sha256')
        .update(
            JSON.stringify({
                instructions: flow.instructions,
                validationRevision: flow.validationRevision,
                schema: flow.schema ? z.toJSONSchema(flow.schema) : null,
                fixture: flow.input,
                streaming: flow.streaming ?? false,
            }),
        )
        .digest('hex');
}
