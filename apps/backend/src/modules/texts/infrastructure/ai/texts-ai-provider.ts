import { withQueuedTextAiProviderAttempt } from '../../../text-ai/infrastructure/ai/with-queued-text-ai-provider-attempt';
import type { TextAiProviderRuntimeOptions } from '../../../text-ai/infrastructure/ai/text-ai-provider-runtime-observer';
import { ProviderExecutionError } from '../../../text-ai/infrastructure/ai/provider-execution-outcome';
import { readProviderTokenUsage } from '../../../text-ai/infrastructure/ai/provider-token-usage';
import { z } from 'zod';
import { SUPPORTED_LANGUAGE_TAGS } from '@languon/languages';
import {
    TextDetectionResultSchema,
    TextTranslationSegmentSchema,
} from '@languon/contracts';
import { getLocalPrompt } from '@languon/prompts';
import type {
    TextsAiProvider,
    TextsProviderCall,
    TextsTokenUsage,
    TextJobInput,
} from '../../application/ports/texts-ai-provider';
import {
    TextsAiError,
    TextsProviderInvalidOutputError,
} from '../../application/ports/texts-ai-provider';
import type {
    TextAiExecutionSnapshot,
    TextAiProviderBudgetPolicy,
} from '../../../text-ai/application/text-ai-provider-catalog';
import { resolveTextAiProviderOptions } from '../../../text-ai/infrastructure/ai/text-ai-provider-resolver';
import { textAiRequestLimits } from '../../../text-ai/infrastructure/ai/text-ai-provider-catalog';
import { createTextsAgents } from './texts-agents';
export const TextTranslationProviderOutputSchema = z
    .object({
        translation: z.array(TextTranslationSegmentSchema).min(1).max(20_000),
    })
    .strict();
function request(input: TextJobInput) {
    return input.kind === 'text-translation'
        ? {
              sourceText: input.sourceText,
              sourceLanguage: input.sourceLanguage,
              targetLanguage: input.targetLanguage,
              segments: input.segments,
          }
        : {
              sourceText: input.sourceText,
              supportedLanguages: SUPPORTED_LANGUAGE_TAGS,
          };
}
/** Conservative byte upper bounds: fail before reservation/provider, never silently truncate. */
export function preflightTextsRequest(
    input: TextJobInput,
    execution: TextAiExecutionSnapshot,
    budget: TextAiProviderBudgetPolicy,
) {
    const schema =
        input.kind === 'text-translation'
            ? TextTranslationProviderOutputSchema
            : TextDetectionResultSchema;
    const prompt = getLocalPrompt(
        input.kind === 'text-translation'
            ? 'text-translation-agent'
            : 'text-detection-agent',
    );
    const inputBound =
        Buffer.byteLength(JSON.stringify(request(input)), 'utf8') +
        Buffer.byteLength(prompt, 'utf8') +
        Buffer.byteLength(JSON.stringify(z.toJSONSchema(schema)), 'utf8') +
        1024;
    // Count the actual aligned JSON framing rather than a fixed per-sentence
    // penalty. Byte bounds remain deliberately conservative without pretending
    // that a different model's tokenizer is exact for this provider.
    const outputBound =
        input.kind === 'text-translation'
            ? Buffer.byteLength(input.sourceText, 'utf8') * 2 +
              Buffer.byteLength(
                  JSON.stringify({
                      translation: input.segments.map(({ pairId }) => ({
                          pairId,
                          text: '',
                      })),
                  }),
                  'utf8',
              ) +
              256
            : 256;
    if (
        inputBound >
            Math.min(
                execution.perCallMaxInputTokens,
                budget.maxInputTokensPerAttempt,
            ) ||
        outputBound >
            Math.min(
                execution.perCallMaxOutputTokens,
                budget.maxOutputTokensPerAttempt,
            )
    )
        throw new TextsAiError(
            'model_capacity_exceeded',
            'This text is too long to translate in one action. Shorten the text and try again.',
        );
}
function usageOf(
    value: unknown,
    limits: { maxInputTokens: number; maxOutputTokens: number },
): TextsTokenUsage | undefined {
    if (value === undefined || value === null) return undefined;
    try {
        return readProviderTokenUsage(value, limits);
    } catch {
        throw new TextsProviderInvalidOutputError();
    }
}
export function createTextsAiProvider(options: {
    runtime?: TextAiProviderRuntimeOptions;
    credentials: Partial<
        Record<
            | 'DEEPSEEK_API_KEY'
            | 'KIE_API_KEY'
            | 'EVOLINK_API_KEY'
            | 'OPENROUTER_API_KEY',
            string
        >
    >;
    fetchProvider?: typeof fetch;
}): TextsAiProvider {
    return {
        async run(call) {
            call.signal.throwIfAborted();
            preflightTextsRequest(call.input, call.execution, call.budget);
            const resolved = resolveTextAiProviderOptions({
                ...options.runtime,
                snapshot: call.execution,
                budget: call.budget,
                ...options,
            });
            const limits = textAiRequestLimits({
                aggregate: call.budget,
                model: resolved.modelRequestLimits,
            });
            const agents = createTextsAgents({ model: resolved.model });
            const agent =
                call.input.kind === 'text-translation'
                    ? agents.textTranslationAgent
                    : agents.textDetectionAgent;
            const schema =
                call.input.kind === 'text-translation'
                    ? TextTranslationProviderOutputSchema
                    : TextDetectionResultSchema;
            let result;
            try {
                result = await withQueuedTextAiProviderAttempt(
                    call.providerAttempt,
                    Boolean(call.execution.routingAuthority),
                    () =>
                        agent.generate(JSON.stringify(request(call.input)), {
                            abortSignal: call.signal,
                            maxSteps: 1,
                            modelSettings: {
                                maxOutputTokens: limits.maxOutputTokens,
                                maxRetries: 0,
                            },
                            ...(call.execution.providerId === 'deepseek' &&
                            call.execution.modelId === 'deepseek-flash'
                                ? {
                                      providerOptions: {
                                          openaiCompatible: {
                                              reasoningEffort: 'none',
                                          },
                                      },
                                  }
                                : {}),
                            structuredOutput: {
                                schema,
                                ...(resolved.structuredOutputMode ===
                                'prompt-injection'
                                    ? { jsonPromptInjection: 'inline' as const }
                                    : {}),
                            },
                            runId: call.idempotencyKey,
                            toolChoice: 'none',
                            tracingOptions: {
                                hideInput: true,
                                hideOutput: true,
                            },
                        }),
                );
            } catch (error) {
                if (
                    error &&
                    typeof error === 'object' &&
                    'name' in error &&
                    error.name === 'AI_NoObjectGeneratedError'
                )
                    throw new TextsProviderInvalidOutputError(
                        'usage' in error
                            ? usageOf(error.usage, limits)
                            : undefined,
                    );
                throw new ProviderExecutionError(
                    error,
                    call.execution.providerId,
                );
            }
            call.signal.throwIfAborted();
            const usage = usageOf(result.usage, limits);
            if (
                result.tripwire &&
                result.tripwire.processorId !== 'structured-output'
            )
                throw new TextsAiError('provider_policy_rejected');
            if (result.error)
                throw new ProviderExecutionError(
                    result.error,
                    call.execution.providerId,
                );
            if (result.tripwire || result.finishReason === 'length')
                throw new TextsProviderInvalidOutputError(usage);
            const parsed = schema.safeParse(result.object);
            if (!parsed.success)
                throw new TextsProviderInvalidOutputError(usage);
            return { draft: parsed.data, ...(usage ? { usage } : {}) };
        },
    };
}
/** Injected synthetic fixtures only; worker applies the same production validation. */
export class DeterministicTextsAiProvider implements TextsAiProvider {
    constructor(
        private readonly fixture: (
            input: TextJobInput,
        ) =>
            | ReturnType<TextsAiProvider['run']>
            | Awaited<ReturnType<TextsAiProvider['run']>>,
    ) {}
    async run(call: TextsProviderCall) {
        call.signal.throwIfAborted();
        return this.fixture(call.input);
    }
}
